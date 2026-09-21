// ── Diary ↔ Forge sync module ────────────────────────────────────────
// Extracted from backend/routes/diary.js as part of a deliberate,
// architectural simplification pass (per explicit direction): the
// chat_sessions merge/comparison logic lived inline inside the single
// PATCH /:id route handler, making it by far the largest single block
// in that already-2,800-line file — and, not coincidentally, exactly
// the section every history_mismatch fix this session (the whole-
// content redesign, the URL/Sources-footer/bold-marker normalization,
// the turn-count signal) had to be found and edited within. Moving it
// here means it can be found, read, and modified on its own, without
// searching through the rest of the route's own request-handling code
// (auth, image rehosting, metadata merging, etc.) to find the right
// spot.
//
// splitEntryIntoMessages() is moved alongside it since the two are
// tightly coupled (the sync logic calls it directly) and it's already
// attached to the diary router's own module.exports as an expando
// property, consumed externally by two maintenance scripts
// (backend/scripts/diagnose-diverged-entries.js and
// backend/scripts/backfill-native-seed-count.js) — that same
// attachment now simply points to this file's own export instead of a
// locally-defined function, with no change needed on either script's
// own side.
const db = require('../lib/db');

// UNCHANGED from its own original inline version in diary.js — see
// this module's own opening comment for why it moved.
function splitEntryIntoMessages(entry, dropSourcesForComparison) {
  const messages = [];
  let text = entry.content || '';

  let sourcesText = '';
  const sourcesMatch = text.match(/\n\n---\n\n\*\*Sources:\*\*\n([\s\S]*)$/);
  if (sourcesMatch) {
    sourcesText = text.slice(sourcesMatch.index);
    text = text.slice(0, sourcesMatch.index);
  }

  const TITLE_MARK = '\u2063';
  const markerRe = new RegExp(TITLE_MARK + '\\*\\*([^*]+)\\*\\*' + TITLE_MARK, 'g');
  let lastIndex = 0;
  let m;
  while ((m = markerRe.exec(text)) !== null) {
    const before = text.slice(lastIndex, m.index).replace(/^\n+|\n+$/g, '');
    if (before) messages.push({ role: 'assistant', content: before });
    messages.push({ role: 'user', content: m[1] });
    lastIndex = markerRe.lastIndex;
  }
  const rest = text.slice(lastIndex).replace(/^\n+/, '');
  if (rest) messages.push({ role: 'assistant', content: rest });

  const firstQuestionAlreadyCaptured = messages.length > 0 && messages[0].role === 'user' &&
    entry.prompt && messages[0].content.trim() === entry.prompt.trim();
  if (entry.prompt && !firstQuestionAlreadyCaptured) {
    messages.unshift({ role: 'user', content: entry.prompt });
  }

  // NOTE: fixed — confirmed live as a real, reproduced false-positive
  // history_mismatch. The Sources footer always attaches to whichever
  // message is LAST at parse time — but that position genuinely shifts
  // every time a new Q&A pair is appended (the footer that used to
  // belong to message N now belongs to message N+1 once a new pair
  // exists). Comparing an old parse against a new parse then found the
  // SAME, unchanged earlier answer differing character-for-character,
  // purely because of where the footer happened to land in each parse
  // — not because any real content changed at all. dropSourcesForComparison,
  // used only by the old-vs-new clean-extension check in this route's
  // own PATCH handler (never by continue.html's identical copy, which
  // has no such comparison to make), skips re-attaching the footer to
  // any message entirely, so it can never cause a spurious mismatch.
  // The actual trailing messages inserted into chat_sessions still come
  // from a normal, full parse (this parameter omitted), so the real,
  // final content isn't missing its own Sources footer at all.
  if (!dropSourcesForComparison) {
    if (sourcesText && messages.length && messages[messages.length - 1].role === 'assistant') {
      messages[messages.length - 1].content += sourcesText;
    } else if (sourcesText) {
      messages.push({ role: 'assistant', content: sourcesText.replace(/^\n+/, '') });
    }
  }

  return messages;
}

// Extracted from what was previously inline inside the PATCH /:id
// route's own body — see this module's own opening comment for the
// full rationale. Behavior is UNCHANGED from that inline version; only
// the packaging moved.
//
// One real constraint shaped this extraction: the original block also
// pushed onto the route's own `sets`/`params` arrays (using
// $${i++}-style, position-dependent placeholders) whenever content
// should be written to the content/search_text columns directly (the
// pre-fork case, and the "entry doesn't exist at all" edge case). That
// positional bookkeeping can't safely move into a separate function
// without also moving the surrounding SET-clause construction it
// depends on — so this returns willWriteContentDirectly: true in
// those two cases instead, and diary.js's own call site is
// responsible for the actual sets.push()/params.push() calls when
// that flag comes back true, exactly where that logic already lived.
//
// Params: { id, content, prompt, turnCount, userEmail }
// Returns: { chatSessionSyncResult, willWriteContentDirectly }
async function performChatSessionSync({ id, content, prompt, turnCount, userEmail }) {
  let chatSessionSyncResult = null;
  let willWriteContentDirectly = false;

  const existingForSync = await db.query(
    'SELECT content, prompt, metadata FROM diary_entries WHERE id=$1 AND user_email=$2',
    [id, userEmail]
  );
  if (!existingForSync.rows.length) {
    // Edge case: content sent for an id that turns out not to exist at
    // all (shouldn't normally happen given the route already requires
    // an existing id, but handled directly rather than silently
    // dropping the write). No chatSessionId to check here at all, so
    // this is unambiguously the pre-fork case -- same behavior as
    // before this change.
    willWriteContentDirectly = true;
    return { chatSessionSyncResult, willWriteContentDirectly };
  }

  const oldRow = existingForSync.rows[0];
  const oldMeta = oldRow.metadata || {};
  const chatSessionId = oldMeta.chatSessionId;
  // Architectural simplification (Diary sync audit): once an entry
  // is forked to Forge, the unified view (app.html's own
  // renderUnifiedEntryContent) reads EXCLUSIVELY from
  // chat_sessions.messages -- confirmed directly by reading that
  // function -- never falling back to reading this column again.
  // Every sync was nonetheless still unconditionally overwriting
  // this column too, on every single save, regardless of whether
  // the chat_sessions merge below even succeeded -- provably wasted
  // work for a column nobody ever reads again post-fork, and,
  // architecturally, the exact root structural fact behind every
  // history_mismatch bug chased the day before this: two
  // independently-written "sources of truth" for the same
  // conversation that could genuinely disagree with each other,
  // since one (this column) updates unconditionally while the
  // other (chat_sessions.messages, below) is gated behind real
  // comparison logic. Skipping this column's own write entirely
  // once chatSessionId exists doesn't just optimize around that
  // fact -- it removes the disagreement from ever being possible
  // in the first place, by construction, rather than continuing to
  // detect and patch its symptoms one at a time. Pre-fork entries
  // are entirely unaffected -- this column is still their only
  // source of truth, so it's still written exactly as before.
  if (!chatSessionId) {
    willWriteContentDirectly = true;
  }
  const seedCount = oldMeta.nativeSeedMessageCount;
  // Last-known turn count, set only by a provider that explicitly
  // sends its own turnCount (currently ChatGPT only — see
  // diary-content.js's own declaration comment for why). Absent
  // (undefined) for every entry never synced with such a provider,
  // or synced before this field existed at all.
  const oldTurnCount = oldMeta.lastKnownTurnCount;
  if (chatSessionId && typeof seedCount === 'number') {
    // lastSyncedAt is set whenever this check runs at all,
    // regardless of outcome (merged, mismatch, or no new content
    // found) — per the brief's own guidance, "synced as of
    // [time]" reflects the last time alignment with the native
    // side was actually checked, not just the last time new
    // content happened to be found. Written via its own, direct
    // query rather than relying on this request also including
    // its own separate metadata update — performSaveToDiary()'s
    // own PATCH payload shape shouldn't need to be aware of this
    // at all for it to work correctly.
    const lastSyncedAt = new Date().toISOString();
    await db.query(
      `UPDATE diary_entries SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{lastSyncedAt}', $1::jsonb) WHERE id=$2 AND user_email=$3`,
      [JSON.stringify(lastSyncedAt), id, userEmail]
    );
    // Comparison uses dropSourcesForComparison — see
    // splitEntryIntoMessages' own comment for why the Sources
    // footer's shifting attachment point would otherwise cause a
    // false-positive mismatch on the very same, unchanged earlier
    // content. The actual messages inserted into chat_sessions
    // still come from a normal, full parse of the new content
    // (newMessagesFull below), so the real, saved message keeps
    // its own Sources footer intact — only the comparison itself
    // ignores it.
    //
    // NOTE: per-message splitting is no longer used for the
    // comparison itself (see the whole-content redesign below) —
    // only oldRow.content and content (the raw, unsplit strings)
    // are compared now, precisely to avoid depending on
    // splitEntryIntoMessages' own splitting decisions lining up
    // identically across two separate captures.
    // Confirmed as a real, direct root cause via live diagnostic
    // evidence: a genuinely long, established Grok conversation
    // produced a history_mismatch where the "new" side's own
    // message 0 was a completely different, much-later question
    // than the conversation's real first one — despite this being
    // confirmed live as the exact same, single, unbroken
    // conversation from start to end, never a different one. Root
    // cause: `prompt` here is freshly re-derived from whatever
    // prompt-selector element happens to match FIRST in the live
    // DOM at save time — which is only reliably the conversation's
    // true first question for a short conversation with every
    // turn still rendered. Long chat UIs commonly virtualize
    // (remove) older DOM nodes to save memory, at which point the
    // first-matching element is just whatever's currently
    // topmost-rendered, not genuinely the conversation's own first
    // message at all — reproduced live: it resolved to a much
    // later, unrelated-looking question instead. A conversation's
    // own true first question is immutable once correctly
    // captured once, so an already-established oldRow.prompt is
    // always more trustworthy than a fresh re-capture that DOM
    // virtualization can silently corrupt — only ever falls back
    // to the freshly-submitted prompt when no established one
    // exists yet at all (a genuinely new entry).
    const newPromptForCompare = oldRow.prompt || prompt;
    // Confirmed as a real, direct cause of a genuinely persistent
    // "still syncing" state (reported live across multiple DOM-
    // scraping providers, e.g. Grok): this comparison used exact,
    // byte-for-byte string equality, with zero normalization at
    // all. A DOM-scraped capture can never guarantee identical
    // whitespace/line-breaks across two entirely separate re-reads
    // of the same conversation (confirmed elsewhere in this file —
    // Turndown's own markdown conversion, re-run fresh each sync
    // attempt, is not guaranteed byte-identical across runs even
    // when the underlying DOM content hasn't changed at all). Once
    // a single sync attempt ever failed this exact-match check due
    // to purely cosmetic whitespace drift, EVERY subsequent attempt
    // would likely fail the identical way too, since the capture
    // mechanism itself has no reason to suddenly start producing
    // byte-identical output — meaning the resulting
    // history_mismatch/lastSyncDiverged state could never clear
    // itself at all, regardless of how many times the user
    // resynced. Normalizing (collapsing whitespace runs, trimming)
    // before comparing means only genuine content differences can
    // still trigger a real mismatch, while inconsequential
    // formatting drift no longer can.
    //
    // Extended to also strip out URLs entirely before comparing.
    // Confirmed live as a real, direct root cause of a
    // false-positive history_mismatch on ChatGPT: a search-
    // citation link embedded mid-sentence genuinely re-resolved to
    // a DIFFERENT URL across two separate captures of the exact
    // same conversation -- verified directly, byte-for-byte, that
    // the two captures were identical everywhere except these
    // embedded links. A citation's own target link changing is not
    // a genuine content change to the actual answer text, the same
    // reasoning already applied to whitespace drift above -- so
    // URLs are stripped before comparing, the same way whitespace
    // already is.
    //
    // Extended again to strip "**" bold markers too. Root-cause
    // audit (after finding a THIRD distinct history_mismatch
    // pattern on ChatGPT within two days -- a citation link, a
    // message growing in place, and now a shifted message index --
    // each looking unrelated on the surface) found these three were
    // all symptoms of the SAME underlying design fact: comparing a
    // freshly re-parsed message list against a previously stored
    // one is inherently fragile for any provider whose captured
    // text isn't guaranteed byte-for-byte reproducible across two
    // separate reads -- which ChatGPT's clipboard-copy mechanism,
    // by its own nature, isn't. Splitting into individual messages
    // works by scanning for "**bolded question**" markers embedded
    // in the raw text; if that marker's own exact position varies
    // even slightly between two captures of the identical
    // conversation (confirmed plausible given ChatGPT's clipboard
    // output has no reproducibility guarantee), every message
    // index after that point shifts, and a POSITIONAL
    // (index-by-index) comparison treats a shifted-but-unchanged
    // conversation as a wall of individually wrong messages.
    //
    // Rather than patching this specific splitting quirk as a
    // fourth special case (the same trajectory as the previous two
    // fixes, which is exactly what surfaced this pattern), the
    // comparison itself is redesigned below to compare the WHOLE,
    // UNSPLIT content strings first, before any message-splitting
    // happens at all -- sidestepping the unstable step entirely,
    // rather than trying to out-guess every way it can vary.
    // Stripping bold markers here (alongside URLs and whitespace)
    // means marker-position drift can no longer register as a
    // content difference, the same reasoning already applied to
    // whitespace and citation links above.
    //
    // Extended again to also strip the Sources footer entirely
    // (same regex already used in splitEntryIntoMessages' own
    // dropSourcesForComparison path above). This whole-content
    // redesign never called that function for comparison purposes
    // at all, so the footer's own already-documented behavior --
    // it always re-attaches to whichever message is LAST at parse
    // time, meaning its position genuinely moves every time a new
    // Q&A pair is added -- was never actually accounted for here,
    // a genuine regression from this redesign rather than a new,
    // separate bug. Confirmed live: a real old content string
    // ending in a Sources footer was compared against a real new
    // string where a further turn had been added, moving that same
    // footer to the new end -- meaning the old content's own
    // trailing text (the footer) never appeared in the new content
    // at its original position at all, correctly failing the
    // prefix check for entirely the wrong reason (a footer that
    // relocated, not a real difference in the actual answer).
    //
    // Fixed a second time, same day: the regex above used a plain
    // (non-global) match anchored to end-of-string ($), which finds
    // the FIRST "\n\n---\n\n**Sources:**\n" occurrence still capable
    // of matching through to the end -- but a conversation with
    // MULTIPLE search-backed answers has one such footer per
    // answer, not just one for the whole entry. Confirmed live: a
    // real ChatGPT conversation with two separate search-backed
    // turns had its comparison silently treat the SECOND turn's own
    // real question and answer as part of "the footer" and strip
    // them entirely, making the new content look no longer than
    // the old one and returning "no_new_content" even though a
    // second, genuinely new exchange existed and was never saved
    // at all. Fixed by greedily consuming everything up to the
    // LAST such marker instead of the first ([\s\S]* before the
    // marker itself, rather than after it), so only the single,
    // truly final footer -- whichever answer currently sits last
    // -- is ever removed, regardless of how many earlier answers
    // also happen to have their own footers.
    const stripSourcesFooter = (s) => {
      var str = s || '';
      var marker = '\n\n---\n\n**Sources:**\n';
      var idx = str.lastIndexOf(marker);
      return idx === -1 ? str : str.slice(0, idx);
    };
    const normalizeForCompare = (s) => stripSourcesFooter(s || '')
      .replace(/https?:\/\/\S+/g, '')  // URLs
      .replace(/\*\*/g, '')            // bold markers
      .replace(/\*/g, '')              // italic markers — confirmed live: network-interceptor
                                       // captures and DOM Turndown captures use the same
                                       // underlying markdown but single-asterisk italic
                                       // wrapping can differ in placement or presence,
                                       // causing false-positive history_mismatch. Safe to
                                       // strip: the word content they wrap is unchanged.
      .replace(/^#+\s*/gm, '')         // header markers — same reasoning: # vs ## vs plain
                                       // heading text differs between capture paths
      .replace(/\s+/g, ' ').trim();
    // Whole-content comparison replaces the previous per-message,
    // positional comparison entirely (see the audit note above for
    // why). If the new, normalized content genuinely starts with
    // the old, normalized content, every character the old side
    // had is still present, unchanged, within the new side -- this
    // is true regardless of how message-splitting itself might
    // divide that same text into individual bubbles this time
    // versus last time, since splitting never adds, removes, or
    // reorders any of the underlying characters, only decides
    // where to draw boundaries between them.
    //
    // This still satisfies the original, load-bearing purpose of
    // this whole check -- preventing a genuinely different,
    // unrelated conversation's content from ever being silently
    // merged into the wrong entry (the original, confirmed-live
    // failure mode this mechanism was built to catch) -- because a
    // truly different conversation's own text will essentially
    // never happen to start with another, unrelated conversation's
    // full text verbatim. Tested directly below against both the
    // three known-fixed cases AND a deliberate wrong-conversation
    // scenario before this was considered done.
    const oldContentNorm = normalizeForCompare(oldRow.content);
    const newContentNorm = normalizeForCompare(content);
    const isCleanExtension = newContentNorm.startsWith(oldContentNorm);
    if (!isCleanExtension) {
      // Finds the EXACT character index where the two normalized
      // strings first diverge, rather than logging a fixed first-
      // 300-char window that may show nothing useful at all if
      // both sides happen to share a longer common start (exactly
      // what happened on a real, live case: both previews were
      // identical for 300+ chars, with the actual divergence
      // somewhere further in — meaning the previous window-based
      // log couldn't diagnose it at all). Walks both strings
      // together, character by character, and logs a small window
      // immediately around the first point they differ, so the
      // actual difference is directly visible regardless of how
      // far into the content it occurs.
      var divergeAt = 0;
      var maxCheck = Math.min(oldContentNorm.length, newContentNorm.length);
      while (divergeAt < maxCheck && oldContentNorm[divergeAt] === newContentNorm[divergeAt]) divergeAt++;
      var windowStart = Math.max(0, divergeAt - 80);
      console.log('[Diary Sync DIAG] history_mismatch (whole-content compare) — old content does not appear as a prefix of new content.',
        '| diverges at character index', divergeAt, 'of', oldContentNorm.length, '(old) /', newContentNorm.length, '(new)',
        '| old around divergence:', JSON.stringify(oldContentNorm.slice(windowStart, divergeAt + 120)),
        '| new around divergence:', JSON.stringify(newContentNorm.slice(windowStart, divergeAt + 120)));
    }
    // "Has new content" decision, redesigned per explicit direction
    // to apply the SAME lesson already applied to isCleanExtension
    // itself: compare something the extension already knows
    // directly and reliably (turnCount — an explicit integer sent
    // alongside the content) rather than something re-derived from
    // unstable, cosmetically-variable text (content length). Three
    // separate same-day bugs (a citation link, a Sources-footer
    // relocation, a Sources-footer occurrence count) each
    // independently caused newContentNorm's own LENGTH to come out
    // equal to or shorter than oldContentNorm's, despite genuinely
    // new content existing — because each was a different way the
    // TEXT could cosmetically shrink or shift, a category of bug
    // with no natural end, versus turnCount, a single integer with
    // no equivalent cosmetic-variation surface at all.
    //
    // Deliberately narrow in scope: turnCount, when available, is
    // an ADDITIONAL signal alongside the length check (see the
    // corrected note below on why this is OR, not replacement) —
    // never touching isCleanExtension itself, which still runs
    // unconditionally as the wrong-conversation protection. Turn
    // count alone cannot distinguish "6 turns, 2 genuinely new at the
    // end" from "6 turns, someone silently edited turn 3" -- both
    // look identical to a pure count comparison -- but isCleanExtension's
    // own full prefix check already catches that case on its own:
    // an edited EARLIER message breaks the "new starts with old"
    // relationship regardless of whether the turn count stayed the
    // same, so this is a real, tested guard against exactly that
    // risk, not an unaddressed gap.
    //
    // Only ever engages when turnCount is explicitly provided as a
    // number (currently ChatGPT only) — every other provider falls
    // straight through to the original, untouched length-based
    // check, so their own sync behavior is completely unchanged.
    //
    // Deliberately an ADDITIONAL signal, not a REPLACEMENT for the
    // length check — confirmed necessary by direct testing: turn
    // count alone would wrongly say "nothing new" for the already-
    // fixed "message grew in place" case (same turn count, longer
    // text), since growing an existing answer never changes how
    // many turns exist at all. Either signal being true (a genuine
    // new turn, OR a genuine growth within an existing turn) is
    // sufficient on its own to mean real new content exists.
    const turnCountProvided = typeof turnCount === 'number' && typeof oldTurnCount === 'number';
    const hasNewContent = (turnCountProvided && turnCount > oldTurnCount) || (newContentNorm.length > oldContentNorm.length);
    if (turnCountProvided) {
      console.log('[Diary Sync DIAG] turn-count compare — old:', oldTurnCount, '| new:', turnCount, '| hasNewContent:', hasNewContent);
    }
    if (isCleanExtension && hasNewContent) {
      // Merge step simplified alongside the comparison redesign
      // above: rather than surgically patching individual messages
      // in place (which depended on the old, positional message
      // list lining up index-for-index with the new one -- the
      // exact assumption just proven unsafe), the entire native
      // portion of the stored message list (everything from
      // seedCount onward) is replaced wholesale with a fresh split
      // of the new, longer content. This is safe specifically
      // because isCleanExtension above already confirmed the new
      // content is a strict superset of the old, so nothing the
      // native portion currently holds is lost by this
      // replacement -- only regenerated from a string that's
      // provably at least as complete as what it's replacing.
      const newMessagesFull = splitEntryIntoMessages({ prompt: newPromptForCompare, content });
      const newNativeMessages = newMessagesFull.slice(seedCount);
      const session = await db.getChatSession(chatSessionId, userEmail);
      if (session) {
        // Confirmed as a real, direct, serious bug -- reported live and
        // reproduced across two separate providers (Perplexity, then
        // Gemini): this line was introduced by the whole-content
        // redesign the day before this fix, replacing the PREVIOUS
        // design's own explicit handling for exactly this case (see its
        // own comment, still partially visible in git history: "inserts
        // newly-detected native messages at that index, pushing any
        // existing Forge-only messages down"). That handling depended on
        // knowing where the native portion currently ENDS -- a second
        // boundary this redesign never tracked at all, only ever
        // recording where it STARTED at the original moment of forking
        // (nativeSeedMessageCount). Without that second boundary,
        // `session.messages.slice(0, seedCount).concat(newNativeMessages)`
        // has no way to tell "old native message, safe to replace" apart
        // from "genuine Continue Conversation addition, must be
        // preserved" within session.messages.slice(seedCount) -- it
        // silently treated everything past the seed as replaceable
        // native content, discarding any real Forge-side conversation
        // that had been added there entirely. Directly simulated and
        // confirmed: a session with genuine Forge-only messages past the
        // seed lost them completely under the old line the moment a new,
        // legitimately-longer native sync came in.
        //
        // Fixed with a new, second metadata field -- nativeMessageCount
        // -- tracking how many messages currently in chat_sessions.messages
        // are native, updated after every successful merge (below),
        // separate from nativeSeedMessageCount which correctly never
        // changes after the initial fork. This restores the ORIGINAL,
        // pre-redesign guarantee (insert new native content only up to
        // the current native/Forge boundary, leaving anything past it
        // untouched) while keeping this session's own whole-content
        // comparison redesign, which solved a real, separate problem
        // (see isCleanExtension's own comment above) and is unrelated to
        // this bug.
        //
        // Fallback for an entry that hasn't been through a sync since
        // this field was introduced: defaults to session.messages.length
        // at this moment -- the same assumption the previous, buggy line
        // effectively made. This is deliberately the LESS disruptive of
        // two imperfect options for an entry in this specific, one-time
        // transitional state: it keeps today's exact (still-buggy)
        // behavior for this ONE sync only, rather than risking duplicate
        // native messages for the likely-common case of an entry with no
        // Forge-only additions at all (which the alternative fallback --
        // treating everything past the seed as Forge-only -- would cause,
        // by pushing already-correct native content down instead of
        // replacing it). Once nativeMessageCount is backfilled by this
        // same merge, below, every subsequent sync for this entry is
        // correctly protected going forward.
        const nativeMessageCount = typeof oldMeta.nativeMessageCount === 'number' ? oldMeta.nativeMessageCount : session.messages.length;
        const forgeOnlyMessages = session.messages.slice(nativeMessageCount);
        const merged = session.messages.slice(0, seedCount).concat(newNativeMessages).concat(forgeOnlyMessages);
        await db.updateChatSession(chatSessionId, userEmail, merged);
        // Records the new native/Forge boundary for the NEXT sync's own
        // use of this same field, above -- the native portion just
        // became seedCount + newNativeMessages.length messages long, so
        // that's where the next sync should resume looking for the
        // Forge-only tail to preserve.
        await db.query(
          `UPDATE diary_entries SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{nativeMessageCount}', $1::jsonb) WHERE id=$2 AND user_email=$3`,
          [JSON.stringify(seedCount + newNativeMessages.length), id, userEmail]
        );
        // search_text kept alive post-fork, now derived from
        // chat_sessions.messages (the only thing ever actually
        // displayed after a fork) instead of the diary_entries.content
        // column, which is deliberately no longer written at all once
        // chatSessionId exists (see this block's own opening comment).
        // Without this, the standalone search feature would silently
        // freeze at whatever text existed at the moment of forking,
        // never reflecting anything synced in afterward.
        const searchTextFromMerged = merged.map(m => (m && m.content) || '').join(' ').slice(0, 500).toLowerCase();
        await db.query(
          'UPDATE diary_entries SET search_text=$1 WHERE id=$2 AND user_email=$3',
          [searchTextFromMerged, id, userEmail]
        );
        const oldNativeMessageCount = nativeMessageCount - seedCount;
        const addedCount = Math.max(0, newNativeMessages.length - oldNativeMessageCount);
        // seedCount (nativeSeedMessageCount) no longer needs
        // updating here at all -- unlike the previous, surgical-
        // patch design, this replacement never inserts anything
        // AHEAD of the seed/native boundary; it only ever replaces
        // what already comes after it, so that boundary's own
        // position never moves.
        //
        // Clears any prior diverged flag — a later, genuinely
        // successful sync resolves whatever divergence a previous
        // history_mismatch left behind, so the unified view's own
        // "still syncing" indicator (added alongside this) shouldn't
        // keep showing once the two sides are demonstrably back in
        // sync.
        await db.query(
          `UPDATE diary_entries SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{lastSyncDiverged}', 'false'::jsonb) WHERE id=$1 AND user_email=$2`,
          [id, userEmail]
        );
        // Persists this sync's own turnCount (when the provider
        // sent one) as the new baseline for the NEXT sync's own
        // turn-count comparison above. Only ever written when
        // turnCount was actually provided this time -- an entry
        // never synced by a turnCount-aware provider (or one
        // synced before this field existed at all) simply never
        // gets this field at all, correctly falling through to the
        // original length-based comparison on its own next sync
        // too, exactly as intended.
        if (typeof turnCount === 'number') {
          await db.query(
            `UPDATE diary_entries SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{lastKnownTurnCount}', $1::jsonb) WHERE id=$2 AND user_email=$3`,
            [JSON.stringify(turnCount), id, userEmail]
          );
        }
        chatSessionSyncResult = { merged: true, addedCount, lastSyncedAt };
      }
    } else if (!isCleanExtension) {
      // NOTE: auto-reset added — confirmed as a real, live problem via
      // user report: an entry whose very first sync returned
      // history_mismatch (setting lastSyncDiverged = true) would stay
      // permanently stuck, because every subsequent sync attempt also
      // returned history_mismatch (same format mismatch between the
      // network-interceptor-captured content stored on the first save
      // and the DOM-scraped Turndown markdown the sync tab produces
      // every time it re-reads the page). The old branch just kept
      // writing lastSyncDiverged = true over and over, which was
      // already true, so nothing ever changed. The "Still syncing the
      // Forge side" indicator persisted indefinitely regardless of how
      // many times the user triggered a sync.
      //
      // Auto-reset strategy: on history_mismatch, if lastSyncDiverged
      // is ALREADY true (meaning the entry is in the confirmed-stuck
      // state), treat the current sync's own content as the new native
      // baseline and re-seed the chat session from it — same operation
      // as a regular successful merge, but without requiring
      // isCleanExtension (since the mismatch is a known, persistent
      // format difference rather than a genuine content divergence).
      // The Forge-only tail is preserved from session.messages using
      // the same nativeMessageCount boundary already maintained for
      // the regular merge path. If this is the FIRST mismatch (entry
      // not yet stuck), the old behavior is preserved: set
      // lastSyncDiverged = true so the indicator appears and a
      // subsequent sync can attempt the reset.
      //
      // Safety: only force-reset if the new content actually has
      // messages after the seed (i.e., the sync tab captured real
      // content), and only if the chat session is accessible. If
      // either guard fails, falls through to the same lastSyncDiverged
      // = true outcome as before — a failed force-reset is no worse
      // than no reset at all.
      const alreadyStuck = oldMeta.lastSyncDiverged === true;
      let forceResetApplied = false;

      if (alreadyStuck) {
        try {
          const resetSession = await db.getChatSession(chatSessionId, userEmail);
          if (resetSession) {
            const newMessagesFull = splitEntryIntoMessages({ prompt: newPromptForCompare, content });
            const newNativeMessages = newMessagesFull.slice(seedCount);
            if (newNativeMessages.length > 0) {
              const currentNativeCount = typeof oldMeta.nativeMessageCount === 'number' ? oldMeta.nativeMessageCount : resetSession.messages.length;
              const forgeOnlyTail = resetSession.messages.slice(currentNativeCount);
              const resetMerged = resetSession.messages.slice(0, seedCount).concat(newNativeMessages).concat(forgeOnlyTail);
              await db.updateChatSession(chatSessionId, userEmail, resetMerged);
              const newNativeTotal = seedCount + newNativeMessages.length;
              await db.query(
                `UPDATE diary_entries SET metadata = jsonb_set(jsonb_set(COALESCE(metadata, '{}'::jsonb), '{nativeMessageCount}', $1::jsonb), '{lastSyncDiverged}', 'false'::jsonb) WHERE id=$2 AND user_email=$3`,
                [JSON.stringify(newNativeTotal), id, userEmail]
              );
              // NOTE: also update diary_entries.content to the new
              // DOM-captured content — this is the fix for the
              // auto-reset cycle confirmed live: the auto-reset
              // previously only updated chat_sessions.messages and
              // nativeMessageCount, leaving diary_entries.content as
              // the original network-interceptor-captured text. On the
              // very next sync, oldRow.content still had the old
              // format, newContentNorm had Turndown DOM format, and
              // isCleanExtension failed again immediately —
              // lastSyncDiverged was set to true again right away,
              // cycling indefinitely. By updating content here, the
              // next sync's oldRow.content is in Turndown format, and
              // newContentNorm (also Turndown) matches it correctly.
              // Safe on a forked entry: display already reads from
              // chat_sessions.messages exclusively, not content.
              await db.query(
                'UPDATE diary_entries SET content=$1 WHERE id=$2 AND user_email=$3',
                [content, id, userEmail]
              );
              const searchTextReset = resetMerged.map(m => (m && m.content) || '').join(' ').slice(0, 500).toLowerCase();
              await db.query(
                'UPDATE diary_entries SET search_text=$1 WHERE id=$2 AND user_email=$3',
                [searchTextReset, id, userEmail]
              );
              console.log('[Diary Sync DIAG] force-reset applied — entry was stuck in lastSyncDiverged; re-seeded native portion (' + newNativeMessages.length + ' new native msgs) + preserved ' + forgeOnlyTail.length + ' Forge-only messages. content + lastSyncDiverged cleared.');
              chatSessionSyncResult = { merged: true, addedCount: 0, reason: 'force_reset', lastSyncedAt };
              forceResetApplied = true;
            }
          }
        } catch (resetErr) {
          console.warn('[Diary Sync DIAG] force-reset attempt failed, falling through to history_mismatch:', resetErr && resetErr.message);
        }
      }

      if (!forceResetApplied) {
        // Confirmed as a real, necessary addition before building the
        // unified view on top of this: previously, ONLY lastSyncedAt
        // (a timestamp) was ever persisted here — the actual outcome
        // (history_mismatch vs. genuine success) existed only in this
        // one API response and was gone the moment it was sent. That
        // meant a later visit to this same entry had no way to know
        // it was in a diverged state at all. Persisted here so the
        // unified Diary view can show a light, honest "still syncing
        // the Forge side" indicator instead of silently displaying a
        // native portion that's ahead of what the Forge-only portion
        // reflects, with no explanation.
        await db.query(
          `UPDATE diary_entries SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{lastSyncDiverged}', 'true'::jsonb) WHERE id=$1 AND user_email=$2`,
          [id, userEmail]
        );
        chatSessionSyncResult = { merged: false, reason: 'history_mismatch', lastSyncedAt };
      }
    } else {
      // Genuine "nothing new to merge" is not a divergence — clears
      // any stale diverged flag from an earlier, since-resolved
      // mismatch, same reasoning as the merged:true branch above.
      await db.query(
        `UPDATE diary_entries SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{lastSyncDiverged}', 'false'::jsonb) WHERE id=$1 AND user_email=$2`,
        [id, userEmail]
      );
      chatSessionSyncResult = { merged: false, reason: 'no_new_content', lastSyncedAt };
    }
  }

  return { chatSessionSyncResult, willWriteContentDirectly };
}

module.exports = { splitEntryIntoMessages, performChatSessionSync };
