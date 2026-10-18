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
// identifier (in the account's random folder, timestamped, randomized). A future
// backend that can't use a human-meaningful key as its own ID (e.g. an
// auto-incrementing bytea row) would generate its own opaque ID scheme
// internally; every caller of this module already treats "id" as an
// opaque string, never parses or constructs one itself, so that swap
// wouldn't require any caller changes.

const crypto = require('crypto');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, HeadObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const db = require('./db');

// R2_JURISDICTION=eu points the client at the EU-jurisdiction endpoint
// (https://<account>.eu.r2.cloudflarestorage.com). A bucket created with a
// jurisdiction is only reachable through that endpoint.
const r2Client = new S3Client({
  region: 'auto',
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}${process.env.R2_JURISDICTION ? '.' + process.env.R2_JURISDICTION : ''}.r2.cloudflarestorage.com`,
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

// Each account's files live under u/<random folder>/ . The folder name is
// random and meaningless: it is not derived from the email address, so a
// file link never reveals who owns it, and two accounts can never share a
// folder. It is created the first time an account stores a file and kept
// in users.storage_folder, so deleting an account can remove the whole
// folder by name.
const FOLDER_RE = /^[a-f0-9]{24}$/;
const _folderCache = new Map();
async function getStorageFolder(userEmail) {
  if (_folderCache.has(userEmail)) return _folderCache.get(userEmail);
  let r = await db.query('SELECT storage_folder FROM users WHERE email=$1', [userEmail]);
  if (!r.rows.length) throw new Error('No account found to store the file under');
  let folder = r.rows[0].storage_folder;
  if (!folder) {
    // Only sets it if still empty, so two uploads racing at the same moment agree on one folder.
    await db.query('UPDATE users SET storage_folder=$1 WHERE email=$2 AND storage_folder IS NULL', [crypto.randomBytes(12).toString('hex'), userEmail]);
    r = await db.query('SELECT storage_folder FROM users WHERE email=$1', [userEmail]);
    folder = r.rows[0] && r.rows[0].storage_folder;
  }
  if (!folder || !FOLDER_RE.test(folder)) throw new Error('Storage folder is missing or malformed');
  _folderCache.set(userEmail, folder);
  return folder;
}

/**
 * Store a buffer under a new, unique attachment ID.
 * @param {Object} opts
 * @param {Buffer} opts.buffer - the raw file bytes
 * @param {string} opts.contentType - MIME type, e.g. 'application/pdf'
 * @param {string} opts.userEmail - the owner; their random storage folder is looked up (or created)
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
  const folder = await getStorageFolder(userEmail);
  const id = `u/${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}_${namePart}.${ext}`;

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

/**
 * Remove every file in one account's storage folder (used when an account
 * is deleted). Takes the folder NAME (read from users.storage_folder before
 * the account row is deleted), not an email address. Returns how many files
 * were removed.
 * @param {string} folder
 * @returns {Promise<number>}
 */
async function removeFolder(folder) {
  if (!FOLDER_RE.test(folder || '')) throw new Error('Refusing to remove: not a valid storage folder name');
  const prefix = `u/${folder}/`;
  let removed = 0, token;
  do {
    const page = await r2Client.send(new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET_NAME, Prefix: prefix, ContinuationToken: token }));
    const keys = (page.Contents || []).map(o => ({ Key: o.Key })).filter(o => o.Key.indexOf(prefix) === 0);
    if (keys.length) {
      await r2Client.send(new DeleteObjectsCommand({ Bucket: process.env.R2_BUCKET_NAME, Delete: { Objects: keys, Quiet: true } }));
      removed += keys.length;
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return removed;
}

module.exports = { store, get, exists, remove, removeFolder, MAX_ATTACHMENT_BYTES };
