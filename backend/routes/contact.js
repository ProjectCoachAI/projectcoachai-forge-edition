const express = require('express');
const fs = require('fs');
const path = require('path');
const { sendMail } = require('../lib/emailTransport');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const db = require('../lib/db');
const router = express.Router();
const TEMPLATE_DIR = path.join(__dirname, '../data');
const TEMPLATE_PATH = path.join(TEMPLATE_DIR, 'contact-template.json');
const MESSAGES_PATH = path.join(TEMPLATE_DIR, 'contact-messages.json');

function loadMessages() {
  try {
    if (!fs.existsSync(TEMPLATE_DIR)) fs.mkdirSync(TEMPLATE_DIR, { recursive: true });
    if (!fs.existsSync(MESSAGES_PATH)) fs.writeFileSync(MESSAGES_PATH, '[]');
    return JSON.parse(fs.readFileSync(MESSAGES_PATH, 'utf-8'));
  } catch(_) { return []; }
}
function saveMessages(msgs) {
  try {
    if (!fs.existsSync(TEMPLATE_DIR)) fs.mkdirSync(TEMPLATE_DIR, { recursive: true });
    fs.writeFileSync(MESSAGES_PATH, JSON.stringify(msgs, null, 2));
  } catch(e) { console.warn('[Contact] saveMessages failed:', e.message); }
}

const defaultTemplate = {
  recipients: [
    'forge@projectcoachai.com',
    'daniel.jones@projectcoachai.com',
    'patrick.abas@projectcoachai.com'
  ],
  adminSubject: 'New ProjectCoachAI Forge Edition inquiry',
  adminNote: 'A new contact message just arrived through the Forge contact form.',
  autoReply: {
    subject: 'Thanks for choosing ProjectCoachAI Forge Edition',
    body: 'Hi {{name}},\n\nThank you for reaching out to ProjectCoachAI Forge Edition.\n\nWe\'ve received your message and a member of our team will review it shortly.\n\nIf your request is related to:\n\n\u2022 Product feedback \u2014 we read every insight carefully\n\u2022 Technical support \u2014 we\'ll reply with guidance as soon as possible\n\u2022 Feature ideas \u2014 these directly help shape Forge\'s evolution\n\nYou don\'t need to do anything else right now \u2014 we\'ll get back to you soon.\n\nBest regards,\nThe Forge Team\nProjectCoachAI'
  },
  autoReplyEnabled: true,
  fromAddress: 'ProjectCoachAI Forge Edition <no-reply@projectcoachai.com>'
};

function ensureTemplateFile() {
  if (!fs.existsSync(TEMPLATE_DIR)) {
    fs.mkdirSync(TEMPLATE_DIR, { recursive: true });
  }
  if (!fs.existsSync(TEMPLATE_PATH)) {
    fs.writeFileSync(TEMPLATE_PATH, JSON.stringify(defaultTemplate, null, 2));
  }
}

function loadTemplate() {
  ensureTemplateFile();
  const raw = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    return {
      ...defaultTemplate,
      ...parsed,
      recipients: Array.from(new Set([...(parsed.recipients || defaultTemplate.recipients)]))
    };
  } catch (error) {
    console.error('❌ [Contact] Failed to parse template, resetting to defaults', error);
    fs.writeFileSync(TEMPLATE_PATH, JSON.stringify(defaultTemplate, null, 2));
    return defaultTemplate;
  }
}

function saveTemplate(newTemplate) {
  ensureTemplateFile();
  const current = loadTemplate();
  const merged = {
    ...current,
    ...newTemplate,
    autoReply: {
      ...current.autoReply,
      ...(newTemplate.autoReply || {})
    }
  };
  merged.recipients = Array.from(new Set(merged.recipients));
  fs.writeFileSync(TEMPLATE_PATH, JSON.stringify(merged, null, 2));
  return merged;
}

function replacePlaceholders(text, context = {}) {
  return text.replace(/{{(\w+)}}/g, (match, key) => {
    return context[key] || '';
  });
}

router.get('/template', (req, res) => {
  const template = loadTemplate();
  res.json({
    success: true,
    template: {
      recipients: template.recipients,
      adminSubject: template.adminSubject,
      adminNote: template.adminNote,
      autoReply: template.autoReply,
      autoReplyEnabled: template.autoReplyEnabled,
      fromAddress: template.fromAddress
    }
  });
});

router.put('/template', (req, res) => {
  try {
    const payload = req.body || {};
    const updated = saveTemplate(payload);
    res.json({
      success: true,
      template: {
        recipients: updated.recipients,
        adminSubject: updated.adminSubject,
        adminNote: updated.adminNote,
        autoReply: updated.autoReply,
        autoReplyEnabled: updated.autoReplyEnabled,
        fromAddress: updated.fromAddress
      }
    });
  } catch (error) {
    console.error('❌ [Contact] Template save failed:', error);
    res.status(500).json({ success: false, error: 'Unable to save template' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, email, comment } = req.body || {};
    if (!email || !comment) {
      return res.status(400).json({ success: false, error: 'Email and comment are required' });
    }

    const template = loadTemplate();
    const adminSubject = template.adminSubject || `New contact from ${name || email}`;
    const adminBody = `
${template.adminNote || ''}

Name: ${name || 'Unknown'}
Email: ${email}
Message:
${comment}

-- End of message --
`.trim();

    await sendMail({
      from: template.fromAddress,
      to: template.recipients.join(','),
      subject: adminSubject,
      text: adminBody
    });

    if (template.autoReplyEnabled) {
      try {
        const autoReplyPath = path.join(__dirname, '../data/contact-autoreply.html');
        let htmlTemplate = fs.readFileSync(autoReplyPath, 'utf-8');
        const contactType = req.body.type || req.body.contactType || 'General enquiry';
        const userMessage = comment || req.body.message || '';
        htmlTemplate = htmlTemplate
          .replace(/{{name}}/g, name || 'there')
          .replace(/{{type}}/g, contactType)
          .replace(/{{message}}/g, userMessage.replace(/</g, '&lt;').replace(/>/g, '&gt;'));
        await sendMail({
          from: 'Forge <hello@projectcoachai.com>',
          replyTo: 'support@projectcoachai.com',
          to: email,
          subject: 'We received your message — Forge',
          html: htmlTemplate
        });
      } catch(tmplErr) {
        console.warn('[Contact] HTML template failed, falling back to text:', tmplErr.message);
        const replySubject = replacePlaceholders(template.autoReply?.subject || 'We received your message — Forge', { name });
        const replyBody = replacePlaceholders(template.autoReply?.body || 'Hi {{name}}, thank you for reaching out. We will get back to you shortly.\n\nThe Forge Team', { name, email, comment });
        await sendMail({ from: template.fromAddress, to: email, subject: replySubject, text: replyBody });
      }
    }

    // Save message to DB
    try {
      await db.query(
        'INSERT INTO contact_messages(name, email, type, comment) VALUES($1,$2,$3,$4)',
        [name, email, req.body.type || 'General', comment]
      );
    } catch(e) { console.warn('[Contact] Failed to save message:', e.message); }

    res.json({ success: true, message: 'Your message was sent. Thank you!' });
  } catch (error) {
    console.error('❌ [Contact] Failed to send emails:', error);
    res.status(500).json({ success: false, error: 'Unable to submit your request at this time. Please try again later.' });
  }
});

// GET /api/contact/messages — admin inbox
router.get('/messages', requireAuth, requireAdmin, async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 100');
    const messages = r.rows.map(m => ({
      id: m.id, name: m.name, email: m.email,
      type: m.type, comment: m.comment,
      read: m.read, createdAt: m.created_at
    }));
    res.json({ ok: true, messages });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// PATCH /api/contact/messages/:id/read — mark as read
router.patch('/messages/:id/read', requireAuth, requireAdmin, async (req, res) => {
  try {
    await db.query('UPDATE contact_messages SET read=true WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// DELETE /api/contact/messages/:id — archive
router.delete('/messages/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM contact_messages WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});
});

module.exports = router;
