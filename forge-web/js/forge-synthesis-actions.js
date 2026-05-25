/**
 * forge-synthesis-actions.js
 * ForgeEmailModal — sends synthesis results via Forge (Resend).
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
      <div style="background:var(--surface,#1a1a2e);border:1px solid var(--border,rgba(255,255,255,0.12));border-radius:16px;padding:32px;width:100%;max-width:500px;position:relative;">
        <button onclick="ForgeEmailModal.close()" style="position:absolute;top:14px;right:16px;background:none;border:none;color:var(--text-secondary,#888);cursor:pointer;font-size:20px;line-height:1;">&#x2715;</button>
        <h2 style="margin:0 0 6px;font-size:17px;font-weight:600;color:var(--text,#e8e8f0);">&#9993; Email this result</h2>
        <p style="font-size:13px;color:var(--text-secondary,#888);margin:0 0 22px;line-height:1.5;">Send this result directly to any email address.</p>
        <div style="margin-bottom:14px;">
          <label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary,#888);margin-bottom:6px;letter-spacing:.05em;">TO</label>
          <input id="fem-to" type="email" placeholder="colleague@example.com"
            style="width:100%;padding:10px 14px;background:rgba(255,255,255,0.06);border:1px solid var(--border,rgba(255,255,255,0.12));border-radius:8px;color:var(--text,#e8e8f0);font-size:14px;box-sizing:border-box;outline:none;" />
        </div>
        <div style="margin-bottom:22px;">
          <label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary,#888);margin-bottom:6px;letter-spacing:.05em;">SUBJECT</label>
          <input id="fem-subject" type="text"
            style="width:100%;padding:10px 14px;background:rgba(255,255,255,0.06);border:1px solid var(--border,rgba(255,255,255,0.12));border-radius:8px;color:var(--text,#e8e8f0);font-size:14px;box-sizing:border-box;outline:none;" />
        </div>
        <div id="fem-err" style="display:none;color:#ef4444;font-size:13px;margin-bottom:12px;"></div>
        <div style="display:flex;gap:10px;">
          <button id="fem-send" onclick="ForgeEmailModal._send()"
            style="flex:1;padding:13px;background:var(--accent,#e8652a);border:none;border-radius:10px;color:#fff;font-size:14px;font-weight:600;cursor:pointer;">
            Send
          </button>
          <button onclick="ForgeEmailModal.close()"
            style="padding:13px 20px;background:rgba(255,255,255,0.06);border:1px solid var(--border,rgba(255,255,255,0.12));border-radius:10px;color:var(--text-secondary,#888);font-size:14px;cursor:pointer;">
            Cancel
          </button>
        </div>
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
      document.getElementById('fem-to').value = '';
      document.getElementById('fem-err').style.display = 'none';
      document.getElementById('fem-send').textContent = 'Send';
      document.getElementById('fem-send').disabled = false;
      setTimeout(() => document.getElementById('fem-to')?.focus(), 100);
    },

    close() { if (_overlay) _overlay.style.display = 'none'; },

    async _send() {
      const to      = document.getElementById('fem-to')?.value?.trim();
      const subject = document.getElementById('fem-subject')?.value?.trim();
      const errEl   = document.getElementById('fem-err');
      const sendBtn = document.getElementById('fem-send');

      if (!to || !to.includes('@')) {
        errEl.textContent = 'Please enter a valid email address.';
        errEl.style.display = 'block'; return;
      }
      errEl.style.display = 'none';
      sendBtn.textContent = 'Sending…'; sendBtn.disabled = true;

      const r = await Forge.request('POST', '/api/email/send', { to, subject, body: _content });

      if (r.ok) {
        Forge.showToast('Email sent!', 'success');
        ForgeEmailModal.close();
      } else {
        errEl.textContent = r.data?.error || 'Failed to send. Please try again.';
        errEl.style.display = 'block';
        sendBtn.textContent = 'Send'; sendBtn.disabled = false;
      }
    },
  };

  global.ForgeEmailModal = ForgeEmailModal;

}(window));
