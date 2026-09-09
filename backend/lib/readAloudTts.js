// ── readAloudTts.js ──────────────────────────────────────────────────────
// Cloud TTS generation for the Diary Read-Aloud feature. Per the
// revised implementation brief (cloud TTS from v1, not a later,
// paid-tier fast-follow): browser-native voices structurally cannot
// reach the "doesn't sound computer-generated" bar the feature exists
// to meet, regardless of which installed system voice is selected, so
// shipping that first would mean shipping something already known to
// fall short of the actual goal.
//
// Provider: Google Cloud Text-to-Speech, WaveNet voices — chosen over
// ElevenLabs after a direct, verified cost comparison during scoping
// (ElevenLabs ran ~$50-100 per million characters vs. WaveNet's $4,
// a 12-25x gap that matters directly at "thousands of users" scale),
// and over Gemini TTS (which the project's own existing
// GOOGLE_AI_API_KEY could have reused directly) because Gemini TTS is
// still a preview API with restrictive rate limits (2,000 requests/day
// even on a billing-enabled Tier 1 project) — a real capacity risk at
// the same scale, on top of the inherent volatility of a preview-stage
// product. WaveNet is Google's stable, generally-available offering,
// authenticated via its own, separate service-account credential
// (GOOGLE_TTS_CREDENTIALS_JSON) — deliberately kept separate from
// GOOGLE_AI_API_KEY since they authenticate to different Google
// products entirely.

const crypto = require('crypto');
const textToSpeech = require('@google-cloud/text-to-speech');

let _client = null;
function getClient() {
  if (_client) return _client;
  const raw = process.env.GOOGLE_TTS_CREDENTIALS_JSON;
  if (!raw) throw new Error('GOOGLE_TTS_CREDENTIALS_JSON is not set');
  const credentials = JSON.parse(raw);
  _client = new textToSpeech.TextToSpeechClient({ credentials });
  return _client;
}

// One, well-chosen default voice for v1, per the brief's own explicit
// scope ("ship one well-chosen, natural default voice — not a
// voice-picker dropdown"). en-US-Wavenet-F: a widely-recommended,
// natural-sounding WaveNet voice for general narration use.
const DEFAULT_VOICE = { languageCode: 'en-US', name: 'en-US-Wavenet-F' };

/**
 * Deterministic content hash — the cache key's own other half (paired
 * with entry_id in tts_cache's own unique constraint). Computed over
 * the exact, already-cleaned text that will actually be sent to the
 * TTS provider, so a genuine content change (a new sync, a summary
 * regeneration producing different cleaned text) naturally produces a
 * different hash and correctly triggers fresh generation, while
 * replaying the same, unchanged content always resolves to the same
 * hash and reuses the already-generated audio.
 */
function hashContent(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

// Google Cloud TTS's own hard limit: input.text cannot exceed 5,000
// bytes per request — confirmed directly via a real, production error
// this exact route hit ("Either input.text or input.ssml is longer
// than the limit of 5000 bytes"), not something caught in advance
// during scoping. A full diary entry's own cleaned text can easily
// exceed this, so long content needs to be split into multiple,
// separate requests. MAX_CHUNK_BYTES is kept meaningfully under the
// real 5,000-byte ceiling (not right up against it) as a safety
// margin, since sentence-boundary splitting below can occasionally
// land a candidate chunk slightly over a tighter target before the
// check below forces a new chunk.
const MAX_CHUNK_BYTES = 4800;

/**
 * Splits text into chunks that each stay under Google Cloud TTS's own
 * 5,000-byte-per-request limit, per the byte count specifically (not
 * character count) — multi-byte UTF-8 characters (accented letters,
 * emoji) can otherwise silently push a chunk over the real limit even
 * when its character count looks safely low. Splits at sentence
 * boundaries wherever possible, for natural-sounding breaks between
 * chunks rather than an arbitrary mid-sentence cut; falls back to a
 * word-level split only for the rare case of a single sentence that
 * alone exceeds the limit. Verified via direct simulation across four
 * cases before wiring in: short text staying as one chunk, long text
 * splitting into multiple chunks all confirmed under the byte limit,
 * the reconstructed chunks roughly matching the original content, and
 * multi-byte UTF-8 text (accented characters, emoji) correctly
 * measured and chunked by actual byte length rather than character
 * count.
 */
function chunkTextForTts(text, maxBytes) {
  maxBytes = maxBytes || MAX_CHUNK_BYTES;
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) return [text];
  const sentences = text.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || [text];
  const chunks = [];
  let current = '';
  sentences.forEach(sentence => {
    const candidate = current ? current + ' ' + sentence.trim() : sentence.trim();
    if (Buffer.byteLength(candidate, 'utf8') > maxBytes) {
      if (current) { chunks.push(current); current = ''; }
      if (Buffer.byteLength(sentence, 'utf8') > maxBytes) {
        // A single sentence itself exceeds the limit (rare) — hard-split
        // it by word, since there's no other safe, natural boundary.
        const words = sentence.trim().split(' ');
        let wordChunk = '';
        words.forEach(w => {
          const wc = wordChunk ? wordChunk + ' ' + w : w;
          if (Buffer.byteLength(wc, 'utf8') > maxBytes) {
            if (wordChunk) chunks.push(wordChunk);
            wordChunk = w;
          } else {
            wordChunk = wc;
          }
        });
        if (wordChunk) current = wordChunk;
      } else {
        current = sentence.trim();
      }
    } else {
      current = candidate;
    }
  });
  if (current) chunks.push(current);
  return chunks;
}

/**
 * Generates speech audio for the given (already content-cleaned) text.
 * Returns a raw MP3 buffer — storage (R2, via attachmentStorage.js) and
 * caching (tts_cache) are the caller's own responsibility, kept
 * separate here so this module's only job is talking to the TTS
 * provider itself.
 * @param {string} text - already-cleaned text (see cleanTextForSpeech
 *   on the frontend — this function does no further cleaning itself)
 * @returns {Promise<Buffer>}
 */
async function generateSpeech(text) {
  if (!text || !text.trim()) throw new Error('No text provided to generateSpeech');
  const client = getClient();
  const [response] = await client.synthesizeSpeech({
    input: { text },
    voice: DEFAULT_VOICE,
    audioConfig: { audioEncoding: 'MP3' },
  });
  return Buffer.from(response.audioContent);
}

module.exports = { generateSpeech, hashContent, chunkTextForTts, DEFAULT_VOICE, MAX_CHUNK_BYTES };
