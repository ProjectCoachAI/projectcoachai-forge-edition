'use strict';
/**
 * backfill-artifact-turns.js: one-off. Adds the "turn" number (which question
 * each source, fact and image came from) to entries saved before db.js started
 * recording it. Put this file next to db.js.
 *
 * It only re-reads the saved text and recomputes three artifact types:
 * citations, structured facts and images. Tables, checklists (including ticked
 * items), reasoning and code are copied across exactly as they are. No AI calls.
 * Strictly additive: an entry is only updated when the recomputed items are the
 * same as the stored ones apart from the new turn numbers.
 *
 *   node backfill-artifact-turns.js            dry run: counts only, writes nothing
 *   node backfill-artifact-turns.js --apply    writes a backup file, then updates
 *
 * Run it where DATABASE_URL is set (for example: railway run node backfill-artifact-turns.js).
 */
const fs = require('fs');
const db = require('./db');

const APPLY = process.argv.includes('--apply');
const REPLACED = ['citations', 'structured_facts', 'images'];

async function main() {
  const res = await db.query('SELECT id, user_email, unified_content, artifacts, metadata FROM diary_entries WHERE unified_content IS NOT NULL ORDER BY id');
  const changes = [];
  let unchanged = 0, skipped = 0, differs = 0;
  const noTurn = v => JSON.stringify(v, (k, x) => (k === 'turn' ? undefined : x));
  for (const row of res.rows) {
    let existing = row.artifacts;
    if (typeof existing === 'string') { try { existing = JSON.parse(existing); } catch (_e) { existing = null; } }
    if (!Array.isArray(existing)) { skipped++; continue; }
    const text = row.unified_content || '';
    const meta = row.metadata || {};
    const fresh = [].concat(
      db.detectCitationArtifacts(text),
      db.detectStructuredFactsArtifacts(text),
      db.detectImagesArtifacts(meta, text)
    );
    // Keep every other artifact exactly as stored; swap in the three recomputed types.
    const kept = existing.filter(a => REPLACED.indexOf(a && a.type) === -1);
    const next = kept.concat(fresh);
    const before = JSON.stringify(existing.filter(a => REPLACED.indexOf(a && a.type) !== -1));
    const after = JSON.stringify(fresh);
    if (before === after) { unchanged++; continue; }
    // Strictly additive: only entries whose three types match what is stored once
    // the turn numbers are ignored are updated. If the recomputed content differs
    // for any other reason (the detectors changed since the entry was saved), the
    // entry is left alone and only counted.
    if (noTurn(existing.filter(a => REPLACED.indexOf(a && a.type) !== -1)) !== noTurn(fresh)) { differs++; continue; }
    changes.push({ id: row.id, user_email: row.user_email, before: existing, after: next });
  }
  console.log('entries read:', res.rows.length, '| would change:', changes.length, '| already current:', unchanged, '| skipped (no artifacts list):', skipped, '| left alone (differs beyond turns):', differs);
  if (!APPLY) { console.log('Dry run only. Nothing written. Add --apply to write.'); return; }
  if (!changes.length) { console.log('Nothing to change.'); return; }
  const backupFile = 'artifacts-backup-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
  fs.writeFileSync(backupFile, JSON.stringify(changes.map(c => ({ id: c.id, user_email: c.user_email, artifacts: c.before })), null, 1));
  console.log('Backup of the old artifacts written to', backupFile);
  for (const c of changes) {
    await db.query('UPDATE diary_entries SET artifacts=$1 WHERE id=$2 AND user_email=$3', [JSON.stringify(c.after), c.id, c.user_email]);
  }
  console.log('Updated', changes.length, 'entries.');
}

main().then(() => db.pool.end()).catch(e => { console.error('Backfill failed:', e.message); db.pool.end().then(() => process.exit(1)); });
