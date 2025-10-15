// routes/packReveal.js
//
// Keeps your existing /revealPack endpoint and ADDs a token/uid-aware
// /packReveal/reveal endpoint that serves the per-user reveal JSON written by /cardpack.
//
// Updates:
//  • Supports reading either reveal_<token>.json or reveal_<userId>.json (your /cardpack writes both)
//  • Adds Cache-Control: no-store on all responses
//  • Slightly clearer error handling while preserving the same public shape

import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { weightedRandomCards } from '../utils/cardPicker.js';  // Core logic for rarity-weighted pulls
import { resolveUserIdByToken } from '../utils/deckUtils.js';

const router = express.Router();

// Where /cardpack writes the reveal files, e.g. public/data/reveal_<userId>.json and reveal_<token>.json
const REVEAL_DIR = path.resolve('./public/data');

function jsonNoStore(res, code, body) {
  res.set('Cache-Control', 'no-store');
  return res.status(code).json(body);
}

/**
 * GET /packReveal/reveal?token=...   (preferred)
 * GET /packReveal/reveal?uid=...     (legacy)
 *
 * Resolves token → userId when needed and returns the JSON reveal payload:
 *  [
 *    { card_id: "#001", name: "...", rarity: "Common", filename: "...", isNew: true, owned: 1 },
 *    ...
 *  ]
 */
router.get('/reveal', async (req, res) => {
  try {
    const { token, uid } = req.query || {};

    // 1) Resolve userId from token when provided
    let userId = uid;
    if (!userId && token) {
      try {
        userId = await resolveUserIdByToken(String(token));
      } catch (e) {
        // fall through; we'll still try reading token-based file below
      }
    }

    if (!token && !userId) {
      return jsonNoStore(res, 400, { error: 'Missing token or uid.' });
    }

    // 2) We support both reveal_<token>.json and reveal_<userId>.json.
    //    Try token file first (more specific), then user file.
    const tryFiles = [];
    if (token)  tryFiles.push(path.join(REVEAL_DIR, `reveal_${String(token)}.json`));
    if (userId) tryFiles.push(path.join(REVEAL_DIR, `reveal_${String(userId)}.json`));

    let raw = null;
    let lastErr = null;

    for (const filePath of tryFiles) {
      try {
        raw = await fs.readFile(filePath, 'utf-8');
        if (raw) break;
      } catch (err) {
        lastErr = err;
      }
    }

    if (!raw) {
      return jsonNoStore(res, 404, { error: 'Reveal file not found for this user/token.' });
    }

    let json;
    try {
      json = JSON.parse(raw);
    } catch {
      return jsonNoStore(res, 500, { error: 'Reveal file is corrupted.' });
    }

    return jsonNoStore(res, 200, json);
  } catch (err) {
    console.error('❌ /packReveal/reveal error:', err);
    return jsonNoStore(res, 500, { error: 'Failed to load reveal.' });
  }
});

/**
 * GET /revealPack?count=3
 * Returns a randomized pack of cards (default: 3 cards)
 * (Useful for testing/dev; does not persist to any user profile.)
 */
router.get('/revealPack', (req, res) => {
  try {
    const count = parseInt(req.query.count, 10) || 3;

    if (count <= 0 || count > 10) {
      return jsonNoStore(res, 400, { error: 'Invalid pack size. Choose between 1 and 10.' });
    }

    const cards = weightedRandomCards(count);
    return jsonNoStore(res, 200, cards);
  } catch (error) {
    console.error('❌ Error fetching random cards:', error);
    return jsonNoStore(res, 500, { error: 'Failed to fetch cards.' });
  }
});

export default router;
