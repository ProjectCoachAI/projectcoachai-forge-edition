#!/usr/bin/env node
// backfill-native-seed-count.js
//
// One-time repair for a confirmed, real bug in the Sync merge logic
// (backend/routes/diary.js): nativeSeedMessageCount was never updated
// after a successful native-side sync, despite newly-synced native
// messages genuinely being spliced into chat_sessions.messages ahead of
// the stored boundary each time. For any entry with exactly one
// successful sync since forking, this only left the stored count stale
// (a mislabeling, not a data problem). For any entry with TWO OR MORE
// successful native-side syncs since forking, it's worse: each sync
// after the first re-inserted at the same, unmoved (stale) position,
// pushing the previous sync's own content after it — genuinely
// reversing the relative order of sequential native syncs within
// chat_sessions.messages itself. Confirmed by direct trace-through
// before writing this, not assumed.
//
// FIX STRATEGY, confirmed safe before implementing:
// The entry's own `content` field is untouched by this bug — it's
// maintained independently by Sync's separate "save" step, and is
// always the full, correctly-ordered native conversation regardless of
// what happened to chat_sessions.messages. It's therefore a reliable
// source of truth to rebuild the correct native portion from.
//
// MATCHING LOGIC — POSITION-BASED, NOT TEXT-BASED, and this distinction
// is deliberate: the bug never changes message COUNT, only ORDER — every
// buggy splice still inserts the correct number of elements, just at the
// wrong position. Forge-only messages are always appended via push() at
// the very end and never spliced into the middle, so they are always,
// reliably the LAST N messages in chat_sessions.messages, where
// N = session.messages.length - (correct native count recomputed from
// content). This never compares message TEXT at all, so it cannot be
// confused by two messages that happen to share identical wording (a
// repeated question, a common phrase) — verified directly against a
// concrete worked example before writing this script, not assumed safe.
//
// SAFETY: if N ever comes out negative, that indicates the entry is in
// the separate, already-known "diverged" state (save succeeded, a later
// session-merge attempt didn't — reason: history_mismatch) rather than
// this ordering bug specifically. Those entries are skipped and flagged
// for manual review, never auto-"fixed" by this script's own logic,
// since blind application here could make a genuinely different problem
// worse rather than better.
//
// USAGE:
//   node scripts/backfill-native-seed-count.js           (dry run — default, writes nothing)
//   node scripts/backfill-native-seed-count.js --apply    (writes the fixes)
//
// Dry run is the default deliberately, not opt-in — this rewrites real,
// stored conversation history, not just metadata, so reviewing a sample
// of its proposed changes against real entries before trusting it with
// production data is a required step, not an optional nicety.

// Path updated — this script must live at backend/scripts/ specifically,
// not a repo-root scripts/ folder, confirmed directly against a live
// container: railway.toml's start command ('node server.js', no backend/
// prefix) combined with server.js actually living at backend/server.js
// means the service's Root Directory is set to backend/ in the Railway
// dashboard — so the deployed container's own filesystem root IS
// backend/'s contents, not the full repo. A file outside backend/ never
// reaches the running container at all, confirmed by a real
// MODULE_NOT_FOUND when this lived at the repo-root scripts/ instead.
const db = require('../lib/db');
const diaryRoutes = require('../routes/diary');
const splitEntryIntoMessages = diaryRoutes.splitEntryIntoMessages;

if (typeof splitEntryIntoMessages !== 'function') {
  console.error('[Backfill] FATAL: splitEntryIntoMessages was not found on the diary router export. Aborting — refusing to guess at reimplementing this parsing logic separately, since that duplication is exactly the kind of drift risk this whole feature has been trying to avoid.');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].role !== b[i].role || a[i].content !== b[i].content) return false;
  }
  return true;
}

async function main() {
  await db.init();
  console.log('[Backfill] Mode:', APPLY ? 'APPLY (will write changes)' : 'DRY RUN (no changes will be written — pass --apply to write)');
  console.log('');

  const entriesR = await db.query(
    `SELECT id, user_email, prompt, content, metadata FROM diary_entries
     WHERE metadata->>'chatSessionId' IS NOT NULL
       AND metadata->>'nativeSeedMessageCount' IS NOT NULL`
  );

  console.log('[Backfill] Found', entriesR.rows.length, 'forked-and-synced-at-least-once entries to check.');
  console.log('');

  let checked = 0, alreadyCorrect = 0, fixed = 0, needsManualReview = 0, sessionMissing = 0;

  for (const entry of entriesR.rows) {
    checked++;
    const meta = entry.metadata || {};
    const chatSessionId = meta.chatSessionId;
    const storedSeedCount = meta.nativeSeedMessageCount;

    const session = await db.getChatSession(chatSessionId, entry.user_email);
    if (!session) {
      sessionMissing++;
      console.log('[Backfill] Entry', entry.id, '— chat_sessions row', chatSessionId, 'not found. Skipping (nothing to rebuild against).');
      continue;
    }

    const correctNativeMessages = splitEntryIntoMessages({ prompt: entry.prompt, content: entry.content });
    const trueNativeCount = correctNativeMessages.length;
    const currentTotal = session.messages.length;
    const forgeOnlyCount = currentTotal - trueNativeCount;

    if (forgeOnlyCount < 0) {
      needsManualReview++;
      console.log('[Backfill] Entry', entry.id, '— NEEDS MANUAL REVIEW: recomputed native count (' + trueNativeCount + ') exceeds total session messages (' + currentTotal + '). This indicates the separate, already-known "diverged" state (content has native material not yet reflected in chat_sessions), not this ordering bug — skipping rather than guessing.');
      continue;
    }

    const currentNativePortion = session.messages.slice(0, trueNativeCount);
    const forgeOnlyPortion = session.messages.slice(currentTotal - forgeOnlyCount);

    const orderAlreadyCorrect = arraysEqual(currentNativePortion, correctNativeMessages);
    const seedCountAlreadyCorrect = storedSeedCount === trueNativeCount;

    if (orderAlreadyCorrect && seedCountAlreadyCorrect) {
      alreadyCorrect++;
      continue;
    }

    fixed++;
    console.log('[Backfill] Entry', entry.id, '— AFFECTED:');
    console.log('    stored nativeSeedMessageCount:', storedSeedCount, '-> correct:', trueNativeCount);
    console.log('    session message order correct already:', orderAlreadyCorrect);
    console.log('    total messages:', currentTotal, '(native:', trueNativeCount, '+ forge-only:', forgeOnlyCount, ')');

    if (APPLY) {
      const rebuilt = correctNativeMessages.concat(forgeOnlyPortion);
      await db.updateChatSession(chatSessionId, entry.user_email, rebuilt);
      await db.query(
        `UPDATE diary_entries SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{nativeSeedMessageCount}', $1::jsonb) WHERE id=$2 AND user_email=$3`,
        [JSON.stringify(trueNativeCount), entry.id, entry.user_email]
      );
      console.log('    -> WRITTEN.');
    } else {
      console.log('    -> (dry run — no write performed)');
    }
    console.log('');
  }

  console.log('');
  console.log('[Backfill] Summary:');
  console.log('    Checked:', checked);
  console.log('    Already correct:', alreadyCorrect);
  console.log('    Fixed' + (APPLY ? '' : ' (would fix)') + ':', fixed);
  console.log('    Needs manual review (skipped):', needsManualReview);
  console.log('    Session row missing (skipped):', sessionMissing);
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
