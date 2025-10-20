// utils/storageClient.js
//
// Persistent JSON storage client with retries, timeouts, and safe helpers.
// ✅ Exports: loadJSON(), saveJSON(), deleteJSON(), updateJSONAtomic(), healthCheck()
// ✅ Aliases kept: load_file(), save_file()
// ✅ Adds: loadOrInitJSON() to silently create files with defaults on first load
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
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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

/* ─────────────────────────────────────── core ops ─────────────────────────────────────── */

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

export async function updateJSONAtomic(filename, mutator) {
  const url = urlFor(filename);
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    const getRes = await withTimeout(fetch(url, { method: 'GET', headers: { 'Cache-Control': 'no-store' } }));
    if (!getRes.ok) throw new Error(`GET ${getRes.status} ${url}`);
    const etag = getRes.headers.get('etag');
    const current = await parseJsonSafe(getRes);

    let next;
    try { next = await mutator(current); }
    catch (e) { err(`Mutator threw for ${filename}: ${e.message}`); throw e; }

    const headers = { 'Content-Type': 'application/json' };
    if (etag) headers['If-Match'] = etag;

    const putRes = await withTimeout(fetch(url, { method: 'PUT', headers, body: JSON.stringify(next, null, 2) }));
    if (putRes.ok) { log(`Atomic update succeeded for ${filename}.`); return true; }

    if (putRes.status === 412 || putRes.status === 409) {
      err(`Conflict updating ${filename} (attempt ${attempt + 1}). Retrying…`);
      if (attempt < RETRIES) { await sleep(RETRY_BASE * (attempt + 1)); continue; }
    }
    const body = await putRes.text().catch(() => '');
    throw new Error(`PUT ${putRes.status} ${url}: ${body || putRes.statusText}`);
  }
  throw new Error(`Atomic update exceeded retry budget for ${filename}`);
}

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

/* ───────────────────────────── convenience helpers ───────────────────────────── */

/**
 * Load a file, and if it 404s, create it with the provided default value.
 * Useful to avoid first-boot 404 noise.
 */
export async function loadOrInitJSON(filename, defaultValue = {}) {
  try {
    return await loadJSON(filename);
  } catch (e) {
    if (String(e.message || '').includes('GET 404')) {
      log(`Initializing ${filename} with defaults.`);
      await saveJSON(filename, defaultValue);
      return defaultValue;
    }
    throw e;
  }
}

/* ───────────────────────────── aliases for legacy code ───────────────────────────── */

export async function load_file(filename) { return loadJSON(filename); }
export async function save_file(filename, data) { return saveJSON(filename, data); }

/* ───────────────────────────── canonical path map ─────────────────────────────
   Files requiring prefix "data/":
   - coin_bank.json
   - linked_decks.json
   - player_data.json
   - sells_by_day.json
   - trade_limits.json
   - trade_queue.json
   - trades.json
   - logs/current_duel_log.json
   - summaries/<duelID>.json
   Also used by bot: duelStats.json (keep under data/)
   Files requiring prefix "public/data/":
   - duel_summaries.json
   - reveal_<token or user id>.json
-------------------------------------------------------------------------------*/

export const PATHS = {
  // core player data
  linkedDecks:   'data/linked_decks.json',
  wallet:        'data/coin_bank.json',         // was wallet.json in some modules
  playerData:    'data/player_data.json',

  // duels & stats
  duelStats:     'data/duelStats.json',         // created on first boot if missing
  currentDuelLog:'data/logs/current_duel_log.json',

  // trading
  tradeQueue:    'data/trade_queue.json',
  tradeLimits:   'data/trade_limits.json',
  trades:        'data/trades.json',
  sellsByDay:    'data/sells_by_day.json',

  // archives / summaries
  summariesDir:  'data/summaries',              // use helpers below to build file paths
  duelSummaries: 'public/data/duel_summaries.json', // public

  // helpers for dynamic public files
  revealFor: (id) => `public/data/reveal_${id}.json`,
  summaryFor: (duelId) => `data/summaries/${duelId}.json`,
};
