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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        input: inputs.map(t => (t || '').slice(0, 8000)), // Voyage has its own input length limits; keep well under
        model: 'voyage-4',
        input_type: inputType // 'document' at save time, 'query' at search time
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
    const embeddings = (json.data || []).sort((a, b) => a.index - b.index).map(d => d.embedding);
    return Array.isArray(texts) ? embeddings : (embeddings[0] || null);
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
