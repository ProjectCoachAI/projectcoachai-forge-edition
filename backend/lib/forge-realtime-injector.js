// forge-realtime-injector.js
const { classifyQuery } = require('./forge-realtime-classifier');
const fetchers = require('./forge-realtime-fetchers');
const NodeCache = require('node-cache'); // npm install node-cache

// In-memory cache — survives server restarts poorly but is fast
// Upgrade to Redis when scaling
const realtimeCache = new NodeCache({ useClones: false });

/**
 * Main entry point. Call this BEFORE every AI provider call.
 * Returns enriched system prompt with live data injected.
 *
 * @param {string} question — user's question
 * @param {string} baseSystemPrompt — existing system prompt
 * @returns {string} — enriched system prompt
 */
async function injectRealtimeContext(question, baseSystemPrompt) {
  try {
  const signals = classifyQuery(question);
  if (!signals.length) {
    return baseSystemPrompt; // no real-time data needed
  }

  const liveDataBlocks = [];

  // Fetch all detected data types in parallel
  await Promise.allSettled(
    signals.map(async (signal) => {
      // Check cache first
      const cacheKey = `rt:${signal.type}:${question.slice(0, 50)}`;
      const cached = realtimeCache.get(cacheKey);
      if (cached) {
        liveDataBlocks.push(cached);
        return;
      }

      // Fetch live
      const fetcherFn = fetchers[signal.fetcher];
      if (!fetcherFn) return;

      const data = await fetcherFn(question);
      if (!data) return;

      // Cache it
      realtimeCache.set(cacheKey, data, signal.ttl);
      liveDataBlocks.push(data);
    })
  );

  if (!liveDataBlocks.length) return baseSystemPrompt;

  // Prepend live data to system prompt
  const realtimeBlock = [
    '═══════════════════════════════════════════════',
    'LIVE DATA — PROVIDED BY FORGE PLATFORM',
    'The following data was fetched from live sources',
    'by the Forge platform before this request was sent.',
    'Treat this exactly as if the user pasted it into',
    'the conversation — it is real, current, verified data.',
    'Answer the question using this data directly.',
    'State the figures and cite "live data via Forge".',
    'Current timestamp: ' + new Date().toISOString(),
    '═══════════════════════════════════════════════',
    ...liveDataBlocks,
    '═══════════════════════════════════════════════',
    '',
  ].join('\n');

  console.log(`[Realtime] Injected signals: ${signals.map(s => s.type).join(', ')}`);
  // Store live data for question injection (exported via closure)
  injectRealtimeContext._lastLiveData = liveDataBlocks.join('\n');
  return realtimeBlock + baseSystemPrompt;
  } catch(e) {
    console.warn('[Realtime] injection error — falling back to base prompt:', e.message);
    return baseSystemPrompt;
  }
}

module.exports = { injectRealtimeContext };
