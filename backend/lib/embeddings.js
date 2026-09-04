// ── Shared Voyage AI embeddings ─────────────────────────────────────────────
// Extracted from backend/routes/diary.js, where this was originally built
// for Diary entry semantic search. Now also used by chat.js's own
// conversation-bridging logic (see chat.js's own comment on that) — moved
// here rather than duplicated, since both call sites need the exact same
// embedding model, dimensionality, and degrade-gracefully behavior, and a
// second, separately-maintained copy would risk quietly drifting out of
// sync (e.g. a future model upgrade applied to one call site but not the
// other, breaking cosine-distance comparisons between them if a value
// ever crossed between the two systems).
//
// NOTE: Anthropic does not offer its own embedding model at all (confirmed
// directly from Anthropic's own documentation) — Voyage AI is Anthropic's
// own explicitly recommended partner for exactly this situation, and the
// natural fit given this whole product is built around the Claude
// ecosystem. Endpoint, request/response shape, and the input_type
// parameter (meaningfully affects retrieval quality, not cosmetic —
// Voyage's own docs explicitly warn not to omit it) all confirmed
// directly against Anthropic's own documentation before writing this.
// Uses the default 1024-dimension output — a reasonable, balanced choice
// for a personal-scale archive that doesn't need the largest available
// dimension for adequate accuracy. Gracefully degrades (returns null,
// never throws) if VOYAGE_API_KEY isn't set, times out, or the API call
// otherwise fails — semantic search is an enhancement on top of the
// existing, fully-functional keyword search, never a hard dependency
// that could break saving or searching if Voyage is unavailable.
// Tracks WHY the most recent call returned null, without changing
// voyageEmbed()'s own return shape at all — its existing callers (both
// here and in diary.js) already correctly treat a plain null as "not
// available, degrade gracefully," and changing that shape to carry
// richer detail would mean touching every one of those call sites too.
// A separate, read-after-the-fact getter lets chat.js's own bridging
// logic (which genuinely needs to distinguish "no API key" from "input
// was empty" from "the request itself failed" from "timed out") surface
// the real reason directly in a response body, without requiring
// diary.js's own simpler, semantic-search use of this function to
// change at all.
let _lastFailureReason = null;
function getLastEmbedFailureReason() { return _lastFailureReason; }

// Voyage's own hard limits — confirmed directly via two, separate, real
// live failures: (1) "The batch size limit is 1000. Your batch size is
// 3663" and, after fixing that, (2) "The max allowed tokens per
// submitted batch is 320000. Your batch has 330109 tokens" — these are
// TWO INDEPENDENT constraints, not one; a chunk of exactly 1000 items
// can still separately exceed the token ceiling if the items themselves
// are long enough, which is exactly what happened here. Both are
// respected simultaneously below, not just the item count.
const VOYAGE_MAX_BATCH_SIZE = 1000; // items
const VOYAGE_MAX_BATCH_TOKENS = 300000; // conservative, below Voyage's own 320,000 hard ceiling

// Rough estimate (chars/4), same heuristic used elsewhere in this
// codebase (chat.js's own oversized-conversation check) — not an exact
// token count, but Voyage's own limit has enough headroom below its
// true ceiling (300k vs the real 320k) that this doesn't need to be
// precise, only conservative.
function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

// Builds chunks greedily so EACH chunk independently stays under both
// limits — not just splitting by item count and hoping token count
// works out. If a single item's own estimated tokens alone would
// already exceed the ceiling (rare, but possible with the existing
// 8000-char per-item truncation below), it still gets its own,
// single-item chunk rather than looping forever trying to keep it out.
function buildTokenAwareChunks(inputs) {
  const chunks = [];
  let currentChunk = [];
  let currentTokens = 0;
  for (const text of inputs) {
    const truncated = (text || '').slice(0, 8000);
    const textTokens = estimateTokens(truncated);
    if (currentChunk.length > 0 && (currentChunk.length >= VOYAGE_MAX_BATCH_SIZE || currentTokens + textTokens > VOYAGE_MAX_BATCH_TOKENS)) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentTokens = 0;
    }
    currentChunk.push(text);
    currentTokens += textTokens;
  }
  if (currentChunk.length > 0) chunks.push(currentChunk);
  return chunks;
}

// The actual, single HTTP call to Voyage — unchanged from before this
// batching fix, just extracted so voyageEmbed() itself can call it once
// per chunk instead of assuming the whole input always fits in one
// request.
async function voyageEmbedBatch(apiKey, batchTexts, inputType) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const resp = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      input: batchTexts.map(t => (t || '').slice(0, 8000)), // Voyage has its own input length limits; keep well under
      model: 'voyage-4',
      input_type: inputType
    }),
    signal: controller.signal
  });
  clearTimeout(timeout);
  if (!resp.ok) {
    let bodyText = '';
    try { bodyText = (await resp.text()).slice(0, 300); } catch(_) {}
    _lastFailureReason = `api_error_${resp.status}: ${bodyText}`;
    console.warn('[Embeddings] Voyage embedding request failed:', resp.status, bodyText);
    return null;
  }
  const json = await resp.json();
  return (json.data || []).sort((a, b) => a.index - b.index).map(d => d.embedding);
}

async function voyageEmbed(texts, inputType) {
  _lastFailureReason = null;
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    _lastFailureReason = 'no_api_key';
    console.warn('[Embeddings] VOYAGE_API_KEY is not set — embeddings unavailable.');
    return null;
  }
  const inputs = Array.isArray(texts) ? texts : [texts];
  if (!inputs.length || inputs.every(t => !t || !t.trim())) {
    _lastFailureReason = 'empty_input';
    console.warn('[Embeddings] voyageEmbed called with no usable (non-empty) text input.');
    return null;
  }
  try {
    // Chunked sequentially, not in parallel — Voyage may separately
    // rate-limit concurrent requests, and a real case here is only a
    // handful of chunks, so sequential stays fast enough without
    // risking that. If ANY chunk fails, the whole call fails — a
    // partial embeddings array would silently misalign with the
    // indices callers (chat.js's own bridging logic in particular)
    // depend on to match embeddings back to their original messages.
    const chunks = buildTokenAwareChunks(inputs);
    const allEmbeddings = [];
    for (const chunk of chunks) {
      const batchEmbeddings = await voyageEmbedBatch(apiKey, chunk, inputType);
      if (!batchEmbeddings) return null; // _lastFailureReason already set inside voyageEmbedBatch
      allEmbeddings.push(...batchEmbeddings);
    }
    return Array.isArray(texts) ? allEmbeddings : (allEmbeddings[0] || null);
  } catch(e) {
    _lastFailureReason = `exception: ${e.message}`;
    console.warn('[Embeddings] Voyage embedding error:', e.message);
    return null;
  }
}

// Formats a JS number array as a pgvector literal string, e.g. '[0.1,0.2,...]'
function toVectorLiteral(embedding) {
  if (!Array.isArray(embedding)) return null;
  return '[' + embedding.join(',') + ']';
}

module.exports = { voyageEmbed, toVectorLiteral, getLastEmbedFailureReason };
