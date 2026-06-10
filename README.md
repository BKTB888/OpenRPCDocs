# OpenRPC Viewer

A sleek, dark-themed documentation viewer for [OpenRPC](https://open-rpc.org/) specs — built as a single HTML file, no dependencies required.

## 🌐 Live Site

[https://bktb888.github.io/OpenRPCDocs](https://bktb888.github.io/OpenRPCDocs)

---

## ✨ Features

- **Deep link to any spec** — share a direct URL that auto-loads a spec on open
- **Three ways to load a spec** — fetch from a URL, paste raw JSON, or drag & drop a `.json` file
- **Live service discovery** — point the URL field at a running JSON-RPC server and the viewer calls `rpc.discover` to fetch its OpenRPC document, over both HTTP and WebSocket
- **Auto-renders methods** — displays each JSON-RPC method with its parameters, types, required/optional status, and return value
- **Component schema browser** — renders all `components.schemas` entries with their properties and types
- **Recently loaded** — remembers URLs you've loaded before via `localStorage`
- **Zero dependencies** — single self-contained `index.html` file, no build step needed

---

## 🚀 Usage

### Option 1 — Load from URL
Enter a URL and click **Load**. The viewer auto-detects what it's pointing at:

| URL | Behavior |
|---|---|
| `http(s)://…openrpc.json` | Fetches the static spec file. |
| `http(s)://…/bucket/prefix/` | Detects an S3/MinIO bucket listing and shows a browsable tree. |
| `http(s)://…/rpc` | If it isn't a static spec or bucket, falls back to a JSON-RPC `rpc.discover` `POST`. |
| `ws://` / `wss://` | Opens a WebSocket and sends a JSON-RPC `rpc.discover` request, then renders the returned document. |

> Note: the remote server must allow CORS (for HTTP) or accept the WebSocket origin. If it doesn't, use the Paste or File tab instead. Browsers can't send custom auth headers on these requests.

### Option 2 — Paste JSON
Paste your OpenRPC spec directly into the text area and click **Parse & View**.

### Option 3 — File
Drop or select a local `.json` file.

### Option 4 — Deep Link
Auto-load a spec by passing a `url` parameter directly in the link. Two formats are supported:

| Format       | Example                                                                      |
|--------------|------------------------------------------------------------------------------|
| Query string | `https://bktb888.github.io/OpenRPCDocs?url=https://example.com/openrpc.json` |
| Hash         | `https://bktb888.github.io/OpenRPCDocs#url=https://example.com/openrpc.json` |

---

## 📋 OpenRPC Spec Format

The viewer expects a valid [OpenRPC 1.x](https://spec.open-rpc.org/) document:

```json
{
  "openrpc": "1.3.2",
  "info": {
    "title": "My API",
    "version": "1.0.0",
    "description": "Optional description"
  },
  "methods": [
    {
      "name": "myMethod",
      "description": "Does something useful",
      "params": [
        {
          "name": "id",
          "required": true,
          "schema": { "type": "integer" }
        }
      ],
      "result": {
        "name": "result",
        "schema": { "type": "string" }
      }
    }
  ]
}
```

---

## 🎨 Tech Stack

- **IBM Plex Mono** & **Syne** — Google Fonts
- Vanilla HTML, CSS, and JavaScript — no frameworks or build tools