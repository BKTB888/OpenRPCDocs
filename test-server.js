#!/usr/bin/env node
// Dev/test helper for the OpenRPC viewer's rpc.discover support.
// Zero dependencies — pure Node built-ins. Run: node test-server.js
//
// Serves the viewer and exercises all three loading paths:
//   GET  /openrpc.json  -> static OpenRPC spec      (static-GET path)
//   POST /rpc           -> JSON-RPC rpc.discover     (HTTP POST fallback)
//   ws   /rpc           -> JSON-RPC rpc.discover     (WebSocket path)

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = 8787;

// Static files served from the project dir (the viewer is index.html + app.js + style.css).
const STATIC = {
  '/':           { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/index.html': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/app.js':     { file: 'app.js',     type: 'application/javascript; charset=utf-8' },
  '/style.css':  { file: 'style.css',  type: 'text/css; charset=utf-8' }
};

// A minimal, valid OpenRPC document so the rendered output is visibly correct.
const SAMPLE_SPEC = {
  openrpc: '1.3.2',
  info: {
    title: 'Test rpc.discover API',
    version: '1.0.0',
    description: 'Served locally by test-server.js to exercise the viewer.'
  },
  methods: [
    {
      name: 'greet',
      description: 'Returns a greeting for the given name.',
      params: [
        { name: 'name', required: true, schema: { type: 'string' } }
      ],
      result: { name: 'greeting', schema: { type: 'string' } }
    },
    {
      name: 'add',
      description: 'Adds two integers.',
      params: [
        { name: 'a', required: true, schema: { type: 'integer' } },
        { name: 'b', required: true, schema: { type: 'integer' } }
      ],
      result: { name: 'sum', schema: { type: 'integer' } }
    }
  ]
};

function send(res, status, type, body) {
  res.writeHead(status, {
    'Content-Type': type,
    'Access-Control-Allow-Origin': '*'
  });
  res.end(body);
}

function handleDiscover(reqObj) {
  if (reqObj && reqObj.method === 'rpc.discover') {
    return { jsonrpc: '2.0', id: reqObj.id ?? 1, result: SAMPLE_SPEC };
  }
  return {
    jsonrpc: '2.0',
    id: (reqObj && reqObj.id) ?? null,
    error: { code: -32601, message: 'Method not found' }
  };
}

// ── HTTP server ────────────────────────────────
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  console.log(`[http] ${req.method} ${url}`);

  if (req.method === 'GET' && STATIC[url]) {
    const { file, type } = STATIC[url];
    fs.readFile(path.join(__dirname, file), (err, data) => {
      if (err) return send(res, 500, 'text/plain', 'Cannot read ' + file);
      send(res, 200, type, data);
    });
    return;
  }

  if (req.method === 'GET' && url === '/openrpc.json') {
    send(res, 200, 'application/json', JSON.stringify(SAMPLE_SPEC));
    return;
  }

  // GET /rpc deliberately returns a non-spec body so the viewer's
  // looksLikeOpenRpc() check fails and it retries with a POST rpc.discover.
  if (req.method === 'GET' && url === '/rpc') {
    send(res, 200, 'application/json', JSON.stringify({ status: 'ok' }));
    return;
  }

  if (req.method === 'POST' && url === '/rpc') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      let reqObj = null;
      try { reqObj = JSON.parse(body); } catch (e) {}
      send(res, 200, 'application/json', JSON.stringify(handleDiscover(reqObj)));
    });
    return;
  }

  send(res, 404, 'text/plain', 'Not found');
});

// ── WebSocket (RFC 6455) on /rpc ───────────────
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

server.on('upgrade', (req, socket) => {
  const url = req.url.split('?')[0];
  if (url !== '/rpc') { socket.destroy(); return; }
  console.log('[ws]   upgrade /rpc');

  const key = req.headers['sec-websocket-key'];
  const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
  );

  socket.on('data', (buf) => {
    const frame = decodeFrame(buf);
    if (!frame) return;
    if (frame.opcode === 0x8) { socket.end(); return; }      // close
    if (frame.opcode !== 0x1) return;                        // only text
    let reqObj = null;
    try { reqObj = JSON.parse(frame.payload.toString('utf8')); } catch (e) {}
    console.log('[ws]   recv', reqObj && reqObj.method);
    socket.write(encodeTextFrame(JSON.stringify(handleDiscover(reqObj))));
  });

  socket.on('error', () => socket.destroy());
});

// Decode a single client frame (always masked). Handles 7-bit and 16-bit
// length forms — enough for the sample spec (< 64 KiB).
function decodeFrame(buf) {
  if (buf.length < 2) return null;
  const opcode = buf[0] & 0x0f;
  const masked = (buf[1] & 0x80) !== 0;
  let len = buf[1] & 0x7f;
  let offset = 2;
  if (len === 126) { len = buf.readUInt16BE(2); offset = 4; }
  else if (len === 127) { len = Number(buf.readBigUInt64BE(2)); offset = 10; }
  let payload;
  if (masked) {
    const mask = buf.slice(offset, offset + 4);
    offset += 4;
    payload = Buffer.alloc(len);
    for (let i = 0; i < len; i++) payload[i] = buf[offset + i] ^ mask[i & 3];
  } else {
    payload = buf.slice(offset, offset + len);
  }
  return { opcode, payload };
}

// Encode an unmasked server text frame (single frame, FIN set).
function encodeTextFrame(str) {
  const data = Buffer.from(str, 'utf8');
  const len = data.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x81, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81; header[1] = 126; header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, data]);
}

server.listen(PORT, () => {
  console.log(`OpenRPC test server running at http://localhost:${PORT}\n`);
  console.log('Open the viewer:        http://localhost:' + PORT);
  console.log('Then load any of these in the URL tab:');
  console.log('  static GET   ->  http://localhost:' + PORT + '/openrpc.json');
  console.log('  HTTP POST    ->  http://localhost:' + PORT + '/rpc');
  console.log('  WebSocket    ->  ws://localhost:' + PORT + '/rpc');
  console.log('\nCtrl+C to stop.');
});
