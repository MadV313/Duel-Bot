// routes/packReveal.js
//
// Serves per-user pack reveal payloads written by /buycard or /cardpack
// under ./public/data (local) or your remote persistent storage via storageClient.
//
// API:
//   GET /packReveal/reveal?token=...   (preferred; unique per mint)
//   GET /packReveal/reveal?uid=...     (legacy; latest for user)
// Dev helper (not persisted):
//   GET /packReveal/revealPack?count=3

import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { weightedRandomCards } from '../utils/cardPicker.js';
import { resolveUserIdByToken } from '../utils/deckUtils.js';

// Optional remote persistent storage (Railway buckets, etc.)
let load_file = null;
try {
  ({ load_file } = await import('../utils/storageClient.js'));
} catch {
  // ok to run local-only
  console.warn('[packReveal] storageClient not found, will read local files only');
}

const router = express.Router();

// Allow overriding where reveal files live.
// Defaults to "./public/data".
const REVEAL_DIR =
  process.env.PACK_REVEAL_DIR
    ? path.resolve(process.env.PACK_REVEAL_DIR)
    : path.resolve('./public/data');

// Secondary namespace to try if your writer used "data/" instead of "public/data/"
const ALT_NAMESPACE = 'data';

function noStore(res) {
  res.set('Cache-Control', 'no-store');
  return res;
}

// Prevent path traversal: only allow simple tokens/uids (alnum, underscore, dash)
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

function toCandidates(id) {
  // Try both namespaces and both identifiers
  return [
    { ns: 'public/data', filename: `reveal_${id}.json` },
    { ns: ALT_NAMESPACE, filename: `reveal_${id}.json` },
  ];
}

async function readRevealLocal(ns, filename) {
  try {
    const base = ns === 'public/data' ? REVEAL_DIR : path.resolve(`./${ns}`);
    const full = path.join(base, filename);
    const raw = await fs.readFile(full, 'utf-8');
    const parsed = JSON.parse(raw);
    // /buycard & /cardpack may write an array or {cards:[...]}
    return Array.isArray(parsed) ? parsed : (parsed?.cards ?? null);
  } catch {
    return null;
  }
}

async function readRevealRemote(ns, filename) {
  if (typeof load_file !== 'function') return null;
  try {
    // storageClient reads by a virtual key like "public/data/reveal_...json"
    const key = `${ns}/${filename}`;
    const obj = await load_file(key);
    if (!obj) return null;
    if (Array.isArray(obj)) return obj;
    if (Array.isArray(obj?.cards)) return obj.cards;
    return null;
  } catch {
    return null;
  }
}

async function readReveal(id) {
  // Try remote-first (if available), then local FS. Try both namespaces.
  const candidates = toCandidates(id);
  for (const c of candidates) {
    const remote = await readRevealRemote(c.ns, c.filename);
    if (remote && remote.length) return remote;
  }
  for (const c of candidates) {
    const local = await readRevealLocal(c.ns, c.filename);
    if (local && local.length) return local;
  }
  return null;
}

/**
 * GET /packReveal/reveal?token=... | ?uid=...
 */
router.get('/reveal', async (req, res) => {
  try {
    const token = (req.query.token ?? '').toString().trim();
    let uid = (req.query.uid ?? '').toString().trim();

    if (!token && !uid) {
      return noStore(res).status(400).json({ error: 'Missing token or uid.' });
    }

    // Resolve to userId from token if no uid provided
    if (!uid && token) {
      try {
        const resolved = await resolveUserIdByToken(token);
        if (resolved) uid = resolved;
      } catch { /* ignore */ }
    }

    // Sanitize identifiers before composing filenames
    const safeToken = token && SAFE_ID.test(token) ? token : '';
    const safeUid   = uid   && SAFE_ID.test(uid)   ? uid   : '';

    // Prefer token file (unique per pack mint), then userId file (per-user latest)
    let cards = null;
    if (safeToken) cards = await readReveal(safeToken);
    if (!cards && safeUid) cards = await readReveal(safeUid);

    if (!cards || !cards.length) {
      return noStore(res).status(404).json({ error: 'Reveal not found.' });
    }

    return noStore(res).status(200).json({ title: 'New Card Pack Unlocked!', cards });
  } catch (e) {
    console.error('[packReveal] /reveal error:', e?.message || e);
    return noStore(res).status(500).json({ error: 'Failed to load reveal.' });
  }
});

/**
 * GET /packReveal/revealPack?count=3  (dev only; not persisted)
 */
router.get('/revealPack', (req, res) => {
  try {
    const n = Math.max(1, Math.min(10, parseInt(req.query.count, 10) || 3));
    const cards = weightedRandomCards(n);
    return noStore(res).status(200).json(cards);
  } catch (e) {
    console.error('[packReveal] /revealPack error:', e?.message || e);
    return noStore(res).status(500).json({ error: 'Failed to fetch cards.' });
  }
});

export default router;
