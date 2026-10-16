'use strict';
/**
 * backfill-artifact-turns.js: one-off. Adds the "turn" number (which question
 * each source, fact and image came from) to entries saved before db.js started
 * recording it. Put this file next to db.js.
 *
 * It only re-reads the saved text and recomputes three artifact types:
 * citations, structured facts and images. Tables, checklists (including ticked
 * items), reasoning and code are copied across exactly as they are. No AI calls.
 * Strictly additive: each type is only updated when its recomputed items are the
 * same as the stored ones apart from the new turn numbers.
 *
 *   node backfill-artifact-turns.js            dry run: counts only, writes nothing
 *   node backfill-artifact-turns.js --explain  dry run plus a breakdown of why entries are left alone
 *   node backfill-artifact-turns.js --apply    writes a backup file, then updates
 *
 * Run it where DATABASE_URL is set (for example: railway run node backfill-artifact-turns.js).
 */
const fs = require('fs');
const db = require('../lib/db');

const APPLY = process.argv.includes('--apply');
const EXPLAIN = process.argv.includes('--explain');
const REPLACED = ['citations', 'structured_facts', 'images'];

async function main() {
  const res = await db.query('SELECT id, user_email, unified_content, artifacts, metadata FROM diary_entries WHERE unified_content IS NOT NULL ORDER BY id');
  const changes = [];
  let unchanged = 0, skipped = 0, differs = 0;
  const why = {}; const sampleIds = {}; const detail = {}; const perType = {}; const blockedType = {};
  // Postgres JSONB hands back object keys in its own order, so compare with sorted keys.
  const canon = v => {
    if (Array.isArray(v)) return v.map(canon);
    if (v && typeof v === 'object') { const o = {}; Object.keys(v).sort().forEach(k => { o[k] = canon(v[k]); }); return o; }
    return v;
  };
  // Field-level difference summary (key paths and length changes only, never values).
  const diffPaths = (a, b, p, out) => {
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) out.push((p || '(root)') + ' length ' + (a.length < b.length ? 'stored<fresh' : 'stored>fresh'));
      for (let i = 0; i < Math.min(a.length, b.length); i++) diffPaths(a[i], b[i], p + '[]', out);
    } else if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
      new Set(Object.keys(a).concat(Object.keys(b))).forEach(k => {
        if (k === 'turn') return;
        if (!(k in a)) out.push(p + '.' + k + ' only in fresh');
        else if (!(k in b)) out.push(p + '.' + k + ' only in stored');
        else diffPaths(a[k], b[k], p + '.' + k, out);
      });
    } else if (JSON.stringify(a) !== JSON.stringify(b)) out.push(p + ' value differs');
  };
  const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
  const noTurn = v => JSON.stringify(canon(v), (k, x) => (k === 'turn' ? undefined : x));
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
    // Each of the three types is decided on its own. A type is updated only when
    // what is stored equals the recomputed items apart from the turn numbers;
    // otherwise that type stays exactly as stored. Every other artifact (tables,
    // checklists, reasoning, code) is never touched, and positions in the list
    // do not move.
    const next = existing.slice();
    let anyUpdated = false, anyBlocked = false;
    REPLACED.forEach(t => {
      const o = existing.filter(a => a && a.type === t), f = fresh.filter(a => a && a.type === t);
      if (!o.length && !f.length) return;
      if (same(o, f)) return;
      if (o.length && f.length && noTurn(o) === noTurn(f)) {
        let k = 0;
        for (let i = 0; i < next.length; i++) if (next[i] && next[i].type === t) next[i] = f[k++];
        anyUpdated = true;
        perType[t] = (perType[t] || 0) + 1;
        return;
      }
      anyBlocked = true;
      blockedType[t] = (blockedType[t] || 0) + 1;
      if (EXPLAIN) {
        let k = null;
        if (!o.length && f.length) k = 'stored has none, recompute finds some';
        else if (o.length && !f.length) k = 'stored has some, recompute finds none';
        else k = 'both have some, contents differ';
        if (k === 'both have some, contents differ') {
          const out = [];
          diffPaths(canon(o), canon(f), t, out);
          new Set(out).forEach(x => { detail[x] = (detail[x] || 0) + 1; });
        }
        const key = t + ': ' + k; why[key] = (why[key] || 0) + 1; (sampleIds[key] = sampleIds[key] || []).length < 3 && sampleIds[key].push(row.id);
      }
    });
    if (anyUpdated) changes.push({ id: row.id, user_email: row.user_email, before: existing, after: next });
    else if (anyBlocked) differs++;
    else unchanged++;
  }
  console.log('entries read:', res.rows.length, '| would change:', changes.length, '| already current:', unchanged, '| skipped (no artifacts list):', skipped, '| nothing safe to add:', differs);
  console.log('types that would be updated:', JSON.stringify(perType), '| types left as stored (differ beyond turns):', JSON.stringify(blockedType));
  if (EXPLAIN) {
    console.log('Why entries are left alone (an entry can appear under several lines):');
    Object.keys(why).sort().forEach(k => console.log('  ' + k + ' = ' + why[k] + '   e.g. entry ids ' + sampleIds[k].join(', ')));
  }
  if (EXPLAIN) {
    console.log('Where the stored and recomputed items differ (entries per field path):');
    Object.keys(detail).sort((a, b) => detail[b] - detail[a]).slice(0, 14).forEach(k => console.log('  ' + k + ' = ' + detail[k]));
  }
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
