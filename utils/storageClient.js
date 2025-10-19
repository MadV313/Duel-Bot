// utils/storageClient.js
import fetch from "node-fetch";

const BASE = (process.env.PERSISTENT_DATA_URL || "").replace(/\/+$/,"");
if (!BASE) throw new Error("❌ PERSISTENT_DATA_URL not set");

const RETRIES = Number(process.env.STORAGE_RETRIES || 2);
const TIMEOUT_MS = Number(process.env.STORAGE_TIMEOUT_MS || 12000);

function _log(msg, ...a) { console.log(`[STORAGE] ${msg}`, ...a); }
function _err(msg, ...a) { console.error(`[STORAGE] ${msg}`, ...a); }

async function _withTimeout(promise, ms = TIMEOUT_MS) {
  let to;
  const timeout = new Promise((_, rej) => {
    to = setTimeout(() => rej(new Error(`timeout ${ms}ms`)), ms);
  });
  try { return await Promise.race([promise, timeout]); }
  finally { clearTimeout(to); }
}

export const PATHS = {
  linkedDecks: "linked_decks.json",
  wallet: "wallet.json",
  playerData: "player_data.json",
  tradeQueue: "tradeQueue.json",
  duelStats: "duelStats.json",
};

export async function loadJSON(filename) {
  const url = `${BASE}/${filename}`;
  let lastErr;
  for (let i=0; i<=RETRIES; i++) {
    try {
      const res = await _withTimeout(fetch(url, { method: "GET", cache: "no-store" }));
      if (!res.ok) throw new Error(`GET ${res.status} ${url}`);
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      _log(`Loaded ${filename} successfully.`);
      return data;
    } catch (e) {
      lastErr = e; _err(`Load failed (${i+1}/${RETRIES+1}) for ${filename}: ${e.message}`);
      await new Promise(r => setTimeout(r, 400*(i+1)));
    }
  }
  throw lastErr;
}

export async function saveJSON(filename, data) {
  const url = `${BASE}/${filename}`;
  let lastErr;
  for (let i=0; i<=RETRIES; i++) {
    try {
      const res = await _withTimeout(fetch(url, {
        method: "PUT",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify(data, null, 2),
      }));
      if (!res.ok) throw new Error(`PUT ${res.status} ${url}`);
      _log(`Saved ${filename} successfully.`);
      return true;
    } catch (e) {
      lastErr = e; _err(`Save failed (${i+1}/${RETRIES+1}) for ${filename}: ${e.message}`);
      await new Promise(r => setTimeout(r, 450*(i+1)));
    }
  }
  throw lastErr;
}
