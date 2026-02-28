const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const DATA_DIR = path.join(__dirname, '../data');
const EVENTS_PATH = path.join(DATA_DIR, 'analytics.json');

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(EVENTS_PATH)) fs.writeFileSync(EVENTS_PATH, JSON.stringify({ events: [], summary: {} }, null, 2));
}

function loadData() {
  ensureDataFile();
  try {
    return JSON.parse(fs.readFileSync(EVENTS_PATH, 'utf8'));
  } catch {
    const fresh = { events: [], summary: {} };
    fs.writeFileSync(EVENTS_PATH, JSON.stringify(fresh, null, 2));
    return fresh;
  }
}

function saveData(data) {
  ensureDataFile();
  fs.writeFileSync(EVENTS_PATH, JSON.stringify(data, null, 2));
}

router.post('/', (req, res) => {
  try {
    const { event, platform, source, meta } = req.body || {};
    if (!event) return res.status(400).json({ success: false, error: 'Event name required' });

    const data = loadData();

    const entry = {
      event,
      platform: platform || 'unknown',
      source: source || 'forge-lite',
      meta: meta || {},
      ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
      ua: (req.headers['user-agent'] || '').substring(0, 200),
      ts: new Date().toISOString()
    };

    data.events.push(entry);

    const key = `${event}:${entry.platform}`;
    data.summary[key] = (data.summary[key] || 0) + 1;

    const totalKey = `${event}:total`;
    data.summary[totalKey] = (data.summary[totalKey] || 0) + 1;

    if (data.events.length > 5000) data.events = data.events.slice(-5000);

    saveData(data);

    res.json({ success: true });
  } catch (err) {
    console.error('[Track] Error:', err);
    res.status(500).json({ success: false, error: 'Tracking failed' });
  }
});

router.get('/stats', (req, res) => {
  try {
    const data = loadData();
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const weekAgo = new Date(now - 7 * 86400000).toISOString();
    const monthAgo = new Date(now - 30 * 86400000).toISOString();

    const today = data.events.filter(e => e.ts && e.ts.startsWith(todayStr));
    const week = data.events.filter(e => e.ts >= weekAgo);
    const month = data.events.filter(e => e.ts >= monthAgo);

    function breakdown(events) {
      const byEvent = {};
      const byPlatform = {};
      const bySource = {};
      events.forEach(e => {
        byEvent[e.event] = (byEvent[e.event] || 0) + 1;
        byPlatform[e.platform] = (byPlatform[e.platform] || 0) + 1;
        bySource[e.source] = (bySource[e.source] || 0) + 1;
      });
      return { total: events.length, byEvent, byPlatform, bySource };
    }

    res.json({
      success: true,
      stats: {
        today: breakdown(today),
        week: breakdown(week),
        month: breakdown(month),
        allTime: data.summary,
        recentEvents: data.events.slice(-20).reverse()
      }
    });
  } catch (err) {
    console.error('[Track] Stats error:', err);
    res.status(500).json({ success: false, error: 'Unable to load stats' });
  }
});

module.exports = router;
