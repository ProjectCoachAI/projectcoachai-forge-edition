const express = require('express');
const router = express.Router();
const { sendMail } = require('../lib/emailTransport');
const { requireAuth } = require('../middleware/auth');
const db = require('../lib/db');

const SUPPORT_EMAIL = 'support@projectcoachai.com';

router.post('/password-reset', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    const subject = 'ProjectCoachAI Forge Edition password reset request';
    const text = `A password reset was requested for ${email}. Please follow up with the user and issue a secure reset link.`;

    await sendMail({
      from: `"ProjectCoachAI Forge Edition" <no-reply@projectcoachai.com>`,
      to: SUPPORT_EMAIL,
      subject,
      text,
      replyTo: email
    });

    res.json({ success: true, message: 'Support notified. Please check your email.' });
  } catch (error) {
    console.error('❌ [Account] password reset failed:', error);
    res.status(500).json({ success: false, error: 'Unable to send reset request' });
  }
});

// Removed: this endpoint used to email the user's current and new password in
// plain text to support, with no sign-in. Nothing is sent or stored any more.
// Password changes and resets go through /api/auth.
router.post('/password-change-request', (req, res) => {
  res.status(410).json({ success: false, error: 'This request is no longer available. Please use the password reset on the sign-in page.' });
});

// ── Your data: export and delete (privacy policy "Your rights") ─────────────

// Run a read query; a missing table or column just means "nothing to export".
async function safeRows(sql, params) {
  try { return (await db.query(sql, params)).rows; }
  catch (e) {
    if (e && (e.code === '42P01' || e.code === '42703')) return [];
    throw e;
  }
}

const _exportCooldown = new Map(); // email -> last export time (ms)

// GET /api/account/export — everything we hold for the signed-in user, as JSON.
router.get('/export', requireAuth, async (req, res) => {
  try {
    const email = req.userEmail;
    const last = _exportCooldown.get(email) || 0;
    if (Date.now() - last < 30 * 1000) {
      return res.status(429).json({ success: false, error: 'Please wait a moment before exporting again.' });
    }
    _exportCooldown.set(email, Date.now());

    const profile = (await safeRows(
      'SELECT email, name, tier, created_at, last_login FROM users WHERE email=$1', [email]))[0] || { email };
    const entries = await safeRows(
      `SELECT id, source, title, prompt, content, document_text, conversation, decision_note,
              category, tags, metadata, created_at, updated_at
         FROM diary_entries WHERE user_email=$1 ORDER BY created_at`, [email]);
    const prompts = await safeRows('SELECT to_jsonb(t) AS r FROM prompts t WHERE user_email=$1', [email]);
    const chats = await safeRows('SELECT to_jsonb(t) AS r FROM chat_sessions t WHERE user_email=$1', [email]);
    // Library files: names and sizes only (the file bodies are your own uploads).
    const library = await safeRows(
      `SELECT file_id, filename, file_type, file_size, created_at FROM forge_library WHERE user_email=$1`, [email]);
    const subscriptions = await safeRows(
      'SELECT product, tier, status, created_at FROM subscriptions WHERE user_email=$1', [email]);

    res.json({
      success: true,
      exportedAt: new Date().toISOString(),
      note: 'This file contains everything Diary holds about you. Entries include their tables, sources, key facts, images and attachment links.',
      profile,
      diaryEntries: entries,
      prompts: prompts.map(x => x.r),
      chatSessions: chats.map(x => x.r),
      libraryFiles: library,
      subscriptions
    });
  } catch (e) {
    console.error('[Account] export failed:', e.message);
    res.status(500).json({ success: false, error: 'Could not export your data' });
  }
});

// Collect the storage keys (R2) of every uploaded file belonging to this user.
async function collectStorageKeys(email) {
  const keys = new Set();
  const base = process.env.R2_PUBLIC_URL ? process.env.R2_PUBLIC_URL.replace(/\/+$/, '') + '/' : '';
  if (base) {
    const esc = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Only characters that can appear in a stored file name, so text around a link
    // (**, quotes, brackets, a full stop) is never mistaken for part of the key.
    const re = new RegExp(esc + '([A-Za-z0-9_./%-]+)', 'g');
    const scan = txt => {
      let m;
      while (txt && (m = re.exec(txt)) !== null) {
        let k = m[1].replace(/\.+$/, '');
        try { k = decodeURIComponent(k); } catch (_) {}
        keys.add(k);
      }
    };
    (await safeRows(
      "SELECT COALESCE(metadata::text,'') || ' ' || COALESCE(content,'') || ' ' || COALESCE(artifacts::text,'') AS t FROM diary_entries WHERE user_email=$1",
      [email])).forEach(r => scan(r.t));
    (await safeRows('SELECT messages::text AS t FROM chat_sessions WHERE user_email=$1', [email])).forEach(r => scan(r.t));
    (await safeRows(
      `SELECT t.audio_url AS t FROM tts_cache t JOIN diary_entries d ON d.id=t.entry_id WHERE d.user_email=$1`,
      [email])).forEach(r => scan(r.t));
  }
  (await safeRows('SELECT r2_key FROM pending_attachment_captures WHERE user_email=$1', [email]))
    .forEach(r => { if (r.r2_key) keys.add(r.r2_key); });
  return Array.from(keys);
}

// The database has no foreign keys, so NOTHING is removed along with the user row:
// every table that holds the user's data is deleted from explicitly, here.
// [table, email column]. A table that doesn't exist (yet) is skipped.
const ACCOUNT_TABLES = [
  ['diary_chat_usage', 'user_email'],
  ['diary_pending_prompts', 'user_email'],
  ['diary_search_log', 'user_email'],
  ['excel_analyses', 'user_email'],
  ['feature_usage', 'user_email'],
  ['forge_library', 'user_email'],
  ['forge_recordings', 'user_email'],
  ['knowledge_candidates', 'user_email'],
  ['knowledge_injections', 'user_email'],
  ['pending_attachment_captures', 'user_email'],
  ['prompts', 'user_email'],
  ['provider_keys', 'user_email'],
  ['read_aloud_usage', 'user_email'],
  ['sessions', 'user_email'],
  ['synthesis_logs', 'user_email'],
  ['synthesis_usage', 'user_email'],
  ['traffic_visits', 'user_email'],
  ['subscriptions', 'user_email'],
  ['chat_sessions', 'user_email'],
  ['referral_rewards', 'user_email'],
  ['referral_clicks', 'signup_email'],
  ['referrals', 'referee_email'],
  ['invites', 'inviter_email'],
  ['student_verifications', 'email'],
  ['network_applications', 'email'],
  ['contact_messages', 'email'],
  ['diary_entries', 'user_email']      // last of the diary tables: children are removed first
];
// Kept on purpose (Swiss accounting): billing/revenue records. Never swept up below.
const KEEP_TABLES = ['revenue_events', 'users'];
const SAFE_IDENT = /^[a-z0-9_]+$/i;

// Delete everything that belongs to `email`, using `run(sql, params)`.
// Safe to repeat. Returns the number of tables touched.
async function deleteAccountData(run, email) {
  const ignorable = e => e && (e.code === '42P01' || e.code === '42703');
  const attempt = async (sql, params) => {
    try { await run(sql, params); }
    catch (e) { if (!ignorable(e)) throw e; }
  };
  // 1) Tables that point at an entry by id (audio cache, facts, images …): remove first.
  const byEntry = await run(
    `SELECT DISTINCT table_name FROM information_schema.columns
      WHERE table_schema='public' AND column_name='entry_id' AND table_name <> 'diary_entries'`, []);
  for (const r of byEntry.rows) {
    if (!SAFE_IDENT.test(r.table_name) || KEEP_TABLES.includes(r.table_name)) continue;
    await attempt(`DELETE FROM "${r.table_name}" WHERE entry_id IN (SELECT id FROM diary_entries WHERE user_email=$1)`, [email]);
  }
  // 1b) Tables that point at a chat by session id (message embeddings): remove before the chats.
  await attempt(
    'DELETE FROM chat_message_embeddings WHERE session_id IN (SELECT session_id FROM chat_sessions WHERE user_email=$1)', [email]);
  // 2) The known tables.
  for (const [table, col] of ACCOUNT_TABLES) {
    await attempt(`DELETE FROM ${table} WHERE ${col}=$1`, [email]);
  }
  // 3) Safety net: any other table with a user_email column (e.g. added later).
  const known = new Set(ACCOUNT_TABLES.map(t => t[0]).concat(KEEP_TABLES));
  const sweep = await run(
    `SELECT DISTINCT table_name FROM information_schema.columns
      WHERE table_schema='public' AND column_name='user_email'`, []);
  for (const r of sweep.rows) {
    if (known.has(r.table_name) || !SAFE_IDENT.test(r.table_name)) continue;
    await attempt(`DELETE FROM "${r.table_name}" WHERE user_email=$1`, [email]);
  }
  // 4) The account itself.
  await run('DELETE FROM users WHERE email=$1', [email]);
}

// DELETE /api/account — permanently delete the account and all its data.
router.delete('/', requireAuth, async (req, res) => {
  try {
    const email = req.userEmail;
    if (!req.body || req.body.confirm !== 'DELETE') {
      return res.status(400).json({ success: false, error: 'Type DELETE to confirm.' });
    }
    const u = (await safeRows(
      'SELECT is_admin, role, stripe_customer_id FROM users WHERE email=$1', [email]))[0];
    if (!u) return res.status(404).json({ success: false, error: 'Account not found' });
    if (u.is_admin || u.role === 'admin') {
      return res.status(403).json({ success: false, error: 'Admin accounts must be removed manually.' });
    }

    // 1) Stop billing first. If this fails, nothing has been deleted yet, so the user can retry.
    let cancelled = 0;
    if (u.stripe_customer_id) {
      if (!process.env.STRIPE_SECRET_KEY) {
        return res.status(503).json({ success: false, error: 'Billing is unavailable right now. Please try again shortly.' });
      }
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const subs = await stripe.subscriptions.list({ customer: u.stripe_customer_id, status: 'all', limit: 100 });
      for (const sub of subs.data) {
        if (sub.status !== 'canceled' && sub.status !== 'incomplete_expired') {
          await stripe.subscriptions.cancel(sub.id);
          cancelled++;
        }
      }
    }

    // 2) Remember which stored files to remove (needs the rows that are about to go).
    //    The account's whole storage folder is removed by name; individual keys found in the
    //    data cover anything stored outside it (older files).
    const storageKeys = await collectStorageKeys(email);
    const storageFolder = ((await safeRows('SELECT storage_folder FROM users WHERE email=$1', [email]))[0] || {}).storage_folder || null;

    // 3) Remove rows that are not removed along with the user, then the user itself.
    //    Re-running after a partial failure is safe: each step is idempotent.
    //    One transaction when a pool is available: all removed, or nothing.
    const pool = db.pool || (typeof db.getPool === 'function' ? db.getPool() : null);
    if (pool && typeof pool.connect === 'function') {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // A failed statement aborts a Postgres transaction, so use a savepoint per statement.
        let n = 0;
        await deleteAccountData(async (sql, params) => {
          const sp = 'sp' + (n++);
          await client.query('SAVEPOINT ' + sp);
          try { const r = await client.query(sql, params); await client.query('RELEASE SAVEPOINT ' + sp); return r; }
          catch (e) { await client.query('ROLLBACK TO SAVEPOINT ' + sp); throw e; }
        }, email);
        await client.query('COMMIT');
      } catch (e) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        throw e;
      } finally { client.release(); }
    } else {
      await deleteAccountData((sql, params) => db.query(sql, params), email);
    }

    // 4) Remove stored files (best effort — the data rows are already gone).
    let filesRemoved = 0;
    try {
      const attachmentStorage = require('../lib/attachmentStorage');
      if (storageFolder) {
        try { filesRemoved += await attachmentStorage.removeFolder(storageFolder); }
        catch (e) { console.warn('[Account] could not remove storage folder:', e.message); }
      }
      const folderPrefix = storageFolder ? 'u/' + storageFolder + '/' : null;
      for (const key of storageKeys) {
        if (folderPrefix && key.indexOf(folderPrefix) === 0) continue; // already removed with the folder
        try { await attachmentStorage.remove(key); filesRemoved++; }
        catch (e) { console.warn('[Account] could not remove stored file:', e.message); }
      }
    } catch (e) { console.warn('[Account] storage cleanup skipped:', e.message); }

    console.log(`[Account] deleted account (subscriptions cancelled: ${cancelled}, files removed: ${filesRemoved})`);
    res.json({ success: true });
  } catch (e) {
    console.error('[Account] delete failed:', e.message);
    res.status(500).json({ success: false, error: 'Could not delete your account. Please try again or contact support.' });
  }
});

module.exports = router;
