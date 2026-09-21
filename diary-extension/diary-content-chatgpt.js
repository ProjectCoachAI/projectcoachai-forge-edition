// ── ChatGPT-specific capture module ─────────────────────────────────
// Extracted from diary-content.js as part of a deliberate, architectural
// simplification pass (per explicit direction): ChatGPT's own capture
// logic had grown into the single largest self-contained block within
// that file, the result of a genuinely harder integration than every
// other provider (no reliable network response to intercept, a
// virtualizing DOM, a documented backend propagation delay) — moving it
// into its own file means it's no longer mixed in with every other
// provider's own, much simpler capture logic, and can be found, read,
// and modified without searching through a single ~5,000-line file to
// find the right ~250-line section within it.
//
// Loaded as an additional content script alongside diary-content.js
// (see manifest.json's own content_scripts entry) — Manifest V3 already
// supports multiple JS files listed together for the same match
// pattern, all executed into the SAME isolated-world global scope, so
// every top-level function here is directly callable from
// diary-content.js exactly as if it were still defined inline, with no
// import/export mechanism needed at all. The one cross-file dependency
// this file has -- boldQuestion(), defined in diary-content.js itself
// -- works correctly regardless of which file's own <script> tag
// executes first: it's declared with `function name(){}` syntax, which
// is fully hoisted before either file's own top-level code ever runs,
// not just its name the way `const`/`var` would be. Still listed after
// diary-content.js in the manifest for intuitive read-order, though
// this isn't strictly required for correctness.

// Extracted verbatim from diary-content.js's own inline version --
// behavior is unchanged, only the packaging moved. See background.js's
// own SAVE_TO_DIARY handler and diary-content.js's own
// performSaveToDiary() for how this fits into the wider save flow.
async function attemptChatGPTClipboardCapture() {
  var result = { success: false, fullThread: null, turnCount: null, prompt: null };
  try {
    // NOTE: early-exit added — confirmed as the direct root cause of
    // "indefinite sync" for ChatGPT: navigator.clipboard.readText() in
    // a backgrounded tab returns a promise that NEVER resolves (doesn't
    // throw, doesn't reject, just hangs). The try/catch below only
    // catches thrown errors, not a hanging promise. Every sync tab
    // attempt hit this hang, waited out the 10-second per-attempt
    // timeout, retried — 25 times over 6 minutes total (confirmed live
    // via log: 25 retries × "capture not ready yet" × 2s each, with
    // tabBackgroundedMsBySyncEnd: 357074ms). document.hasFocus() is
    // false in a backgrounded tab, which is also the exact condition
    // that makes clipboard writes fail silently (no document focus →
    // copyBtn.click() does nothing → clipboard unchanged → capture
    // would fail anyway even if readText() resolved). Returning early
    // skips the entire clipboard loop, letting performSaveToDiary()
    // fall through to the DOM-captured turns already in
    // window.__diaryCapture.turns (pushed by _chatgptCheckStable's own
    // background polling, which runs independently and successfully
    // even in backgrounded tabs via MutationObserver). The Promise.race
    // timeouts below are kept as a safety net for the focused case,
    // in case focus changes between this check and the actual read.
    if (!document.hasFocus()) {
      console.log('[Diary] ChatGPT clipboard skipped — tab not focused; falling through to DOM-captured turns');
      return result;
    }

    var originalClipboard = '';
    try {
      originalClipboard = await Promise.race([
        navigator.clipboard.readText(),
        new Promise(function(_, rej) { setTimeout(function() { rej(new Error('clipboard_timeout')); }, 3000); })
      ]);
    } catch(e) {}

    // ChatGPT virtualizes the conversation view — confirmed live:
    // turn counts changed after scrolling to the top. A SINGLE
    // scroll + fixed 800ms wait was NOT enough on its own — also
    // confirmed live: user-turn and assistant-turn counts came back
    // MISMATCHED (2 vs 3) even after that scroll, meaning
    // virtualization hadn't settled AND, separately, the previous
    // code paired userSections[i] with assistantSections[i] by raw
    // array index — when those two counts differ, that silently
    // pairs the wrong question with the wrong answer rather than
    // just leaving a gap, which is a worse failure mode than
    // missing content. Fixed two ways: (1) walk turns in actual
    // DOCUMENT ORDER via a single combined query, using each
    // element's own data-turn attribute, instead of pairing two
    // separately-indexed NodeLists that virtualization can make
    // inconsistent with each other, and (2) below — the polling
    // used to just wait for the DOM count to "stop changing", but
    // that's NOT the same as "correct": confirmed live, it
    // stabilized at 9 turns for a conversation that actually had
    // 10, and silently accepted that as done. Polling now compares
    // against the TRUE turn count from the history-JSON endpoint
    // (ChatGPT's actual backend record, not the rendered/
    // virtualized DOM) instead of just checking for its own
    // agreement with itself.
    //
    // The history-fetch itself can transiently fail — confirmed
    // live: diary-content.js issuing its OWN fetch() to this
    // endpoint at Save-click time reliably got a 404, while the
    // interceptor's PASSIVE capture (eavesdropping on a fetch
    // ChatGPT's own client code issues, moments earlier, on the
    // identical URL) succeeded. That's not random flakiness — our
    // own constructed request is very likely missing something
    // ChatGPT's own client attaches internally (an in-memory auth
    // token, a custom header, etc. — not something a plain fetch()
    // call replicates). Read from the interceptor's cache
    // (window.__diaryCapture.historySeed, already populated by a
    // request that's proven to succeed) instead of re-fetching
    // ourselves; only attempt our own fetch as a last resort if no
    // cache is available at all.
    var trueTurnCount = null;
    try {
      var cachedSeed = window.__diaryCapture && window.__diaryCapture.historySeed;
      if (cachedSeed && typeof cachedSeed.turnCount === 'number') {
        trueTurnCount = cachedSeed.turnCount;
        console.log('[Diary] ChatGPT true turn count from CACHED history JSON (age', Math.round((Date.now() - cachedSeed.ts) / 1000), 's):', trueTurnCount);
      } else {
        console.error('[Diary] ChatGPT no cached history JSON available yet — attempting a direct fetch as last resort (may 404)');
        var convMatchForCount = window.location.pathname.match(/\/c\/([a-f0-9-]+)/i);
        if (convMatchForCount) {
          var countResp = await fetch('/backend-api/conversation/' + convMatchForCount[1]);
          if (countResp.ok) {
            var countJson = await countResp.json();
            var mapping = countJson && countJson.mapping;
            if (mapping) {
              trueTurnCount = 0;
              for (var mid in mapping) {
                var mmsg = mapping[mid] && mapping[mid].message;
                if (mmsg && mmsg.content && mmsg.content.content_type === 'text') {
                  var mrole = mmsg.author && mmsg.author.role;
                  if (mrole === 'user' || mrole === 'assistant') trueTurnCount++;
                }
              }
              console.log('[Diary] ChatGPT true turn count from direct fetch (last resort, succeeded):', trueTurnCount);
            }
          } else {
            console.error('[Diary] ChatGPT last-resort direct fetch also failed, HTTP', countResp.status, '— proceeding with stability-only polling');
          }
        }
      }
    } catch(e) {
      console.error('[Diary] ChatGPT could not determine true turn count, falling back to stability-only polling:', e);
    }

    var scrollRoot = document.querySelector('[data-scroll-root]') || document.getElementById('thread');
    if (scrollRoot) {
      scrollRoot.scrollTop = 0;
      var lastTurnCount = -1;
      for (var settleAttempt = 0; settleAttempt < 12; settleAttempt++) {
        await new Promise(function(r){ setTimeout(r, 500); });
        var curCount = document.querySelectorAll('section[data-turn="user"], section[data-turn="assistant"]').length;
        // Success condition: reached the known-true count (best
        // case), OR — if we couldn't determine a true count —
        // fall back to the old "stopped changing" heuristic, which
        // is weaker but better than nothing.
        if (trueTurnCount !== null && curCount >= trueTurnCount) { lastTurnCount = curCount; break; }
        if (trueTurnCount === null && curCount === lastTurnCount) break;
        lastTurnCount = curCount;
        scrollRoot.scrollTop = 0; // re-assert in case virtualization shifted the scroll position back
      }
      console.log('[Diary] ChatGPT scroll-settle finished, DOM turn count:', lastTurnCount, 'true turn count:', trueTurnCount);
      if (trueTurnCount !== null && lastTurnCount < trueTurnCount) {
        console.error('[Diary] ChatGPT scroll-settle NEVER reached the true turn count (', lastTurnCount, 'of', trueTurnCount, ') — the DOM is known-incomplete, skipping clipboard method entirely and falling through to the JSON-based fallback instead');
      }
    }

    // If we know the true count and the DOM never reached it, don't
    // even attempt the clipboard method — proceeding would build
    // expectedCount from the DOM's own (wrong, too-low) count,
    // which would make the all-or-nothing check "succeed" against
    // an incorrect target and silently save an incomplete result
    // again, exactly the failure this whole check exists to catch.
    var domKnownIncomplete = (trueTurnCount !== null && lastTurnCount < trueTurnCount);

    // Combined query, document order — each element carries its own
    // role via data-turn, so pairing no longer depends on two
    // separate NodeLists having matching lengths.
    var allTurnEls = domKnownIncomplete ? [] : document.querySelectorAll('section[data-turn="user"], section[data-turn="assistant"]');
    var clipParts = [];
    var expectedCount = allTurnEls.length;
    var clipSuccessCount = 0;
    var firstUserClip = ''; // used for the title, replacing the old DOM-based getPrompt() path
    var sawFirstUser = false;
    var lastGenuineClipText = originalClipboard; // updated after each GENUINE success

    for (var ti = 0; ti < allTurnEls.length; ti++) {
      var turnEl = allTurnEls[ti];
      var role = turnEl.getAttribute('data-turn');
      var copyBtn = turnEl.querySelector('button[data-testid="copy-turn-action-button"]');
      if (!copyBtn) {
        console.error('[Diary] ChatGPT copy button not found on', role, 'turn at position', ti, '— treating whole attempt as failed');
        continue;
      }
      copyBtn.click();
      await new Promise(function(r){ setTimeout(r, 400); }); // let the clipboard write complete
      try {
        var clipText = await Promise.race([
          navigator.clipboard.readText(),
          new Promise(function(_, rej) { setTimeout(function() { rej(new Error('clipboard_timeout')); }, 3000); })
        ]);
        // Confirmed live as a real, serious bug — not cosmetic:
        // this previously only checked "is clipText non-empty,"
        // with no check at all that the clipboard actually,
        // genuinely changed as a result of clicking Copy above.
        // When the write silently fails (as it always will here —
        // this window never has document focus at all), the read
        // simply returns whatever was ALREADY on the user's own,
        // completely unrelated clipboard beforehand — and since
        // that's typically non-empty, the old check wrongly
        // treated it as a successful, genuine capture. Reproduced
        // live: unrelated terminal/git output the user had
        // copied for an entirely different purpose ended up
        // saved into a Diary entry as if it were the AI's own
        // response. Compares against lastGenuineClipText — the
        // most recent value we KNOW genuinely changed — not just
        // the original, pre-loop value: if turn 1's copy
        // genuinely succeeds but turn 2's silently fails, turn 2
        // would read back turn 1's own text, which differs from
        // the ORIGINAL clipboard but is still stale, not turn 2's
        // own content — comparing only against the original would
        // miss this and incorrectly duplicate turn 1's text as
        // turn 2's.
        if (clipText === lastGenuineClipText) {
          console.error('[Diary] ChatGPT clipboard unchanged after Copy click on', role, 'turn at position', ti, '— write silently failed (no document focus); refusing to trust stale clipboard content');
        } else if (clipText && clipText.trim().length > 0) {
          var ct = clipText.trim();
          if (role === 'user') {
            clipParts.push(boldQuestion(ct.slice(0, 2000)));
            if (!sawFirstUser) { firstUserClip = ct; sawFirstUser = true; }
          } else {
            clipParts.push(ct);
          }
          clipSuccessCount++;
          lastGenuineClipText = clipText;
        } else {
          console.error('[Diary] ChatGPT clipboard empty on', role, 'turn at position', ti);
        }
      } catch(e) {
        console.error('[Diary] ChatGPT clipboard read failed on', role, 'turn at position', ti, e);
      }
    }

    try { if (originalClipboard) await navigator.clipboard.writeText(originalClipboard); } catch(e) {}

    // ALL-OR-NOTHING across BOTH roles: only trust this method if
    // every single turn (user AND assistant) succeeded. A partial
    // success must NOT be silently accepted — that would produce
    // exactly the kind of quietly-incomplete save this whole
    // rebuild was meant to fix, just via a different mechanism.
    // Falls through to the history-fetch fallback (at the call site)
    // instead.
    if (expectedCount > 0 && clipSuccessCount === expectedCount) {
      result.success = true;
      result.fullThread = clipParts.join('\n\n');
      result.turnCount = expectedCount;
      if (firstUserClip) result.prompt = firstUserClip.slice(0, 500);
      console.log('[Diary] ChatGPT clipboard-copy method, ALL', expectedCount, 'turns (both roles) succeeded, length:', result.fullThread.length);
    } else {
      console.error('[Diary] ChatGPT clipboard-copy method: only', clipSuccessCount, 'of', expectedCount, 'turns succeeded — rejecting partial result, falling back');
    }
  } catch(e) {
    console.error('[Diary] ChatGPT clipboard-copy method FAILED entirely:', e);
  }
  return result;
}

// ── Capture-stability check (Layer 1) ───────────────────────────────
// Extracted from diary-content.js's own inline wrapper around the
// function above — same reasoning as the whole-file split: this was
// already the largest single chunk of ChatGPT-specific logic living
// directly inside performSaveToDiary() itself. Packaged here as its
// own function returning the same { success, fullThread, turnCount,
// prompt } shape attemptChatGPTClipboardCapture() itself returns, so
// diary-content.js's own call site only ever needs one call and one
// result to handle, exactly as if this were still a single, inline
// attempt.
//
// Preventative rather than corrective — per explicit direction after
// three same-day backend comparison bugs (a citation link, a
// Sources-footer relocation, a Sources-footer occurrence count) were
// each traced to the same root fact: ChatGPT's own captured text isn't
// guaranteed byte-identical across two separate reads of an unchanged
// conversation, and no amount of teaching the comparison logic to
// ignore the NEXT way it can cosmetically vary actually closes that gap
// for good. This runs the exact same clipboard-copy capture TWICE, with
// a short wait between, and only treats the result as final once two
// consecutive captures agree (after the same normalization already
// applied server-side: URL/bold-marker/Sources-footer stripped) —
// directly targeting ChatGPT's own documented backend propagation delay
// (a capture catching an answer before ChatGPT's backend has actually
// finished persisting it) at the SOURCE, rather than detecting its
// aftermath downstream in the merge logic, the same way the
// history-fetch fallback (still in diary-content.js) already does for
// itself.
async function runChatGPTCaptureWithStability() {
  var normalize = function(s) {
    return (s || '').replace(/\n\n---\n\n\*\*Sources:\*\*\n[\s\S]*$/, '').replace(/https?:\/\/\S+/g, '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
  };
  var captureAttempt = null;
  var stableAfterAttempts = null;
  for (var stabilityAttempt = 0; stabilityAttempt < 3; stabilityAttempt++) {
    var thisAttempt = await attemptChatGPTClipboardCapture();
    if (captureAttempt && thisAttempt.success && captureAttempt.success &&
        normalize(thisAttempt.fullThread) === normalize(captureAttempt.fullThread)) {
      stableAfterAttempts = stabilityAttempt + 1;
      captureAttempt = thisAttempt;
      break;
    }
    captureAttempt = thisAttempt;
    if (stabilityAttempt < 2) {
      console.log('[Diary] ChatGPT capture not yet stable (attempt', stabilityAttempt + 1, ') — waiting and re-capturing');
      await new Promise(function(r){ setTimeout(r, 2000); });
    }
  }
  if (stableAfterAttempts) {
    console.log('[Diary] ChatGPT capture confirmed STABLE after', stableAfterAttempts, 'consecutive matching attempt(s)');
  } else {
    console.error('[Diary] ChatGPT capture never stabilized across 3 attempts — proceeding with the last attempt rather than blocking indefinitely; this is a real signal worth watching for how often it actually happens');
  }
  return captureAttempt || { success: false, fullThread: null, turnCount: null, prompt: null };
}
