// ══════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════
let currentSpecUrl   = null; // URL of the currently loaded spec (null = paste/file)
let currentBucketUrl = null; // Root bucket URL when browsing a bucket
let activeTreeFile   = null; // Currently highlighted tree file element

// ══════════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════════
function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeId(str) {
  return String(str).replace(/[^a-zA-Z0-9_-]/g, '_');
}

function showError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.add('show');
}

function clearError(id) {
  const el = document.getElementById(id);
  el.textContent = '';
  el.classList.remove('show');
}

function setSidebarHeader({ title, sub, badge }) {
  document.getElementById('sidebar-title').textContent = title;
  document.getElementById('sidebar-sub').textContent   = sub;
  document.getElementById('sidebar-badge').textContent = badge;
}

function showSidebarPanel(name) {
  document.querySelectorAll('.sidebar-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-' + name).classList.add('active');
}

function placeholder(icon, msg, color) {
  return `<div class="main-placeholder" ${color ? `style="color:${color}"` : ''}>
    <div class="main-placeholder-icon">${icon}</div>${escHtml(msg)}
  </div>`;
}

// ══════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════
function showLanding() {
  currentSpecUrl   = null;
  currentBucketUrl = null;
  activeTreeFile   = null;
  document.getElementById('landing').style.display = 'flex';
  document.getElementById('docs').classList.remove('visible');
  document.title = 'OpenRPC Viewer';
}

function handleBack() {
  if (currentBucketUrl) {
    currentSpecUrl = null;
    updateShareBtn();
    showSidebarPanel('tree');
    document.getElementById('main-content').innerHTML = placeholder('📂', 'Select a spec from the tree to view its docs');
    if (activeTreeFile) { activeTreeFile.classList.remove('active'); activeTreeFile = null; }
    const parsed = parseBucketUrl(currentBucketUrl);
    if (parsed) setSidebarHeader({ title: parsed.bucket, sub: 'S3 Bucket', badge: parsed.prefix || '/' });
  } else {
    showLanding();
  }
}

// ══════════════════════════════════════════════
// SHARE
// ══════════════════════════════════════════════
function copyShareLink() {
  const base = window.location.origin + window.location.pathname;
  let shareUrl;
  if (currentBucketUrl) {
    shareUrl = base + '?bucket=' + encodeURIComponent(currentBucketUrl);
  } else if (currentSpecUrl) {
    shareUrl = base + '?url=' + encodeURIComponent(currentSpecUrl);
  } else {
    return;
  }

  navigator.clipboard.writeText(shareUrl)
    .then(() => flashShareBtn('Copied!'))
    .catch(() => prompt('Copy this shareable link:', shareUrl));
}

function flashShareBtn(label) {
  const btn   = document.getElementById('share-btn');
  const span  = document.getElementById('share-btn-label');
  btn.classList.add('copied');
  span.textContent = label;
  setTimeout(() => { btn.classList.remove('copied'); span.textContent = 'Share'; }, 2000);
}

function updateShareBtn() {
  const btn = document.getElementById('share-btn');
  const active = currentSpecUrl || currentBucketUrl;
  btn.toggleAttribute('disabled', !active);
  btn.title = currentBucketUrl
    ? 'Copy shareable link to this bucket'
    : currentSpecUrl
      ? 'Copy shareable link to this spec'
      : 'Share is only available when a spec or bucket is loaded';
}

// ══════════════════════════════════════════════
// LANDING TABS
// ══════════════════════════════════════════════
document.querySelectorAll('.load-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const name = tab.dataset.tab;
    document.querySelectorAll('.load-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.load-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + name).classList.add('active');
  });
});

// ══════════════════════════════════════════════
// FILE DROP
// ══════════════════════════════════════════════
const fileDrop = document.getElementById('file-drop');
fileDrop.addEventListener('dragover',  e => { e.preventDefault(); fileDrop.classList.add('dragover'); });
fileDrop.addEventListener('dragleave', ()  => fileDrop.classList.remove('dragover'));
fileDrop.addEventListener('drop', e => {
  e.preventDefault();
  fileDrop.classList.remove('dragover');
  const f = e.dataTransfer.files[0];
  if (f) readFile(f);
});

// ══════════════════════════════════════════════
// LOADERS
// ══════════════════════════════════════════════
async function loadFromUrl() {
  clearError('url-error');
  const url = document.getElementById('url-input').value.trim();
  if (!url) { showError('url-error', 'Please enter a URL.'); return; }
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const spec = await res.json();
    currentSpecUrl   = url;
    currentBucketUrl = null;
    saveRecent(spec, url);
    renderDocs(spec, 'url');
  } catch (e) {
    showError('url-error', 'Failed to load: ' + e.message + '. (CORS may block cross-origin requests — try Paste or File tab.)');
  }
}

function loadFromPaste() {
  clearError('paste-error');
  const raw = document.getElementById('paste-input').value.trim();
  if (!raw) { showError('paste-error', 'Paste your OpenRPC JSON above.'); return; }
  try {
    currentSpecUrl = currentBucketUrl = null;
    renderDocs(JSON.parse(raw), 'url');
  } catch (e) {
    showError('paste-error', 'Invalid JSON: ' + e.message);
  }
}

function loadFromFile(input) {
  clearError('file-error');
  if (input.files[0]) readFile(input.files[0]);
}

function readFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      currentSpecUrl = currentBucketUrl = null;
      renderDocs(JSON.parse(e.target.result), 'url');
    } catch (err) {
      showError('file-error', 'Invalid JSON: ' + err.message);
    }
  };
  reader.readAsText(file);
}

document.getElementById('url-input').addEventListener('keydown',    e => { if (e.key === 'Enter') loadFromUrl(); });
document.getElementById('bucket-input').addEventListener('keydown', e => { if (e.key === 'Enter') loadBucket(); });

// ══════════════════════════════════════════════
// RECENT HISTORY
// ══════════════════════════════════════════════
const RECENT_KEY        = 'openrpc_recent';
const RECENT_BUCKETS_KEY = 'openrpc_recent_buckets';

function saveRecent(spec, url) {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    const entry = {
      title:   spec.info?.title   || 'Untitled',
      version: spec.info?.version || '?',
      url,
    };
    const updated = [entry, ...list.filter(i => i.url !== url)].slice(0, 5);
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
    renderRecent();
  } catch(e) {}
}

function renderRecent() {
  try {
    const list      = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    const section   = document.getElementById('recent-section');
    const container = document.getElementById('recent-list');
    if (!list.length) { section.style.display = 'none'; return; }
    section.style.display = 'block';
    container.innerHTML = list.map((item, i) =>
      `<div class="recent-item" data-i="${i}">
        <span class="recent-item-name">${escHtml(item.title)}</span>
        <span class="recent-item-ver">v${escHtml(item.version)}</span>
      </div>`
    ).join('');
    container.querySelectorAll('.recent-item').forEach(el => {
      el.addEventListener('click', () => {
        const item = list[+el.dataset.i];
        if (item) { document.getElementById('url-input').value = item.url; loadFromUrl(); }
      });
    });
  } catch(e) {}
}

renderRecent();

function saveRecentBucket(url, bucket) {
  try {
    const list    = JSON.parse(localStorage.getItem(RECENT_BUCKETS_KEY) || '[]');
    const entry   = { url, name: bucket };
    const updated = [entry, ...list.filter(i => i.url !== url)].slice(0, 5);
    localStorage.setItem(RECENT_BUCKETS_KEY, JSON.stringify(updated));
    renderRecentBuckets();
  } catch(e) {}
}

function renderRecentBuckets() {
  try {
    const list      = JSON.parse(localStorage.getItem(RECENT_BUCKETS_KEY) || '[]');
    const section   = document.getElementById('recent-buckets-section');
    const container = document.getElementById('recent-buckets-list');
    if (!list.length) { section.style.display = 'none'; return; }
    section.style.display = 'block';
    container.innerHTML = list.map((item, i) =>
      `<div class="recent-item" data-i="${i}">
        <span class="recent-item-name">${escHtml(item.name)}</span>
        <span class="recent-item-ver">bucket</span>
      </div>`
    ).join('');
    container.querySelectorAll('.recent-item').forEach(el => {
      el.addEventListener('click', () => {
        const item = list[+el.dataset.i];
        if (item) { document.getElementById('bucket-input').value = item.url; loadBucket(); }
      });
    });
  } catch(e) {}
}

renderRecentBuckets();

// ══════════════════════════════════════════════
// BUCKET BROWSER
// ══════════════════════════════════════════════

// Parse http://host:port/bucket/optional/prefix/ into parts
function parseBucketUrl(raw) {
  try {
    const url    = new URL(raw.trim().endsWith('/') ? raw.trim() : raw.trim() + '/');
    const parts  = url.pathname.replace(/^\//, '').split('/').filter(Boolean);
    if (!parts.length) return null;
    return {
      endpoint: url.origin,
      bucket:   parts[0],
      prefix:   parts.length > 1 ? parts.slice(1).join('/') + '/' : '',
    };
  } catch(e) { return null; }
}

// Fetch S3 ListObjectsV2 XML and return { folders, files }
async function listObjects(endpoint, bucket, prefix) {
  const url = `${endpoint}/${bucket}?list-type=2&delimiter=%2F${prefix ? '&prefix=' + encodeURIComponent(prefix) : ''}`;
  const res  = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status + ' from bucket');
  const xml  = new DOMParser().parseFromString(await res.text(), 'application/xml');
  return {
    folders: Array.from(xml.querySelectorAll('CommonPrefixes Prefix')).map(el => el.textContent),
    files:   Array.from(xml.querySelectorAll('Contents Key'))
               .map(el => el.textContent)
               .filter(key => key !== prefix && key.endsWith('.json')),
  };
}

async function loadBucket() {
  clearError('bucket-error');
  const raw    = document.getElementById('bucket-input').value.trim();
  if (!raw) { showError('bucket-error', 'Please enter a bucket URL.'); return; }

  const parsed = parseBucketUrl(raw);
  if (!parsed) { showError('bucket-error', 'Could not parse URL. Format: http://host:port/bucket/optional-prefix/'); return; }

  const { endpoint, bucket, prefix } = parsed;

  currentBucketUrl = raw;
  currentSpecUrl   = null;

  document.getElementById('landing').style.display = 'none';
  document.getElementById('docs').classList.add('visible');
  document.getElementById('bucket-url-display').textContent = `${endpoint}/${bucket}/${prefix}`;
  setSidebarHeader({ title: bucket, sub: 'S3 Bucket', badge: prefix || '/' });
  updateShareBtn();
  showSidebarPanel('tree');
  document.getElementById('main-content').innerHTML = placeholder('📂', 'Select a spec from the tree to view its docs');

  const treeEl = document.getElementById('bucket-tree');
  treeEl.innerHTML = '<div class="tree-loading">Loading…</div>';

  try {
    const root = await listObjects(endpoint, bucket, prefix);
    treeEl.innerHTML = '';
    renderTreeLevel(treeEl, root, endpoint, bucket);
    saveRecentBucket(raw, bucket);
  } catch(e) {
    treeEl.innerHTML = `<div class="tree-error">Failed to list bucket: ${escHtml(e.message)}<br><br>Check the URL and that the bucket is publicly readable.</div>`;
  }
}

// Recursively build the folder/file tree — subfolders are lazy-loaded on expand
function renderTreeLevel(container, listing, endpoint, bucket) {
  listing.folders.forEach(folderPrefix => {
    const name     = folderPrefix.replace(/\/$/, '').split('/').pop();
    const folder   = document.createElement('div');
    folder.className = 'tree-folder';

    const header   = document.createElement('div');
    header.className = 'tree-folder-header';
    header.innerHTML = `<span class="tree-folder-icon">▶</span><span class="tree-folder-name">${escHtml(name)}</span>`;

    const children = document.createElement('div');
    children.className = 'tree-children';

    let loaded = false;
    header.addEventListener('click', async () => {
      folder.classList.toggle('open');
      if (loaded) return;
      loaded = true;
      children.innerHTML = '<div class="tree-loading">Loading…</div>';
      try {
        const sub = await listObjects(endpoint, bucket, folderPrefix);
        children.innerHTML = '';
        renderTreeLevel(children, sub, endpoint, bucket);
        if (!children.children.length) {
          children.innerHTML = '<div class="tree-loading" style="font-style:italic">Empty folder</div>';
        }
      } catch(e) {
        children.innerHTML = `<div class="tree-error">${escHtml(e.message)}</div>`;
      }
    });

    folder.append(header, children);
    container.appendChild(folder);
  });

  listing.files.forEach(key => {
    const filename = key.split('/').pop();
    const fileEl   = document.createElement('div');
    fileEl.className = 'tree-file';
    fileEl.innerHTML = `<span class="tree-file-icon">◆</span><span>${escHtml(filename)}</span>`;

    fileEl.addEventListener('click', async () => {
      if (activeTreeFile) activeTreeFile.classList.remove('active');
      activeTreeFile = fileEl;
      fileEl.classList.add('active');

      const { endpoint: ep } = parseBucketUrl(document.getElementById('bucket-input').value);
      const fileUrl = `${ep}/${bucket}/${key}`;
      currentSpecUrl = fileUrl;
      updateShareBtn();

      document.getElementById('main-content').innerHTML = placeholder('⏳', `Loading ${filename}…`);

      try {
        const res  = await fetch(fileUrl);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const spec = await res.json();
        saveRecent(spec, fileUrl);
        renderDocs(spec, 'bucket');
      } catch(e) {
        document.getElementById('main-content').innerHTML = placeholder('✗', e.message, 'var(--accent2)');
      }
    });

    container.appendChild(fileEl);
  });
}

// ══════════════════════════════════════════════
// SCHEMA HELPERS
// ══════════════════════════════════════════════
function resolveRef(ref, components) {
  if (!ref) return null;
  const name = ref.split('/').pop();
  return components?.schemas?.[name] ?? null;
}

function resolveSchema(schema, components) {
  if (!schema) return null;
  return schema.$ref ? resolveSchema(resolveRef(schema.$ref, components), components) : schema;
}

function typeLabel(schema, components) {
  if (!schema) return 'any';
  if (schema.$ref) return schema.$ref.split('/').pop();
  if (schema.type === 'array' && schema.items)
    return 'array&lt;' + typeLabel(schema.items, components) + '&gt;';
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const base  = types.filter(Boolean).join(' | ') || 'any';
  return base + (schema.format ? ` (${schema.format})` : '');
}

function renderSchemaProps(schema, components) {
  const resolved = resolveSchema(schema, components);
  if (!resolved?.properties || resolved.type !== 'object') return null;
  const required = resolved.required || [];
  const rows = Object.entries(resolved.properties).map(([k, v]) => {
    const req = required.includes(k);
    return `<tr>
      <td class="param-name">${escHtml(k)}</td>
      <td><span class="param-type">${typeLabel(v, components)}</span></td>
      <td class="${req ? 'param-req' : 'param-opt'}">${req ? 'required' : 'optional'}</td>
    </tr>`;
  }).join('');
  return `<table class="params-table">
    <thead><tr><th>Field</th><th>Type</th><th>Required</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ══════════════════════════════════════════════
// RENDER DOCS
// mode: 'url'    → show method nav in sidebar
// mode: 'bucket' → keep tree in sidebar
// ══════════════════════════════════════════════
function renderDocs(spec, mode) {
  if (!spec.openrpc || !spec.info || !spec.methods) {
    alert('Not a valid OpenRPC spec — missing openrpc, info, or methods fields.');
    return;
  }

  const title      = spec.info.title       || 'Untitled API';
  const version    = spec.info.version     || '?';
  const desc       = spec.info.description || '';
  const components = spec.components       || {};
  const methods    = spec.methods          || [];
  const schemas    = components.schemas    || {};

  document.title = `${title} — OpenRPC Viewer`;

  setSidebarHeader({
    title,
    sub:   'OpenRPC ' + spec.openrpc,
    badge: mode === 'bucket' ? `v${version}` : `v${version} · OpenRPC ${spec.openrpc}`,
  });

  if (mode === 'bucket') {
    // Keep tree visible — only update the header
  } else {
    const nav = document.getElementById('sidebar-nav');
    nav.innerHTML =
      '<div class="nav-section">Methods</div>' +
      methods.map(m =>
        `<a class="nav-item" href="#m-${safeId(m.name)}"><span class="nav-dot"></span>${escHtml(m.name)}</a>`
      ).join('') +
      (Object.keys(schemas).length
        ? '<div class="nav-section" style="margin-top:12px">Schemas</div>' +
          '<a class="nav-item" href="#schemas"><span class="nav-dot schema-dot"></span>Component Schemas</a>'
        : '');
    showSidebarPanel('nav');
  }

  updateShareBtn();

  // ── Page header
  let html = `
    <div class="page-header">
      <h1>${escHtml(title)} <span>API</span></h1>
      ${desc ? `<p class="page-desc">${escHtml(desc)}</p>` : ''}
      <div class="tag-row">
        <span class="tag tag-rpc">JSON-RPC 2.0</span>
        <span class="tag tag-info">OpenRPC ${escHtml(spec.openrpc)}</span>
        <span class="tag tag-info">v${escHtml(version)}</span>
      </div>
    </div>
    <div class="methods">`;

  methods.forEach((method, idx) => {
    const params     = method.params || [];
    const result     = method.result;
    const methodDesc = method.description || method.summary || '';

    // Params
    let paramsHtml;
    if (!params.length) {
      paramsHtml = '<p class="no-params">No parameters required.</p>';
    } else {
      const rows = params.map(p => {
        const schema = p.schema || {};
        const req    = p.required !== false;
        const pdesc  = p.description || schema.description || '';
        return `<tr>
          <td class="param-name">${escHtml(p.name)}</td>
          <td><span class="param-type">${typeLabel(schema, components)}</span></td>
          <td class="${req ? 'param-req' : 'param-opt'}">${req ? 'required' : 'optional'}</td>
          <td style="font-size:0.68rem;color:var(--muted)">${escHtml(pdesc)}</td>
        </tr>`;
      }).join('');
      paramsHtml = `<table class="params-table">
        <thead><tr><th>Name</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
    }

    // Result
    let resultHtml = '';
    if (result) {
      const rName      = result.schema?.$ref?.split('/').pop() || '';
      const label      = rName ? `Returns &#8212; ${rName}` : 'Returns';
      const propsTable = renderSchemaProps(result.schema, components);
      if (propsTable) {
        resultHtml = `<div class="section-label">${label}</div>${propsTable}`;
      } else {
        const rSchema = resolveSchema(result.schema, components);
        if (rSchema) {
          const req = result.required !== false;
          resultHtml = `
            <div class="section-label">${label}</div>
            <div class="schema-block"><div class="schema-prop">
              <span class="schema-key">result</span>
              <span class="schema-type-label">${typeLabel(rSchema, components)}</span>
              ${req ? '<span class="schema-req-mark">required</span>' : '<span class="param-opt">optional</span>'}
            </div></div>`;
        }
      }
    }

    html += `
      <div class="method-card${idx === 0 ? ' open' : ''}" id="m-${safeId(method.name)}" style="animation-delay:${idx * 0.04}s">
        <div class="method-header" onclick="toggleCard(this)">
          <div class="method-left">
            <span class="method-badge">RPC</span>
            <span class="method-name">${escHtml(method.name)}</span>
          </div>
          <span class="chevron">&#9660;</span>
        </div>
        <div class="method-body">
          ${methodDesc ? `<p class="method-desc">${escHtml(methodDesc)}</p>` : ''}
          <div class="section-label">Parameters</div>
          ${paramsHtml}
          ${resultHtml}
        </div>
      </div>`;
  });

  html += '</div>'; // /methods

  // Component schemas
  if (Object.keys(schemas).length) {
    html += '<div class="schemas-section" id="schemas"><h2>Component Schemas</h2>';
    Object.entries(schemas).forEach(([name, schema], idx) => {
      const propsTable = renderSchemaProps(schema, components);
      html += `
        <div class="schema-card" id="schema-${safeId(name)}" style="animation-delay:${idx * 0.04}s">
          <div class="schema-card-name">${escHtml(name)}</div>
          ${propsTable || `<p style="font-size:0.7rem;color:var(--muted)"><span class="param-type">${typeLabel(schema, components)}</span></p>`}
        </div>`;
    });
    html += '</div>';
  }

  document.getElementById('main-content').innerHTML = html;
  document.getElementById('landing').style.display = 'none';
  document.getElementById('docs').classList.add('visible');
  setupScrollTracking();
}

// ══════════════════════════════════════════════
// SCROLL TRACKING
// ══════════════════════════════════════════════
function setupScrollTracking() {
  // Replace element to drop any stale scroll listeners
  const old   = document.getElementById('main-content');
  const fresh = old.cloneNode(true);
  old.parentNode.replaceChild(fresh, old);

  fresh.addEventListener('scroll', () => {
    let current = '';
    fresh.querySelectorAll('[id]').forEach(el => {
      if (el.getBoundingClientRect().top < 140) current = el.id;
    });
    document.querySelectorAll('#sidebar-nav .nav-item').forEach(l => {
      l.classList.toggle('active', l.getAttribute('href') === '#' + current);
    });
  }, { passive: true });

  document.querySelectorAll('#sidebar-nav .nav-item').forEach(l => {
    l.addEventListener('click', e => {
      e.preventDefault();
      document.getElementById(l.getAttribute('href').slice(1))
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

function toggleCard(header) {
  header.closest('.method-card').classList.toggle('open');
}

// ══════════════════════════════════════════════
// AUTO-LOAD FROM URL PARAMS
// ══════════════════════════════════════════════
(function() {
  const sp  = new URLSearchParams(window.location.search);
  const hp  = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const get = key => sp.get(key) || hp.get(key);

  const specUrl   = get('url');
  const bucketUrl = get('bucket');

  if (specUrl) {
    document.getElementById('url-input').value = specUrl;
    loadFromUrl();
  } else if (bucketUrl) {
    document.getElementById('bucket-input').value = bucketUrl;
    loadBucket();
  }
})();