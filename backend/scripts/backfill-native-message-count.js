#!/usr/bin/env node
// backfill-native-message-count.js
//
// One-time repair for a confirmed, real bug: nativeMessageCount was never
// initialized at the moment of forking to Continue Conversation
// (diary-web/continue.html's own linkChatSessionToDiaryEntry()), and was
// also never written during sync attempts that returned no_new_content or
// history_mismatch (both leave it untouched — it was only ever written
// inside diary-sync.js's own successful-merge branch). For any entry whose
// EVERY sync attempt returned no_new_content or history_mismatch before a
// genuine successful merge ever occurred, this field stayed undefined
// indefinitely.
//
// WHY THIS MATTERS — confirmed via a real, live data-loss incident: when
// a sync FINALLY succeeded for such an entry, diary-sync.js's own
// fallback (typeof oldMeta.nativeMessageCount === 'number' ? ... :
// session.messages.length) kicked in and set nativeMessageCount to
// session.messages.length — treating the ENTIRE existing array, including
// any genuine Forge-only messages already typed into Continue Conversation,
// as "native." This caused those Forge-only messages to be silently
// overwritten on the very next successful sync rather than preserved.
//
// The permanent fix (diary-web/continue.html, committed earlier this
// session) initializes nativeMessageCount at fork time, so no entry forked
// from that point forward will have this gap. This script backfills the
// field on entries that were forked before the fix — setting it to the
// correct value (nativeSeedMessageCount, the count that was fixed at fork
// time and never changes) so the fallback in diary-sync.js never engages
// for those entries either.
//
// SAFETY: only touches entries that are both forked (chatSessionId present)
// AND have nativeSeedMessageCount stored (the seed count has always been
// set at fork time, so this is a reliable proxy for "genuinely forked,
// not just partially broken") AND are currently missing nativeMessageCount
// entirely. Entries that already have nativeMessageCount are left
// completely untouched — if diary-sync.js already wrote a value there via
// a successful merge, that value reflects the true post-sync boundary and
// is more accurate than nativeSeedMessageCount.
//
// WHAT IS WRITTEN: nativeSeedMessageCount (the seed count fixed at fork
// time) — this is the safest, most conservative value. It means the
// boundary is treated as "no native messages have been added since fork,"
// which may be stale if syncs have genuinely succeeded since then. But:
// (a) if no sync ever succeeded (the most common case for entries with
// this gap), this is exactly correct; (b) if syncs did succeed, the next
// successful sync will update nativeMessageCount to its true post-sync
// value, correcting any remaining staleness then; (c) this is strictly
// better than leaving the field undefined, which risks the data-loss bug
// described above.
//
// USAGE:
//   node scripts/backfill-native-message-count.js           (dry run — default)
//   node scripts/backfill-native-message-count.js --apply   (writes fixes)
//
// Dry run is the default deliberately — review the list of affected entries
// before writing anything to production.

const db = require('../lib/db');

const APPLY = process.argv.includes('--apply');

async function main() {
  await db.init();
  console.log('[Backfill] Mode:', APPLY ? 'APPLY (will write changes)' : 'DRY RUN (no changes will be written — pass --apply to write)');
  console.log('');

  // Find every forked entry that has nativeSeedMessageCount (set at fork
  // time, reliable) but is missing nativeMessageCount (the gap this script
  // repairs). Entries that already have nativeMessageCount are excluded —
  // diary-sync.js already wrote the correct post-sync boundary there.
  const entriesR = await db.query(
    `SELECT id, user_email, metadata FROM diary_entries
     WHERE metadata->>'chatSessionId' IS NOT NULL
       AND metadata->>'nativeSeedMessageCount' IS NOT NULL
       AND (metadata->>'nativeMessageCount') IS NULL`
  );

  console.log('[Backfill] Found', entriesR.rows.length, 'forked entries missing nativeMessageCount.');
  console.log('');

  let checked = 0, fixed = 0, skipped = 0;

  for (const entry of entriesR.rows) {
    checked++;
    const meta = entry.metadata || {};
    const seedCount = parseInt(meta.nativeSeedMessageCount, 10);

    if (isNaN(seedCount) || seedCount < 0) {
      skipped++;
      console.log('[Backfill] Entry', entry.id, '— SKIPPED: nativeSeedMessageCount is not a valid non-negative integer (' + meta.nativeSeedMessageCount + '). Manual review needed.');
      continue;
    }

    fixed++;
    console.log('[Backfill] Entry', entry.id, '— will set nativeMessageCount =', seedCount, '(from nativeSeedMessageCount)');

    if (APPLY) {
      await db.query(
        `UPDATE diary_entries
         SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{nativeMessageCount}', $1::jsonb)
         WHERE id = $2 AND user_email = $3`,
        [JSON.stringify(seedCount), entry.id, entry.user_email]
      );
      console.log('    -> WRITTEN.');
    } else {
      console.log('    -> (dry run — no write performed)');
    }
  }

  console.log('');
  console.log('[Backfill] Summary:');
  console.log('    Checked:', checked);
  console.log('    Fixed' + (APPLY ? '' : ' (would fix)') + ':', fixed);
  console.log('    Skipped (invalid seed count):', skipped);
  if (!APPLY && fixed > 0) {
    console.log('');
    console.log('[Backfill] This was a dry run. Review the entries above, then re-run with --apply to write these fixes.');
  }

  process.exit(0);
}

main().catch(function(err) {
  console.error('[Backfill] FATAL:', err);
  process.exit(1);
});
