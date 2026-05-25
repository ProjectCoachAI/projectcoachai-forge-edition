const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const { sendMail } = require('../lib/emailTransport');
const { getSession } = require('../lib/db');

const TEMPLATE_PATH = path.join(__dirname, '../data/synthesis-email.html');

// Simple markdown → HTML (handles what Forge produces)
function mdToHtml(md) {
  return md
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/```[\s\S]*?```/g, s => `<pre style="background:#f7f7fa;border:1px solid #e4e4ec;border-radius:6px;padding:12px 16px;font-size:12px;overflow-x:auto;"><code>${s.slice(3,-3).replace(/^[a-z]*\n/,'')}</code></pre>`)
    .replace(/`([^`]+)`/g, '<code style="background:#f7f7fa;border:1px solid #e4e4ec;border-radius:3px;padding:1px 5px;font-size:12px;">$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm,  '<h2>$1</h2>')
    .replace(/^# (.+)$/gm,   '<h1>$1</h1>')
    .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid #e4e4ec;margin:16px 0;">')
    .replace(/^\|(.+)\|$/gm, row => '<tr>' + row.slice(1,-1).split('|').map(c => `<td>${c.trim()}</td>`).join('') + '</tr>')
    .replace(/(<tr>.*<\/tr>\n?)+/g, s => {
      const rows = s.trim().split('\n').filter(r => !r.match(/<td>[-: ]+<\/td>/));
      if (!rows.length) return s;
      const [head, ...body] = rows;
      const th = head.replace(/<td>/g,'<th>').replace(/<\/td>/g,'</th>');
      return `<table><thead>${th}</thead><tbody>${body.join('')}</tbody></table>`;
    })
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>\n?)+/g, s => `<ul>${s}</ul>`)
    .replace(/\n\n+/g, '</p><p>')
    .replace(/^(?!<[huptocdl\/]|$)(.+)$/gm, '<p>$1</p>')
    .replace(/<p><\/p>/g, '');
}

router.post('/send', async (req, res) => {
  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ success: false, error: 'Not authenticated' });
  const session = await getSession(token).catch(() => null);
  if (!session) return res.status(401).json({ success: false, error: 'Session expired' });

  const { to, subject, body } = req.body;
  if (!to || !subject || !body)
    return res.status(400).json({ success: false, error: 'to, subject, and body are required' });

  try {
    const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
    const rendered = mdToHtml(body);
    const html = template
      .replace(/{{subject}}/g, subject.replace(/</g,'&lt;').replace(/>/g,'&gt;'))
      .replace(/{{content}}/g, rendered);

    await sendMail({
      from: 'Forge <noreply@projectcoachai.com>',
      to,
      subject,
      html,
    });
    console.log(`[Email] Sent: ${session.user_email} → ${to} | "${subject}"`);
    res.json({ success: true });
  } catch (err) {
    console.error('[Email] Send failed:', err.message);
    res.status(500).json({ success: false, error: 'Email send failed' });
  }
});

module.exports = router;
