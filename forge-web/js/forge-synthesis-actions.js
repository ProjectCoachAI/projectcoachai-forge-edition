/**
 * forge-synthesis-actions.js
 * ForgeEmailModal — copies synthesis result to clipboard, ready to paste into any email.
 */
(function(global) {
  'use strict';

  let _overlay = null;
  let _content = '';
  let _subject = '';

  function _ensureModal() {
    if (_overlay) return;
    _overlay = document.createElement('div');
    _overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:10000;display:none;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;';
    _overlay.innerHTML = `
      <div style="background:var(--surface,#1a1a2e);border:1px solid var(--border,rgba(255,255,255,0.12));border-radius:16px;padding:32px;width:100%;max-width:520px;position:relative;">
        <button onclick="ForgeEmailModal.close()" style="position:absolute;top:14px;right:16px;background:none;border:none;color:var(--text-secondary,#888);cursor:pointer;font-size:20px;line-height:1;">&#x2715;</button>
        <h2 style="margin:0 0 6px;font-size:17px;font-weight:600;color:var(--text,#e8e8f0);">&#9993; Email this result</h2>
        <p style="font-size:13px;color:var(--text-secondary,#888);margin:0 0 20px;line-height:1.5;">Copy the subject and content, then paste into any email app.</p>

        <div style="margin-bottom:14px;">
          <label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary,#888);margin-bottom:6px;letter-spacing:.05em;">SUBJECT</label>
          <div style="display:flex;gap:8px;align-items:center;">
            <input id="fem-subject" type="text" readonly
              style="flex:1;padding:10px 14px;background:rgba(255,255,255,0.06);border:1px solid var(--border,rgba(255,255,255,0.12));border-radius:8px;color:var(--text,#e8e8f0);font-size:13px;box-sizing:border-box;outline:none;" />
            <button onclick="ForgeEmailModal._copySubject()"
              style="padding:10px 14px;background:rgba(255,255,255,0.08);border:1px solid var(--border,rgba(255,255,255,0.12));border-radius:8px;color:var(--text,#e8e8f0);font-size:12px;cursor:pointer;white-space:nowrap;">
              Copy
            </button>
          </div>
        </div>

        <div style="margin-bottom:20px;">
          <label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary,#888);margin-bottom:6px;letter-spacing:.05em;">CONTENT</label>
          <div id="fem-preview" style="background:rgba(255,255,255,0.04);border:1px solid var(--border,rgba(255,255,255,0.08));border-radius:8px;padding:12px 14px;font-size:12px;color:var(--text-secondary,#888);height:120px;overflow-y:auto;line-height:1.6;white-space:pre-wrap;"></div>
        </div>

        <button id="fem-copy-btn" onclick="ForgeEmailModal._copyContent()"
          style="width:100%;padding:13px;background:var(--accent,#e8652a);border:none;border-radius:10px;color:#fff;font-size:14px;font-weight:600;cursor:pointer;">
          &#128203; Copy Full Content
        </button>
        <p style="text-align:center;font-size:12px;color:var(--text-secondary,#888);margin:12px 0 0;">Then open your email app and paste.</p>
      </div>`;
    _overlay.addEventListener('click', e => { if (e.target === _overlay) ForgeEmailModal.close(); });
    document.body.appendChild(_overlay);
  }

  const ForgeEmailModal = {
    open(content, subject) {
      _content = content || '';
      _subject = subject || 'Forge Synthesis Result';
      _ensureModal();
      _overlay.style.display = 'flex';
      document.getElementById('fem-subject').value = _subject;
      document.getElementById('fem-preview').textContent = _content.slice(0, 600) + (_content.length > 600 ? '…' : '');
      document.getElementById('fem-copy-btn').textContent = '📋 Copy Full Content';
    },

    close() { if (_overlay) _overlay.style.display = 'none'; },

    _copySubject() {
      navigator.clipboard?.writeText(_subject);
      Forge.showToast('Subject copied!', 'success');
    },

    _copyContent() {
      const full = _content + '\n\n— Sent from ProjectCoachAI Forge\nhttps://forge.projectcoachai.com';
      navigator.clipboard?.writeText(full).then(() => {
        document.getElementById('fem-copy-btn').textContent = '✓ Copied!';
        Forge.showToast('Content copied — paste into your email app', 'success');
        setTimeout(() => {
          if (document.getElementById('fem-copy-btn'))
            document.getElementById('fem-copy-btn').textContent = '📋 Copy Full Content';
        }, 2500);
      });
    },
  };

  global.ForgeEmailModal = ForgeEmailModal;

}(window));
