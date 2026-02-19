const nodemailer = require('nodemailer');

function createTransporter() {
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const smtpSecure = process.env.SMTP_SECURE === 'true';

  if (smtpHost && smtpUser && smtpPass) {
    return nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass
      },
      requireTLS: !smtpSecure,
      tls: {
        minVersion: 'TLSv1.2'
      }
    });
  }

  console.warn('⚠️ [EmailTransport] SMTP credentials missing, using jsonTransport.');
  return nodemailer.createTransport({
    jsonTransport: true
  });
}

const transporter = createTransporter();

async function sendMail(options) {
  return transporter.sendMail(options);
}

module.exports = {
  sendMail
};
