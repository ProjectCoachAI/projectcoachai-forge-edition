'use strict';
// One layout for the account emails (verify your email, reset your password), in
// the style of the product the person is using. Plain HTML tables with inline
// styles so it renders in every mail app, a text-only wordmark (no images to
// block), and a plain-text copy for clients that do not show HTML.

const STYLES = {
  diary: { page: '#F5F3EE', card: '#FFFFFF', ink: '#1B2A4A', muted: '#6B6559', line: '#D6D2C8', accent: '#C17D3C',
           font: "Georgia, 'Times New Roman', serif" },
  forge: { page: '#F4F4F6', card: '#FFFFFF', ink: '#14141C', muted: '#6B6B88', line: '#E4E4EC', accent: '#ff6b35',
           font: "Helvetica, Arial, sans-serif" }
};
const BODY_FONT = "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";

function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// brand: { key: 'diary' | 'forge', name }, plus the content of the email.
function renderEmail({ brand, preheader, heading, paragraphs, buttonLabel, buttonUrl, afterButton, supportEmail }) {
  const s = STYLES[brand.key] || STYLES.forge;
  const support = supportEmail || 'support@projectcoachai.com';
  const paras = (paragraphs || []).map(p =>
    '<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:' + s.ink + ';font-family:' + BODY_FONT + '">' + esc(p) + '</p>').join('');
  const wordmark = '<span style="font-family:' + s.font + ';font-size:26px;font-weight:bold;color:' + s.ink + ';letter-spacing:-0.5px">' +
    esc(brand.name) + '<span style="color:' + s.accent + '">.</span></span>';

  const html =
    '<!doctype html><html><body style="margin:0;padding:0;background:' + s.page + '">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0">' + esc(preheader || heading) + '</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + s.page + ';padding:32px 12px"><tr><td align="center">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">' +
      '<tr><td style="padding:0 4px 20px">' + wordmark + '</td></tr>' +
      '<tr><td style="background:' + s.card + ';border:1px solid ' + s.line + ';border-radius:12px;padding:32px 28px">' +
        '<h1 style="margin:0 0 16px;font-family:' + s.font + ';font-size:22px;line-height:1.3;color:' + s.ink + '">' + esc(heading) + '</h1>' +
        paras +
        '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px"><tr><td style="background:' + s.accent + ';border-radius:8px">' +
          '<a href="' + esc(buttonUrl) + '" style="display:inline-block;padding:13px 26px;font-family:' + BODY_FONT + ';font-size:16px;font-weight:600;color:#FFFFFF;text-decoration:none">' + esc(buttonLabel) + '</a>' +
        '</td></tr></table>' +
        (afterButton ? '<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:' + s.muted + ';font-family:' + BODY_FONT + '">' + esc(afterButton) + '</p>' : '') +
        '<p style="margin:0;font-size:12px;line-height:1.6;color:' + s.muted + ';font-family:' + BODY_FONT + ';word-break:break-all">' +
          'Button not working? Copy this link into your browser:<br>' + esc(buttonUrl) + '</p>' +
      '</td></tr>' +
      '<tr><td style="padding:18px 4px 0;font-size:12px;line-height:1.6;color:' + s.muted + ';font-family:' + BODY_FONT + '">' +
        'Questions? Write to <a href="mailto:' + esc(support) + '" style="color:' + s.muted + '">' + esc(support) + '</a>.<br>Xencore Global GmbH' +
      '</td></tr>' +
    '</table></td></tr></table></body></html>';

  const text = [heading, '', ...(paragraphs || []), '', buttonLabel + ': ' + buttonUrl, '', afterButton || '', '',
    'Questions? ' + support, 'Xencore Global GmbH'].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
  return { html, text };
}

module.exports = { renderEmail, esc };
