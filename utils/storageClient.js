// utils/storageClient.js
//
// Persistent JSON storage client with retries, timeouts, and safe helpers.
// ✅ Keeps your original exports: loadJSON(), saveJSON()
// ✅ Adds aliases used elsewhere: load_file(), save_file()
// ✅ Adds: deleteJSON(), updateJSONAtomic(), healthCheck()
// Logs are prefixed with [STORAGE].

import fetch from 'node-fetch';

const BASE = String(process.env.PERSISTENT_DATA_URL || '').replace(/\/+$/, '');
if (!BASE) {
  throw new Error('❌ [STORAGE] PERSISTENT_DATA_URL not set');
}

const RETRIES    = Number(process.env.STORAGE_RETRIES || 2);
const TIMEOUT_MS = Number(process.env.STORAGE_TIMEOUT_MS || 12_000);
const RETRY_BASE = Number(process.env.STORAGE_RETRY_BASE_MS || 400);

function log(msg, ...a) { console.log('[STORAGE]', msg, ...a); }
function err(msg, ...a) { console.error('[STORAGE]', msg, ...a); }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function withTimeout(promise, ms = TIMEOUT_MS) {
  let to;
  const timer = new Promise((_, reject) => {
    to = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
  });
  try { return await Promise.race([promise, timer]); }
  finally { clearTimeout(to); }
}

function urlFor(filename) {
  const clean = String(filename || '').replace(/^\/+/, '');
  return `${BASE}/${clean}`;
}

async function parseJsonSafe(res) {
  const text = await res.text();
  if (!text) return {};
  try { return JSON.parse(text); }
  catch (e) {
    throw new Error(`Invalid JSON payload (${res.status} ${res.statusText}): ${e.message}`);
  }
}

/**
 * GET a JSON file from persistent storage.
 * @param {string} filename
 * @returns {Promise<any>}
 */
export async function loadJSON(filename) {
  const url = urlFor(filename);
  let lastErr;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const res = await withTimeout(fetch(url, { method: 'GET', headers: { 'Cache-Control': 'no-store' } }));
      if (!res.ok) throw new Error(`GET ${res.status} ${url}`);
      const data = await parseJsonSafe(res);
      log(`Loaded ${filename} successfully.`);
      return data;
    } catch (e) {
      lastErr = e;
      err(`Load failed (${attempt + 1}/${RETRIES + 1}) for ${filename}: ${e.message}`);
      if (attempt < RETRIES) await sleep(RETRY_BASE * (attempt + 1));
    }
  }
  throw lastErr;
}

/**
 * PUT a JSON file to persistent storage.
 * @param {string} filename
 * @param {any} data
 */
export async function saveJSON(filename, data) {
  const url = urlFor(filename);
  let lastErr;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const res = await withTimeout(fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data, null, 2),
      }));
      if (!res.ok) throw new Error(`PUT ${res.status} ${url}`);
      log(`Saved ${filename} successfully.`);
      return true;
    } catch (e) {
      lastErr = e;
      err(`Save failed (${attempt + 1}/${RETRIES + 1}) for ${filename}: ${e.message}`);
      if (attempt < RETRIES) await sleep(RETRY_BASE * (attempt + 1) + 50);
    }
  }
  throw lastErr;
}

/**
 * DELETE a JSON file from persistent storage (if your backend supports it).
 * @param {string} filename
 */
export async function deleteJSON(filename) {
  const url = urlFor(filename);
  try {
    const res = await withTimeout(fetch(url, { method: 'DELETE' }));
    if (!res.ok) throw new Error(`DELETE ${res.status} ${url}`);
    log(`Deleted ${filename} successfully.`);
    return true;
  } catch (e) {
    err(`Delete failed for ${filename}: ${e.message}`);
    throw e;
  }
}

/**
 * Atomic read-modify-write with retry on conflict (optimistic; requires ETag support on server).
 * Falls back to plain RMW if ETags not provided by backend.
 *
 * @param {string} filename
 * @param {(current:any)=>any} mutator - must return the new object to save
 */
export async function updateJSONAtomic(filename, mutator) {
  const url = urlFor(filename);

  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    // 1) GET current + ETag (if available)
    const getRes = await withTimeout(fetch(url, { method: 'GET', headers: { 'Cache-Control': 'no-store' } }));
    if (!getRes.ok) throw new Error(`GET ${getRes.status} ${url}`);
    const etag = getRes.headers.get('etag'); // may be null
    const current = await parseJsonSafe(getRes);

    // 2) Mutate
    let next;
    try { next = await mutator(current); }
    catch (e) {
      err(`Mutator threw for ${filename}: ${e.message}`);
      throw e;
    }

    // 3) PUT with If-Match when ETag present; else plain PUT
    const headers = { 'Content-Type': 'application/json' };
    if (etag) headers['If-Match'] = etag;

    const putRes = await withTimeout(fetch(url, { method: 'PUT', headers, body: JSON.stringify(next, null, 2) }));
    if (putRes.ok) {
      log(`Atomic update succeeded for ${filename}.`);
      return true;
    }

    // Conflict? try again
    if (putRes.status === 412 || putRes.status === 409) {
      err(`Conflict updating ${filename} (attempt ${attempt + 1}). Retrying…`);
      if (attempt < RETRIES) { await sleep(RETRY_BASE * (attempt + 1)); continue; }
    }

    const body = await putRes.text().catch(() => '');
    throw new Error(`PUT ${putRes.status} ${url}: ${body || putRes.statusText}`);
  }

  throw new Error(`Atomic update exceeded retry budget for ${filename}`);
}

/**
 * HEAD/health check against the storage base (or a file).
 * @param {string} [filename]
 */
export async function healthCheck(filename = '') {
  const url = filename ? urlFor(filename) : BASE;
  try {
    const res = await withTimeout(fetch(url, { method: 'HEAD' }));
    const ok = res.ok;
    log(`Health check ${ok ? 'OK' : 'FAIL'} for ${filename || 'BASE'} (${res.status})`);
    return ok;
  } catch (e) {
    err(`Health check error for ${filename || 'BASE'}: ${e.message}`);
    return false;
  }
}

/* -----------------------------------------------------------------------------
 * Aliases used by other modules (keep both APIs working)
 * ---------------------------------------------------------------------------*/

export async function load_file(filename)  { return loadJSON(filename); }
export async function save_file(filename, data) { return saveJSON(filename, data); }

/* -----------------------------------------------------------------------------
 * Canonical file paths used across the bot
 * (moved to the correct directories as requested)
 * ---------------------------------------------------------------------------*/

export const PATHS = {
  // Core player data
  linkedDecks:        'data/linked_decks.json',
  wallet:             'data/coin_bank.json',
  playerData:         'data/player_data.json',

  // Limits / queues / trades
  sellsByDay:         'data/sells_by_day.json',
  tradeLimits:        'data/trade_limits.json',
  tradeQueue:         'data/trade_queue.json',
  trades:             'data/trades.json',

  // Duel logs & summaries (private)
  duelLogCurrent:     'data/logs/current_duel_log.json',
  duelSummaryFor:     (duelId) => `data/summaries/${duelId}.json`,
  duelStats:          'data/duelStats.json',

  // Public (served to browsers)
  public: {
    duelSummaries:    'public/data/duel_summaries.json',
    revealFor:        (tokenOrUserId) => `public/data/reveal_${tokenOrUserId}.json`,
  },
};
