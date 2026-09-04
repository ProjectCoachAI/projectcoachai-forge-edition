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

// Voyage's own hard limit — confirmed directly via a real, live failure:
// "Request to model 'voyage-4' failed. The batch size limit is 1000.
// Your batch size is 3663." A genuinely long bridged conversation (or,
// in principle, a large diary.js backfill run) can easily exceed this
// in one call; texts are chunked below rather than trusting any single
// caller to stay under the limit itself.
const VOYAGE_MAX_BATCH_SIZE = 1000;

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
    // rate-limit concurrent requests, and a real case here is only
    // ~4 chunks (3663 items / 1000), so sequential stays fast enough
    // without risking that. If ANY chunk fails, the whole call fails —
    // a partial embeddings array would silently misalign with the
    // indices callers (chat.js's own bridging logic in particular)
    // depend on to match embeddings back to their original messages.
    const allEmbeddings = [];
    for (let i = 0; i < inputs.length; i += VOYAGE_MAX_BATCH_SIZE) {
      const batch = inputs.slice(i, i + VOYAGE_MAX_BATCH_SIZE);
      const batchEmbeddings = await voyageEmbedBatch(apiKey, batch, inputType);
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
