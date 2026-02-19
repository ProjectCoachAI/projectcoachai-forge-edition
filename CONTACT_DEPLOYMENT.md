# Contact Form Deployment Checklist

Use this checklist whenever you deploy the Forge contact backend so the Hostpoint SMTP flow and admin template continue to work.

## 1. Environment Variables (required)

| Name | Value | Notes |
| --- | --- | --- |
| `SMTP_HOST` | `asmtp.mail.hostpoint.ch` | Hostpoint outgoing server. |
| `SMTP_PORT` | `587` | Use STARTTLS; set to `465` + `SMTP_SECURE=true` for SSL/TLS. |
| `SMTP_SECURE` | `false` | `true` only when using port 465. |
| `SMTP_USER` | `no-reply@projectcoachai.com` | Hostpoint mailbox that sends emails. |
| `SMTP_PASS` | _Hostpoint password_ | Reset in Hostpoint control panel if needed. |
| `SMTP_FROM_NAME` | `ProjectCoach AI` | Used in `from` header. |
| `SMTP_FROM_EMAIL` | `no-reply@projectcoachai.com` | Matches the Hostpoint mailbox. |
| `REPLY_TO_EMAIL` | `support@projectcoachai.com` | Replies from users land in this inbox. |

Always export these variables before starting the backend (or set them via your process manager). The server logs will warn if any are missing.

## 2. Verify Transport

- Start the backend with `npm start` (or your PM2/systemd command).
- Confirm the log says `Hostpoint SMTP` (no “jsonTransport” warning).
- Optionally run a quick script (see the note below) to send a test message and inspect `info.messageId`.

## 3. Contact Template & Admin Portal

- The auto-reply and admin notification copy live in `backend/data/contact-template.json`.
- The admin portal at `admin-portal.html` (via `/api/contact/template`) reads/updates:
  - Recipients (deduped automatically)
  - Auto-reply subject/body
  - Reply-to destination for user-facing responses
- Use the portal to keep the “Your Forge Team!” auto-reply current without redeploying.

## 4. Production Contact Page

- Ensure the Electron contact page posts to your production backend URL (e.g., `https://api.projectcoachai.com/api/contact`).
- The admin portal should point to `https://api.projectcoachai.com/api/contact/template`.

## 5. Testing Workflow

1. Submit the contact form from the Forge frontend.
2. Verify Hostpoint inboxes (`daniel.jones@`, `patrick.abas@`, `hello@`, `forge@`, `okofo.jackson@`) all get the notification.
3. Confirm the user receives the auto-reply and its Reply-To header points at `support@projectcoachai.com`.
4. If you need to inspect email content without sending to real inboxes, use Hostpoint’s Mailbox settings or a sandbox like Mailtrap temporarily.

## Optional: Nodemailer Test Snippet

```js
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

(async () => {
  const info = await transporter.sendMail({
    from: `"${process.env.SMTP_FROM_NAME}" <${process.env.SMTP_FROM_EMAIL}>`,
    to: 'your.address@projectcoachai.com',
    subject: 'SMTP test from Forge',
    text: 'Testing Hostpoint SMTP via Nodemailer',
  });
  console.log('SMTP test sent:', info.messageId);
})();
```

## Wrap-up

Once the environment is configured and the backend is running, the contact form and admin portal can operate without further manual email routing. Keep this checklist with your deployment docs so future env changes stay aligned with Hostpoint’s rules.
