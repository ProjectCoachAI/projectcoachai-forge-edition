/**
 * forge-synthesis-actions.js
 * ForgeEmailModal — sends synthesis results via Forge (Resend).
 * No Gmail OAuth required.
 */
(function(global) {
  'use strict';

  let _overlay  = null;
  let _content  = '';
  let _subject  = '';

  function _ensureModal() {
    if (_overlay) return;
    _overlay = document.createElement('div');
    _overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:10000;display:none;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;';
    _overlay.innerHTML = `
      <div style="background:var(--surface,#1a1a2e);border:1px solid var(--border,rgba(255,255,255,0.12));border-radius:16px;padding:32px;width:100%;max-width:500px;max-height:90vh;overflow-y:auto;position:relative;">
        <button onclick="ForgeEmailModal.close()" style="position:absolute;top:14px;right:16px;background:none;border:none;color:var(--text-secondary,#888);cursor:pointer;font-size:20px;line-height:1;">&#x2715;</button>
        <h2 style="margin:0 0 22px;font-size:17px;font-weight:600;color:var(--text,#e8e8f0);">&#9993; Email this result</h2>
        <div id="fem-body"></div>
      </div>`;
    _overlay.addEventListener('click', e => { if (e.target === _overlay) ForgeEmailModal.close(); });
    document.body.appendChild(_overlay);
  }

  function _body() { return document.getElementById('fem-body'); }

  function _showCompose() {
    _body().innerHTML = `
      <div style="margin-bottom:14px;">
        <label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary,#888);margin-bottom:6px;letter-spacing:.05em;">TO</label>
        <input id="fem-to" type="email" placeholder="colleague@example.com"
          style="width:100%;padding:10px 14px;background:rgba(255,255,255,0.06);border:1px solid var(--border,rgba(255,255,255,0.12));border-radius:8px;color:var(--text,#e8e8f0);font-size:14px;box-sizing:border-box;outline:none;" />
      </div>
      <div style="margin-bottom:14px;">
        <label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary,#888);margin-bottom:6px;letter-spacing:.05em;">SUBJECT</label>
        <input id="fem-subject" type="text" value="${_subject.replace(/"/g,'&quot;')}"
          style="width:100%;padding:10px 14px;background:rgba(255,255,255,0.06);border:1px solid var(--border,rgba(255,255,255,0.12));border-radius:8px;color:var(--text,#e8e8f0);font-size:14px;box-sizing:border-box;outline:none;" />
      </div>
      <div style="margin-bottom:18px;">
        <label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary,#888);margin-bottom:6px;letter-spacing:.05em;">PREVIEW</label>
        <div style="background:rgba(255,255,255,0.04);border:1px solid var(--border,rgba(255,255,255,0.08));border-radius:8px;padding:12px 14px;font-size:12px;color:var(--text-secondary,#888);max-height:110px;overflow-y:auto;line-height:1.6;white-space:pre-wrap;">${_content.slice(0,400)}${_content.length>400?'…':''}</div>
      </div>
      <p style="font-size:12px;color:var(--text-secondary,#888);margin:0 0 16px;">Sent via Forge — arrives from <strong>noreply@projectcoachai.com</strong></p>
      <div id="fem-err" style="display:none;color:#ef4444;font-size:13px;margin-bottom:12px;"></div>
      <div style="display:flex;gap:10px;">
        <button id="fem-send" onclick="ForgeEmailModal._send()"
          style="flex:1;padding:12px;background:var(--accent,#e8652a);border:none;border-radius:10px;color:#fff;font-size:14px;font-weight:600;cursor:pointer;">
          Send Email
        </button>
        <button onclick="ForgeEmailModal.close()"
          style="padding:12px 18px;background:rgba(255,255,255,0.06);border:1px solid var(--border,rgba(255,255,255,0.12));border-radius:10px;color:var(--text-secondary,#888);font-size:14px;cursor:pointer;">
          Cancel
        </button>
      </div>`;
  }

  const ForgeEmailModal = {
    open(content, subject) {
      _content = content || '';
      _subject = subject || 'Forge Synthesis Result';
      _ensureModal();
      _overlay.style.display = 'flex';
      _showCompose();
    },

    close() { if (_overlay) _overlay.style.display = 'none'; },

    async _send() {
      const to      = document.getElementById('fem-to')?.value?.trim();
      const subject = document.getElementById('fem-subject')?.value?.trim();
      const errEl   = document.getElementById('fem-err');
      const sendBtn = document.getElementById('fem-send');

      if (!to || !to.includes('@')) {
        errEl.textContent = 'Please enter a valid recipient email.';
        errEl.style.display = 'block'; return;
      }
      errEl.style.display = 'none';
      sendBtn.textContent = 'Sending…'; sendBtn.disabled = true;

      const htmlBody = `<div style="font-family:sans-serif;max-width:680px;margin:0 auto;color:#222;">
        <p style="font-size:12px;color:#999;border-bottom:1px solid #eee;padding-bottom:10px;margin-bottom:18px;">
          Shared from <strong>ProjectCoachAI Forge</strong>
        </p>
        <div style="white-space:pre-wrap;line-height:1.7;">${_content.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
        <p style="font-size:11px;color:#999;border-top:1px solid #eee;padding-top:10px;margin-top:18px;">
          Sent from <a href="https://forge.projectcoachai.com">forge.projectcoachai.com</a>
        </p>
      </div>`;

      const r = await Forge.request('POST', '/api/email/send', { to, subject, body: htmlBody });

      if (r.ok) {
        Forge.showToast('Email sent!', 'success');
        ForgeEmailModal.close();
      } else {
        errEl.textContent = r.data?.error || 'Failed to send. Please try again.';
        errEl.style.display = 'block';
        sendBtn.textContent = 'Send Email'; sendBtn.disabled = false;
      }
    },
  };

  global.ForgeEmailModal = ForgeEmailModal;

}(window));
