// utils/storageClient.js
//
// Persistent JSON storage client with retries, timeouts, and safe helpers.
// ✅ Back-compat filename remapping so old calls like "linked_decks.json" still hit /data/linked_decks.json
// ✅ Exports: loadJSON(), saveJSON(), deleteJSON(), updateJSONAtomic(), healthCheck()
// ✅ Aliases: load_file(), save_file()
// ✅ Canonical PATHS use the new prefixed locations.

import fetch from 'node-fetch';

const BASE = String(process.env.PERSISTENT_DATA_URL || '').replace(/\/+$/, '');
if (!BASE) throw new Error('❌ [STORAGE] PERSISTENT_DATA_URL not set');

const RETRIES    = Number(process.env.STORAGE_RETRIES || 2);
const TIMEOUT_MS = Number(process.env.STORAGE_TIMEOUT_MS || 12_000);
const RETRY_BASE = Number(process.env.STORAGE_RETRY_BASE_MS || 400);

function log(msg, ...a) { console.log('[STORAGE]', msg, ...a); }
function err(msg, ...a) { console.error('[STORAGE]', msg, ...a); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function withTimeout(promise, ms = TIMEOUT_MS) {
  let to;
  const timer = new Promise((_, reject) => { to = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms); });
  try { return await Promise.race([promise, timer]); }
  finally { clearTimeout(to); }
}

/* ───────────────────────────────
 * Back-compat filename remapping
 * ─────────────────────────────── */
const LEGACY_EXACT = new Map([
  // core player data
  ['linked_decks.json',     'data/linked_decks.json'],
  ['wallet.json',           'data/coin_bank.json'],     // legacy name
  ['coin_bank.json',        'data/coin_bank.json'],
  ['player_data.json',      'data/player_data.json'],

  // limits / trades
  ['sells_by_day.json',     'data/sells_by_day.json'],
  ['trade_limits.json',     'data/trade_limits.json'],
  ['trade_queue.json',      'data/trade_queue.json'],
  ['tradeQueue.json',       'data/trade_queue.json'],   // legacy camel
  ['trades.json',           'data/trades.json'],

  // duel logs / stats
  ['current_duel_log.json', 'data/logs/current_duel_log.json'],
  ['duelStats.json',        'data/duelStats.json'],

  // public
  ['duel_summaries.json',   'public/data/duel_summaries.json'],
]);

function remapFilename(name) {
  const raw = String(name || '').replace(/^\/+/, '');

  // if it’s already prefixed, keep it
  if (raw.startsWith('data/') || raw.startsWith('public/data/')) return raw;

  // exact legacy hits
  if (LEGACY_EXACT.has(raw)) return LEGACY_EXACT.get(raw);

  // summaries/<id>.json  → data/summaries/<id>.json
  if (raw.startsWith('summaries/')) return `data/${raw}`;

  // logs/<file>.json → data/logs/<file>.json
  if (raw.startsWith('logs/')) return `data/${raw}`;

  // reveal_<token>.json → public/data/reveal_<token>.json
  if (/^reveal_.+\.json$/.test(raw)) return `public/data/${raw}`;

  // anything else: leave as-is (but this is rare)
  return raw;
}

function urlFor(filename) {
  const effective = remapFilename(filename);
  return `${BASE}/${effective}`;
}

async function parseJsonSafe(res) {
  const text = await res.text();
  if (!text) return {};
  try { return JSON.parse(text); }
  catch (e) {
    throw new Error(`Invalid JSON payload (${res.status} ${res.statusText}): ${e.message}`);
  }
}

/* ───────────────────────────────
 * Core operations
 * ─────────────────────────────── */

export async function loadJSON(filename) {
  const effective = remapFilename(filename);
  const url = urlFor(filename);
  let lastErr;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const res = await withTimeout(fetch(url, { method: 'GET', headers: { 'Cache-Control': 'no-store' } }));
      if (!res.ok) throw new Error(`GET ${res.status} ${effective}`);
      const data = await parseJsonSafe(res);
      log(`Loaded ${effective} successfully.`);
      return data;
    } catch (e) {
      lastErr = e;
      err(`Load failed (${attempt + 1}/${RETRIES + 1}) for ${effective}: ${e.message}`);
      if (attempt < RETRIES) await sleep(RETRY_BASE * (attempt + 1));
    }
  }
  throw lastErr;
}

export async function saveJSON(filename, data) {
  const effective = remapFilename(filename);
  const url = urlFor(filename);
  let lastErr;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const res = await withTimeout(fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data, null, 2),
      }));
      if (!res.ok) throw new Error(`PUT ${res.status} ${effective}`);
      log(`Saved ${effective} successfully.`);
      return true;
    } catch (e) {
      lastErr = e;
      err(`Save failed (${attempt + 1}/${RETRIES + 1}) for ${effective}: ${e.message}`);
      if (attempt < RETRIES) await sleep(RETRY_BASE * (attempt + 1) + 50);
    }
  }
  throw lastErr;
}

export async function deleteJSON(filename) {
  const effective = remapFilename(filename);
  const url = urlFor(filename);
  try {
    const res = await withTimeout(fetch(url, { method: 'DELETE' }));
    if (!res.ok) throw new Error(`DELETE ${res.status} ${effective}`);
    log(`Deleted ${effective} successfully.`);
    return true;
  } catch (e) {
    err(`Delete failed for ${effective}: ${e.message}`);
    throw e;
  }
}

export async function updateJSONAtomic(filename, mutator) {
  const effective = remapFilename(filename);
  const url = urlFor(filename);

  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    const getRes = await withTimeout(fetch(url, { method: 'GET', headers: { 'Cache-Control': 'no-store' } }));
    if (!getRes.ok) throw new Error(`GET ${getRes.status} ${effective}`);
    const etag = getRes.headers.get('etag'); // may be null
    const current = await parseJsonSafe(getRes);

    let next;
    try { next = await mutator(current); }
    catch (e) { err(`Mutator threw for ${effective}: ${e.message}`); throw e; }

    const headers = { 'Content-Type': 'application/json' };
    if (etag) headers['If-Match'] = etag;

    const putRes = await withTimeout(fetch(url, { method: 'PUT', headers, body: JSON.stringify(next, null, 2) }));
    if (putRes.ok) { log(`Atomic update succeeded for ${effective}.`); return true; }

    if (putRes.status === 412 || putRes.status === 409) {
      err(`Conflict updating ${effective} (attempt ${attempt + 1}). Retrying…`);
      if (attempt < RETRIES) { await sleep(RETRY_BASE * (attempt + 1)); continue; }
    }

    const body = await putRes.text().catch(() => '');
    throw new Error(`PUT ${putRes.status} ${effective}: ${body || putRes.statusText}`);
  }

  throw new Error(`Atomic update exceeded retry budget for ${effective}`);
}

export async function healthCheck(filename = '') {
  const effective = filename ? remapFilename(filename) : 'BASE';
  const url = filename ? urlFor(filename) : BASE;
  try {
    const res = await withTimeout(fetch(url, { method: 'HEAD' }));
    const ok = res.ok;
    log(`Health check ${ok ? 'OK' : 'FAIL'} for ${effective} (${res.status})`);
    return ok;
  } catch (e) {
    err(`Health check error for ${effective}: ${e.message}`);
    return false;
  }
}

/* Aliases */
export async function load_file(filename)  { return loadJSON(filename); }
export async function save_file(filename, data) { return saveJSON(filename, data); }

/* Canonical paths (use these in new code) */
export const PATHS = {
  linkedDecks:        'data/linked_decks.json',
  wallet:             'data/coin_bank.json',
  playerData:         'data/player_data.json',
  sellsByDay:         'data/sells_by_day.json',
  tradeLimits:        'data/trade_limits.json',
  tradeQueue:         'data/trade_queue.json',
  trades:             'data/trades.json',
  duelLogCurrent:     'data/logs/current_duel_log.json',
  duelSummaryFor:     (duelId) => `data/summaries/${duelId}.json`,
  duelStats:          'data/duelStats.json',
  public: {
    duelSummaries:    'public/data/duel_summaries.json',
    revealFor:        (tokenOrUserId) => `public/data/reveal_${tokenOrUserId}.json`,
  },
};
