'use strict';
const express = require('express');
const router  = express.Router();
const db      = require('../lib/db');

// Auto-create table on first use
(async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS traffic_visits (
        id          SERIAL PRIMARY KEY,
        source      TEXT,
        medium      TEXT,
        campaign    TEXT,
        page        TEXT,
        user_agent  TEXT,
        user_email  TEXT,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_tv_source  ON traffic_visits(source)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_tv_created ON traffic_visits(created_at)`);
    await db.query(`
      CREATE TABLE IF NOT EXISTS feature_usage (
        user_email  TEXT NOT NULL,
        feature     TEXT NOT NULL,
        usage_date  DATE NOT NULL DEFAULT CURRENT_DATE,
        used        INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (user_email, feature, usage_date)
      )
    `);
    console.log('[Track] tables ready');
  } catch(e) { console.error('[Track] table init:', e.message); }
})();

// POST /api/track/visit — log any UTM visit (fire-and-forget from frontend)
router.post('/visit', async (req, res) => {
  try {
    const { source, medium, campaign, page, ua } = req.body;
    if (!source) return res.json({ ok: true });
    await db.query(
      `INSERT INTO traffic_visits (source, medium, campaign, page, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [source || null, medium || null, campaign || null, page || null, (ua || '').slice(0, 300)]
    );
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ ok: false });
  }
});

module.exports = router;
