const express = require('express');
const fs = require('fs');
const path = require('path');
const { sendMail } = require('../lib/emailTransport');
const router = express.Router();
const TEMPLATE_DIR = path.join(__dirname, '../data');
const TEMPLATE_PATH = path.join(TEMPLATE_DIR, 'contact-template.json');

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

    if (template.autoReplyEnabled && template.autoReply?.subject && template.autoReply?.body) {
      const replySubject = replacePlaceholders(template.autoReply.subject, { name });
      const replyBody = replacePlaceholders(template.autoReply.body, { name, email, comment });
      await sendMail({
        from: template.fromAddress,
        to: email,
        subject: replySubject,
        text: replyBody
      });
    }

    res.json({ success: true, message: 'Your message was sent. Thank you!' });
  } catch (error) {
    console.error('❌ [Contact] Failed to send emails:', error);
    res.status(500).json({ success: false, error: 'Unable to submit your request at this time. Please try again later.' });
  }
});

module.exports = router;
