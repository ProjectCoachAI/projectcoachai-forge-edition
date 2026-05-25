/**
 * forge-synthesis-actions.js
 * ForgeEmailModal — Gmail-connected email sending for synthesis results.
 * Falls back to mailto: if Gmail not connected.
 * Include after forge-api.js and forge-header.js.
 */
(function(global) {
  'use strict';

  const GOOGLE_CLIENT_ID = '618563427210-muu3q22a1jtihbg9ke2qqjnrnkq0j6np.apps.googleusercontent.com';
  const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

  let _overlay = null;
  let _content  = '';
  let _subject  = '';
  let _tokenClient = null;

  // ── Modal shell ──────────────────────────────────────────────────────────────
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

  // ── Views ────────────────────────────────────────────────────────────────────
  function _showConnect() {
    const mailto = 'mailto:?subject=' + encodeURIComponent(_subject) +
                   '&body=' + encodeURIComponent(_content.slice(0, 1000) + '\n\n— Sent from ProjectCoachAI Forge');
    _body().innerHTML = `
      <p style="color:var(--text-secondary,#888);font-size:14px;line-height:1.6;margin:0 0 20px;">
        Connect your Gmail account to send this result directly from your own address.
      </p>
      <button id="fem-gmail-btn" style="width:100%;padding:13px;background:#4285f4;border:none;border-radius:10px;color:#fff;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:14px;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Connect Gmail
      </button>
      <div style="text-align:center;">
        <a href="${mailto}" style="color:var(--text-secondary,#888);font-size:13px;">Or open in your mail app instead &rarr;</a>
      </div>`;
    document.getElementById('fem-gmail-btn').onclick = _connectGmail;
  }

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
        <div style="background:rgba(255,255,255,0.04);border:1px solid var(--border,rgba(255,255,255,0.08));border-radius:8px;padding:12px 14px;font-size:12px;color:var(--text-secondary,#888);max-height:110px;overflow-y:auto;line-height:1.6;white-space:pre-wrap;">${_content.slice(0, 400)}${_content.length > 400 ? '…' : ''}</div>
      </div>
      <div id="fem-err" style="display:none;color:#ef4444;font-size:13px;margin-bottom:12px;"></div>
      <div style="display:flex;gap:10px;">
        <button id="fem-send" onclick="ForgeEmailModal._send()"
          style="flex:1;padding:12px;background:var(--accent,#e8652a);border:none;border-radius:10px;color:#fff;font-size:14px;font-weight:600;cursor:pointer;">
          Send via Gmail
        </button>
        <button onclick="ForgeEmailModal.close()"
          style="padding:12px 18px;background:rgba(255,255,255,0.06);border:1px solid var(--border,rgba(255,255,255,0.12));border-radius:10px;color:var(--text-secondary,#888);font-size:14px;cursor:pointer;">
          Cancel
        </button>
      </div>
      <div style="text-align:center;margin-top:12px;">
        <button onclick="ForgeEmailModal._disconnect()" style="background:none;border:none;color:var(--text-secondary,#888);font-size:11px;cursor:pointer;text-decoration:underline;">Disconnect Gmail</button>
      </div>`;
  }

  function _showLoading(msg) {
    _body().innerHTML = `<p style="color:var(--text-secondary,#888);font-size:14px;">${msg || 'Loading…'}</p>`;
  }

  // ── Gmail OAuth ───────────────────────────────────────────────────────────────
  function _connectGmail() {
    if (!window.google?.accounts?.oauth2) {
      Forge.showToast('Google library not loaded — refresh and try again', 'error'); return;
    }
    if (!_tokenClient) {
      _tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: GMAIL_SCOPE,
        callback: async (resp) => {
          if (resp.error) { Forge.showToast('Gmail connection failed', 'error'); return; }
          const r = await Forge.request('POST', '/api/auth/google-token', {
            access_token: resp.access_token,
            expires_in: resp.expires_in || 3600,
          });
          if (r.ok) { Forge.showToast('Gmail connected!', 'success'); _showCompose(); }
          else { Forge.showToast('Could not save Gmail connection', 'error'); }
        },
      });
    }
    _tokenClient.requestAccessToken({ prompt: '' });
  }

  // ── Public API ────────────────────────────────────────────────────────────────
  const ForgeEmailModal = {
    async open(content, subject) {
      _content = content || '';
      _subject = subject || 'Forge Synthesis Result';
      _ensureModal();
      _overlay.style.display = 'flex';
      _showLoading('Checking Gmail connection…');

      // Check gmail status from freshly-restored session
      const user = await Forge.restoreSession().catch(() => null);
      if (user?.gmailConnected) { _showCompose(); }
      else { _showConnect(); }
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
      } else if (r.data?.error === 'gmail_not_connected' || r.data?.error === 'gmail_token_expired') {
        _showConnect();
        Forge.showToast('Please reconnect Gmail', 'warn');
      } else {
        errEl.textContent = 'Failed to send. Please try again.';
        errEl.style.display = 'block';
        sendBtn.textContent = 'Send via Gmail'; sendBtn.disabled = false;
      }
    },

    _disconnect() {
      Forge.request('POST', '/api/auth/google-token', { access_token: '', expires_in: 0 });
      _tokenClient = null;
      _showConnect();
      Forge.showToast('Gmail disconnected', 'info');
    },
  };

  global.ForgeEmailModal = ForgeEmailModal;

}(window));
