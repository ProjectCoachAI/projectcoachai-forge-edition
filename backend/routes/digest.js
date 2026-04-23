'use strict';
const express = require('express');
const router  = express.Router();
const db      = require('../lib/db');
const { sendMail } = require('../lib/emailTransport');
const { requireAuth } = require('../middleware/auth');

// Generate digest for a user
async function buildDigest(userEmail, userName) {
  const ym = new Date().toISOString().slice(0,7);
  const lastWeek = new Date(Date.now() - 7*24*60*60*1000).toISOString();
  
  // Get synthesis history
  const usage = await db.query(
    'SELECT entries FROM synthesis_usage WHERE user_email=$1 AND year_month=$2',
    [userEmail, ym]
  );
  
  const entries = usage.rows[0]?.entries || [];
  const weekEntries = entries.filter(e => e.createdAt && e.createdAt > lastWeek);
  
  if (!weekEntries.length) return null;
  
  const streak = calcStreak(entries);
  const topPrompts = weekEntries.slice(0,3).map(e => e.prompt || 'Untitled').join('\n• ');
  
  const subject = streak > 1 
    ? `\uD83D\uDD25 ${streak}-day streak — your Forge weekly digest`
    : `Your Forge weekly digest — ${weekEntries.length} decisions made`;
  
  const text = `Hi ${userName || 'there'},

Here's your Forge weekly digest:

\uD83D\uDCCA THIS WEEK
- ${weekEntries.length} syntheses completed
- ${streak > 0 ? streak + '-day decision streak' : 'Start your streak today!'}

\uD83D\uDCA1 YOUR TOP QUESTIONS THIS WEEK
- ${topPrompts}

\u2728 KEEP GOING
The more you use Forge, the smarter your decisions get. Your AI decision history is building up — check your Profile to review past decisions.

Open Forge: https://forge-app-1u9.pages.dev

— The Forge Team
ProjectCoachAI.com

To unsubscribe, reply with "unsubscribe" to this email.`;

  return { subject, text };
}

function calcStreak(entries) {
  if (!entries || !entries.length) return 0;
  const days = [...new Set(entries
    .map(e => e.createdAt ? e.createdAt.slice(0,10) : null)
    .filter(Boolean)
  )].sort().reverse();
  if (!days.length) return 0;
  const today = new Date().toISOString().slice(0,10);
  const yesterday = new Date(Date.now()-86400000).toISOString().slice(0,10);
  if (days[0] !== today && days[0] !== yesterday) return 0;
  let streak = 1;
  for (let i = 1; i < days.length; i++) {
    const diff = (new Date(days[i-1]) - new Date(days[i])) / 86400000;
    if (diff === 1) streak++;
    else break;
  }
  return streak;
}

// Send digest to current user (manual trigger)
router.post('/send-my-digest', requireAuth, async (req, res) => {
  try {
    const user = await db.getUser(req.userEmail);
    if (!user) return res.status(404).json({ success:false, error:'User not found' });
    
    const digest = await buildDigest(req.userEmail, user.name);
    if (!digest) return res.json({ success:false, error:'No activity this week to digest' });
    
    await sendMail({
      from: 'Forge <digest@projectcoachai.com>',
      to: req.userEmail,
      subject: digest.subject,
      text: digest.text
    });
    
    res.json({ success:true, message:'Digest sent to ' + req.userEmail });
  } catch(e) {
    res.status(500).json({ success:false, error:e.message });
  }
});

// Send digest to all users (admin only — called by cron)
router.post('/send-all', async (req, res) => {
  const cronSecret = req.headers['x-cron-secret'];
  if (cronSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ success:false, error:'Unauthorized' });
  }
  try {
    const users = await db.query('SELECT email, name FROM users');
    let sent = 0; let skipped = 0;
    for (const user of users.rows) {
      try {
        const digest = await buildDigest(user.email, user.name);
        if (!digest) { skipped++; continue; }
        await sendMail({
          from: 'Forge <digest@projectcoachai.com>',
          to: user.email,
          subject: digest.subject,
          text: digest.text
        });
        sent++;
        await new Promise(r => setTimeout(r, 200)); // rate limit
      } catch(_) { skipped++; }
    }
    res.json({ success:true, sent, skipped });
  } catch(e) {
    res.status(500).json({ success:false, error:e.message });
  }
});

module.exports = router;
