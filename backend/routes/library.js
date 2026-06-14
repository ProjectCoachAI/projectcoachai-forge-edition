'use strict';
/**
 * routes/library.js — Forge Library: persistent file storage per user.
 * Files stored as base64 in PostgreSQL. Max 10MB per file.
 */
const express = require('express');
const router  = express.Router();
const db      = require('../lib/db');
const { requireAuth } = require('../middleware/auth');

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function genFileId() {
  return 'lib_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// POST /api/library/upload — upload a file to the library
router.post('/upload', requireAuth, async (req, res) => {
  try {
    const { filename, fileType, fileData } = req.body;
    if (!filename || !fileType || !fileData) {
      return res.status(400).json({ success: false, error: 'filename, fileType and fileData are required.' });
    }
    // Estimate size from base64
    const fileSize = Math.round((fileData.length * 3) / 4);
    if (fileSize > MAX_FILE_SIZE) {
      return res.status(400).json({ success: false, error: 'File too large. Maximum size is 10MB.' });
    }
    const fileId = genFileId();
    await db.libraryUpload(req.userEmail, fileId, filename, fileType, fileSize, fileData);
    console.log(`[Library] ${req.userEmail} uploaded ${filename} (${formatBytes(fileSize)})`);
    res.json({ success: true, file: { file_id: fileId, filename, file_type: fileType, file_size: fileSize, created_at: new Date().toISOString() } });
  } catch (err) {
    console.error('[Library] upload error:', err.message);
    res.status(500).json({ success: false, error: 'Upload failed.' });
  }
});

// GET /api/library — list all files for user (no file data)
router.get('/', requireAuth, async (req, res) => {
  try {
    const files = await db.libraryList(req.userEmail);
    res.json({ success: true, files });
  } catch (err) {
    console.error('[Library] list error:', err.message);
    res.status(500).json({ success: false, error: 'Could not load library.' });
  }
});

// GET /api/library/:fileId — get a specific file with data
router.get('/:fileId', requireAuth, async (req, res) => {
  try {
    const file = await db.libraryGet(req.params.fileId, req.userEmail);
    if (!file) return res.status(404).json({ success: false, error: 'File not found.' });
    res.json({ success: true, file });
  } catch (err) {
    console.error('[Library] get error:', err.message);
    res.status(500).json({ success: false, error: 'Could not load file.' });
  }
});

// DELETE /api/library/:fileId — delete a file
router.delete('/:fileId', requireAuth, async (req, res) => {
  try {
    await db.libraryDelete(req.params.fileId, req.userEmail);
    res.json({ success: true });
  } catch (err) {
    console.error('[Library] delete error:', err.message);
    res.status(500).json({ success: false, error: 'Could not delete file.' });
  }
});

module.exports = router;
