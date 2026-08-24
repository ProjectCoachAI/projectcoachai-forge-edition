// ── attachmentStorage.js ──────────────────────────────────────────────────
// A small, backend-agnostic storage interface for Diary attachments
// (images, PDFs, and — in v1.1 — DOCX/XLSX conversion outputs): store,
// get, and remove, addressed by an opaque attachment ID.
//
// Backed by Cloudflare R2 for v1, per the corrected brief — R2 already
// has one real, working precedent in this codebase (the existing, if
// previously-unwired, /api/diary/upload-image endpoint), so this reuses
// that same client and bucket rather than introducing a second,
// parallel storage mechanism. The point of this interface, though, is
// that nothing outside this file needs to know it's R2 at all — a
// future move to a different backend (or the originally-proposed
// Postgres bytea approach, if usage data ever justifies revisiting
// that) is a swap inside this one module, not a rewrite across every
// call site that stores or reads an attachment.
//
// "id" here IS the R2 object key — there's no separate ID-to-key
// mapping table, since the key itself is already a unique, addressable
// identifier (namespaced by user, timestamped, randomized). A future
// backend that can't use a human-meaningful key as its own ID (e.g. an
// auto-incrementing bytea row) would generate its own opaque ID scheme
// internally; every caller of this module already treats "id" as an
// opaque string, never parses or constructs one itself, so that swap
// wouldn't require any caller changes.

const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25MB — generous for a PDF, still bounded

// Best-effort extension guess from a content type, used only for the
// stored key's own readability (e.g. in bucket browsing) — never relied
// on for actually serving the file correctly, since ContentType is
// always stored and returned by R2 independently of the key's name.
const EXT_BY_CONTENT_TYPE = {
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/x-python': 'py',
  'text/javascript': 'js',
  'application/json': 'json',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

function sanitizeForKey(str) {
  return (str || '').replace(/[^a-z0-9]/gi, '_');
}

/**
 * Store a buffer under a new, unique attachment ID.
 * @param {Object} opts
 * @param {Buffer} opts.buffer - the raw file bytes
 * @param {string} opts.contentType - MIME type, e.g. 'application/pdf'
 * @param {string} opts.userEmail - used only to namespace the storage key
 * @param {string} [opts.filenameHint] - optional, for a more readable key
 * @returns {Promise<{id: string, url: string, contentType: string, size: number}>}
 */
async function store({ buffer, contentType, userEmail, filenameHint }) {
  if (!buffer || !buffer.length) throw new Error('No file data provided');
  if (buffer.length > MAX_ATTACHMENT_BYTES) {
    throw new Error('Attachment exceeds maximum size of ' + (MAX_ATTACHMENT_BYTES / 1024 / 1024) + 'MB');
  }
  const ext = EXT_BY_CONTENT_TYPE[(contentType || '').split(';')[0]] || 'bin';
  const namePart = filenameHint ? sanitizeForKey(filenameHint).slice(0, 40) + '_' : '';
  const id = `diary/${sanitizeForKey(userEmail)}/${Date.now()}_${Math.random().toString(36).slice(2)}_${namePart}.${ext}`;

  await r2Client.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: id,
    Body: buffer,
    ContentType: contentType,
  }));

  return {
    id,
    url: `${process.env.R2_PUBLIC_URL}/${id}`,
    contentType,
    size: buffer.length,
  };
}

/**
 * Fetch the actual bytes for a previously-stored attachment.
 * Most call sites (images, PDFs rendered via a direct URL) never need
 * this at all — the public url returned by store() is directly usable
 * on its own. This exists for the cases that do need real bytes
 * server-side (e.g. proxying, or a future backend without a public
 * URL concept at all).
 * @param {string} id
 * @returns {Promise<{buffer: Buffer, contentType: string} | null>}
 */
async function get(id) {
  try {
    const result = await r2Client.send(new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: id,
    }));
    const chunks = [];
    for await (const chunk of result.Body) chunks.push(chunk);
    return {
      buffer: Buffer.concat(chunks),
      contentType: result.ContentType || 'application/octet-stream',
    };
  } catch (e) {
    if (e.name === 'NoSuchKey') return null;
    throw e;
  }
}

/**
 * Check whether an attachment exists without fetching its full bytes —
 * used by the fallback-state check (Priority 4's "honest fallback")
 * without the cost of a full download just to confirm presence.
 * @param {string} id
 * @returns {Promise<boolean>}
 */
async function exists(id) {
  try {
    await r2Client.send(new HeadObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: id,
    }));
    return true;
  } catch (e) {
    if (e.name === 'NotFound' || e.name === 'NoSuchKey') return false;
    throw e;
  }
}

/**
 * Remove a stored attachment permanently.
 * @param {string} id
 */
async function remove(id) {
  await r2Client.send(new DeleteObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: id,
  }));
}

module.exports = { store, get, exists, remove, MAX_ATTACHMENT_BYTES };
