/**
 * forge-library.js — Forge Library picker modal
 * Include via: <script src="/js/forge-library.js"></script>
 * Provides: openForgeLibraryPicker(context), uploadToForgeLibrary(file)
 */
(function() {
'use strict';

const BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:3001' : 'https://api.projectcoachai.com';

function getToken() { try { return localStorage.getItem('forge_token'); } catch(_) { return null; } }

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
  return (bytes/(1024*1024)).toFixed(1) + ' MB';
}

function getIcon(fileType) {
  if (!fileType) return '📎';
  if (fileType.includes('pdf')) return '📄';
  if (fileType.includes('image')) return '🖼️';
  if (fileType.includes('word') || fileType.includes('docx')) return '📝';
  if (fileType.includes('csv') || fileType.includes('excel') || fileType.includes('sheet')) return '📊';
  return '📎';
}

// Create modal HTML once
function ensureModal() {
  if (document.getElementById('forgeLibraryModal')) return;
  const modal = document.createElement('div');
  modal.id = 'forgeLibraryModal';
  modal.style.cssText = 'display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.7);align-items:center;justify-content:center';
  modal.innerHTML = `
    <div style="background:var(--surface,#14141f);border:1px solid var(--border,#26263a);border-radius:16px;width:90%;max-width:560px;max-height:80vh;display:flex;flex-direction:column;overflow:hidden">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border,#26263a)">
        <div style="font-size:15px;font-weight:700;color:var(--text,#f2f2fa)">📚 Forge Library</div>
        <button onclick="window.closeForgeLibraryPicker()" style="background:none;border:none;color:var(--muted,#9090b4);font-size:18px;cursor:pointer">&times;</button>
      </div>
      <div style="padding:12px 20px;border-bottom:1px solid var(--border,#26263a);display:flex;gap:8px">
        <input id="forgeLibSearchInput" placeholder="Search files..." oninput="window.filterForgeLibrary()" style="flex:1;background:var(--surface2,#18182a);border:1px solid var(--border,#26263a);border-radius:8px;padding:8px 12px;color:var(--text,#f2f2fa);font-size:13px;outline:none"/>
        <label style="display:inline-flex;align-items:center;gap:6px;padding:8px 14px;background:#f97316;color:#fff;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">
          ⬆ Upload
          <input type="file" id="forgeLibUploadInput" style="display:none" accept=".pdf,.docx,.doc,.txt,.csv,.xlsx,.jpg,.jpeg,.png" onchange="window.handleForgeLibUpload(this)"/>
        </label>
      </div>
      <div id="forgeLibraryList" style="flex:1;overflow-y:auto;padding:12px 20px">
        <div style="color:var(--muted,#9090b4);font-size:13px;text-align:center;padding:24px">Loading your library...</div>
      </div>
      <div style="padding:12px 20px;border-top:1px solid var(--border,#26263a);font-size:11px;color:var(--muted,#9090b4)">
        Files saved to your Forge Library are available across Documents, Excel, and Perspectives.
      </div>
    </div>
  `;
  modal.addEventListener('click', function(e) { if (e.target === modal) window.closeForgeLibraryPicker(); });
  document.body.appendChild(modal);
}

var _libContext = '';
var _libFiles = [];

window.openForgeLibraryPicker = async function(context) {
  if (!getToken()) { alert('Please sign in to use Forge Library.'); return; }
  _libContext = context || 'documents';
  ensureModal();
  document.getElementById('forgeLibraryModal').style.display = 'flex';
  await window.loadForgeLibrary();
};

window.closeForgeLibraryPicker = function() {
  var modal = document.getElementById('forgeLibraryModal');
  if (modal) modal.style.display = 'none';
};

window.loadForgeLibrary = async function() {
  var listEl = document.getElementById('forgeLibraryList');
  if (!listEl) return;
  listEl.innerHTML = '<div style="color:var(--muted,#9090b4);font-size:13px;text-align:center;padding:24px">Loading...</div>';
  try {
    const r = await fetch(BASE + '/api/library', {
      headers: { 'Authorization': 'Bearer ' + getToken() }
    });
    const data = await r.json();
    _libFiles = data.files || [];
    window.renderForgeLibrary();
  } catch(e) {
    listEl.innerHTML = '<div style="color:#f97316;font-size:13px;text-align:center;padding:24px">Could not load library.</div>';
  }
};

window.filterForgeLibrary = function() {
  var q = (document.getElementById('forgeLibSearchInput')?.value || '').toLowerCase();
  window.renderForgeLibrary(q);
};

window.renderForgeLibrary = function(query) {
  var listEl = document.getElementById('forgeLibraryList');
  if (!listEl) return;
  var files = query ? _libFiles.filter(f => f.filename.toLowerCase().includes(query)) : _libFiles;
  if (!files.length) {
    listEl.innerHTML = '<div style="color:var(--muted,#9090b4);font-size:13px;text-align:center;padding:24px">' +
      (query ? 'No files match your search.' : 'Your library is empty. Upload a file to get started.') + '</div>';
    return;
  }
  listEl.innerHTML = files.map(function(f) {
    var date = new Date(f.created_at).toLocaleDateString();
    return '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;border:1px solid var(--border,#26263a);margin-bottom:8px;cursor:pointer;transition:all .15s" ' +
      'onmouseover="this.style.borderColor=\'#f97316\'" onmouseout="this.style.borderColor=\'var(--border,#26263a)\'" ' +
      'onclick="window.selectForgeLibFile(\'' + f.file_id + '\')">' +
      '<span style="font-size:20px">' + getIcon(f.file_type) + '</span>' +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-size:13px;font-weight:600;color:var(--text,#f2f2fa);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + f.filename + '</div>' +
        '<div style="font-size:11px;color:var(--muted,#9090b4)">' + formatSize(f.file_size) + ' &middot; ' + date + '</div>' +
      '</div>' +
      '<button onclick="event.stopPropagation();window.deleteForgeLibFile(\'' + f.file_id + '\')" style="background:none;border:none;color:var(--muted,#9090b4);cursor:pointer;font-size:14px;padding:4px" title="Delete">\u{1F5D1}</button>' +
    '</div>';
  }).join('');
};

window.selectForgeLibFile = async function(fileId) {
  var listEl = document.getElementById('forgeLibraryList');
  if (listEl) listEl.innerHTML = '<div style="color:var(--muted,#9090b4);font-size:13px;text-align:center;padding:24px">Loading file...</div>';
  try {
    const r = await fetch(BASE + '/api/library/' + fileId, {
      headers: { 'Authorization': 'Bearer ' + getToken() }
    });
    const data = await r.json();
    if (!data.success || !data.file) throw new Error('File not found');
    const file = data.file;
    window.closeForgeLibraryPicker();
    // Dispatch to the correct handler based on context
    if (typeof window.handleForgeLibraryFile === 'function') {
      window.handleForgeLibraryFile(file, _libContext);
    }
  } catch(e) {
    if (listEl) listEl.innerHTML = '<div style="color:#f97316;font-size:13px;text-align:center;padding:24px">Could not load file: ' + e.message + '</div>';
  }
};

window.deleteForgeLibFile = async function(fileId) {
  if (!confirm('Delete this file from your library?')) return;
  try {
    await fetch(BASE + '/api/library/' + fileId, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + getToken() }
    });
    _libFiles = _libFiles.filter(f => f.file_id !== fileId);
    window.renderForgeLibrary();
  } catch(e) {
    alert('Could not delete file.');
  }
};

window.handleForgeLibUpload = async function(input) {
  var file = input.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { alert('File too large. Maximum size is 10MB.'); return; }
  var listEl = document.getElementById('forgeLibraryList');
  if (listEl) listEl.innerHTML = '<div style="color:var(--muted,#9090b4);font-size:13px;text-align:center;padding:24px">Uploading ' + file.name + '...</div>';
  try {
    const reader = new FileReader();
    reader.onload = async function(e) {
      const fileData = e.target.result; // base64 data URL
      const r = await fetch(BASE + '/api/library/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
        body: JSON.stringify({ filename: file.name, fileType: file.type, fileData: fileData })
      });
      const data = await r.json();
      if (data.success) {
        _libFiles.unshift(data.file);
        window.renderForgeLibrary();
        if (typeof Forge !== 'undefined') Forge.showToast(file.name + ' saved to Library!', 'success');
      } else {
        throw new Error(data.error || 'Upload failed');
      }
    };
    reader.readAsDataURL(file);
  } catch(e) {
    if (listEl) listEl.innerHTML = '<div style="color:#f97316;font-size:13px;text-align:center;padding:24px">Upload failed: ' + e.message + '</div>';
  }
};

})();
