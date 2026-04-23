const RESEND_API_KEY = process.env.SMTP_PASS;
const RESEND_URL = 'https://api.resend.com/emails';

async function sendMail({ from, to, subject, text, html }) {
  if (!RESEND_API_KEY) {
    console.warn('⚠️ [EmailTransport] No API key (SMTP_PASS). Email not sent.');
    return { messageId: 'dry-run' };
  }

  const toArray = typeof to === 'string' ? to.split(',').map(e => e.trim()) : to;

  console.log(`📧 [EmailTransport] Sending via Resend API to ${toArray.join(', ')}`);

  const res = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from, to: toArray, subject, text, ...(html ? { html } : {}) })
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('❌ [EmailTransport] Resend error:', data);
    throw new Error(data.message || 'Email send failed');
  }

  console.log('✅ [EmailTransport] Sent:', data.id);
  return { messageId: data.id };
}

module.exports = {
  sendMail
};
