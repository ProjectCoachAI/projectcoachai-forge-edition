#!/usr/bin/env node
// diagnose-diverged-entries.js
//
// One-off diagnostic for entries 1592 and 1593, flagged by
// backfill-native-seed-count.js as "needs manual review" — their
// recomputed native message count (from entry.content) exceeds the
// total message count in chat_sessions.messages, meaning content has
// native material chat_sessions genuinely doesn't know about yet.
//
// This does NOT write anything — read-only, for understanding root
// cause before deciding how (or whether) to fix these two specifically.
//
// USAGE: node scripts/diagnose-diverged-entries.js [entryId ...]
//   (defaults to 1592 and 1593 if no IDs are passed)

const db = require('../lib/db');
const diaryRoutes = require('../routes/diary');
const splitEntryIntoMessages = diaryRoutes.splitEntryIntoMessages;

const entryIds = process.argv.slice(2).length ? process.argv.slice(2).map(Number) : [1592, 1593];

function preview(msg, maxLen) {
  maxLen = maxLen || 80;
  var text = (msg.content || '').replace(/\s+/g, ' ').trim();
  return '[' + msg.role + '] ' + (text.length > maxLen ? text.slice(0, maxLen) + '…' : text);
}

async function diagnoseOne(entryId) {
  console.log('');
  console.log('========================================');
  console.log('Entry', entryId);
  console.log('========================================');

  const r = await db.query(
    'SELECT id, user_email, prompt, content, metadata, created_at, updated_at FROM diary_entries WHERE id=$1',
    [entryId]
  );
  if (!r.rows.length) {
    console.log('  NOT FOUND.');
    return;
  }
  const entry = r.rows[0];
  const meta = entry.metadata || {};

  console.log('  chatSessionId:', meta.chatSessionId);
  console.log('  nativeSeedMessageCount (stored):', meta.nativeSeedMessageCount);
  console.log('  forkedToForgeAt:', meta.forkedToForgeAt);
  console.log('  lastSyncedAt:', meta.lastSyncedAt);
  console.log('  entry created_at:', entry.created_at);
  console.log('  entry updated_at:', entry.updated_at);

  const recomputedNative = splitEntryIntoMessages({ prompt: entry.prompt, content: entry.content });
  console.log('  Recomputed native message count (from content):', recomputedNative.length);

  const session = await db.getChatSession(meta.chatSessionId, entry.user_email);
  if (!session) {
    console.log('  chat_sessions row: NOT FOUND.');
    return;
  }
  console.log('  chat_sessions.messages total count:', session.messages.length);
  console.log('  chat_sessions updated_at:', session.updated_at);

  console.log('');
  console.log('  --- Last 5 messages in chat_sessions.messages (what the session currently has) ---');
  session.messages.slice(-5).forEach(function(m, i) {
    console.log('   ', session.messages.length - 5 + i, preview(m));
  });

  console.log('');
  console.log('  --- Last 5 messages in recomputed native content (what entry.content currently has) ---');
  recomputedNative.slice(-5).forEach(function(m, i) {
    console.log('   ', recomputedNative.length - 5 + i, preview(m));
  });

  // Find the longest common prefix between the two, to see exactly where
  // they genuinely start to differ, rather than just knowing they do.
  var commonPrefixLen = 0;
  var shorterLen = Math.min(session.messages.length, recomputedNative.length);
  for (var i = 0; i < shorterLen; i++) {
    if (session.messages[i].role === recomputedNative[i].role && session.messages[i].content === recomputedNative[i].content) {
      commonPrefixLen++;
    } else {
      break;
    }
  }
  console.log('');
  console.log('  Longest common prefix between session and content:', commonPrefixLen, 'messages');
  if (commonPrefixLen < shorterLen) {
    console.log('  First point of divergence — message index', commonPrefixLen + ':');
    console.log('    session has:', session.messages[commonPrefixLen] ? preview(session.messages[commonPrefixLen], 150) : '(none — session is shorter)');
    console.log('    content has:', recomputedNative[commonPrefixLen] ? preview(recomputedNative[commonPrefixLen], 150) : '(none — content is shorter)');
  } else {
    console.log('  One is a strict, genuine prefix of the other — no true divergence found, just a length difference.');
  }
}

async function main() {
  await db.init();
  for (const id of entryIds) {
    await diagnoseOne(id);
  }
  process.exit(0);
}

main().catch(function(err) {
  console.error('[Diagnose] FATAL:', err);
  process.exit(1);
});
