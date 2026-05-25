const express = require('express');
const router  = express.Router();
const { query, getSession } = require('../lib/db');

// Auth helper
async function getUser(req) {
  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (!token) return null;
  const session = await getSession(token).catch(() => null);
  if (!session) return null;
  const r = await query('SELECT * FROM users WHERE email=$1', [session.user_email]).catch(() => ({ rows: [] }));
  return r.rows[0] || null;
}

// Tier logic
function getTier(paid) {
  if (paid >= 50) return { name: 'Legend',   rewardLabel: 'Revenue share + Forge for life' };
  if (paid >= 10) return { name: 'Champion', rewardLabel: '6 months free + Pro upgrade' };
  if (paid  >= 3) return { name: 'Advocate', rewardLabel: '3 months free + early access' };
  if (paid  >= 1) return { name: 'Starter',  rewardLabel: `${paid} free month${paid>1?'s':''}` };
  return { name: null, rewardLabel: '—' };
}

// POST /api/referrals/track — log a click (called from ref.html, no auth required)
router.post('/track', async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ success: false, error: 'code required' });
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '';
  try {
    await query(
      'INSERT INTO referral_clicks (referral_code, ip) VALUES ($1, $2)',
      [code.toUpperCase(), ip]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[Referrals] track error:', err.message);
    res.status(500).json({ success: false });
  }
});

// GET /api/referrals/stats — authenticated user's stats + leaderboard
router.get('/stats', async (req, res) => {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ success: false, error: 'Not authenticated' });

  const code = user.referral_code;
  if (!code) return res.json({ success: true, clicks: 0, signups: 0, paid: 0, rewardLabel: '—', leaderboard: [] });

  try {
    const [clicksR, signupsR, paidR, leaderR] = await Promise.all([
      query('SELECT COUNT(*) FROM referral_clicks WHERE referral_code=$1', [code]),
      query('SELECT COUNT(*) FROM referral_clicks WHERE referral_code=$1 AND signed_up=TRUE', [code]),
      query('SELECT COUNT(*) FROM referral_clicks WHERE referral_code=$1 AND converted=TRUE', [code]),
      query(`
        SELECT u.name, COUNT(rc.id) AS count
        FROM referral_clicks rc
        JOIN users u ON u.referral_code = rc.referral_code
        WHERE rc.converted = TRUE
        GROUP BY u.name, u.referral_code
        ORDER BY count DESC
        LIMIT 10
      `),
    ]);

    const paid = parseInt(paidR.rows[0]?.count || 0);
    const { rewardLabel } = getTier(paid);

    res.json({
      success: true,
      clicks:      parseInt(clicksR.rows[0]?.count  || 0),
      signups:     parseInt(signupsR.rows[0]?.count || 0),
      paid,
      rewardLabel,
      leaderboard: leaderR.rows.map(r => ({
        name:  (r.name || 'Anonymous').split(' ')[0],
        count: parseInt(r.count),
      })),
    });
  } catch (err) {
    console.error('[Referrals] stats error:', err.message);
    res.status(500).json({ success: false, error: 'Could not load stats' });
  }
});

// POST /api/referrals/convert — mark a referral as paid (called from Stripe webhook)
router.post('/convert', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false });
  try {
    await query(
      'UPDATE referral_clicks SET converted=TRUE WHERE signup_email=$1 AND converted=FALSE',
      [email]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

module.exports = router;
