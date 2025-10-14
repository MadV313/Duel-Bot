// routes/packReveal.js
//
// Keeps your existing /revealPack endpoint and ADDs a token/uid-aware
// /packReveal/reveal endpoint that serves the per-user reveal JSON written by /cardpack.

import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { weightedRandomCards } from '../utils/cardPicker.js';  // Core logic for rarity-weighted pulls
import { resolveUserIdByToken } from '../utils/deckUtils.js';

const router = express.Router();

// Where /cardpack writes the reveal files, e.g. public/data/reveal_<userId>.json
const REVEAL_DIR = path.resolve('./public/data');

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
    const { token, uid } = req.query;

    let userId = uid;
    if (!userId && token) {
      userId = await resolveUserIdByToken(token);
    }

    if (!userId) {
      return res.status(400).json({ error: 'Missing token or uid, or token not found.' });
    }

    const filePath = path.join(REVEAL_DIR, `reveal_${userId}.json`);

    let raw;
    try {
      raw = await fs.readFile(filePath, 'utf-8');
    } catch {
      return res.status(404).json({ error: 'Reveal file not found for this user.' });
    }

    let json;
    try {
      json = JSON.parse(raw);
    } catch {
      return res.status(500).json({ error: 'Reveal file is corrupted.' });
    }

    res.set('Cache-Control', 'no-store');
    return res.status(200).json(json);
  } catch (err) {
    console.error('❌ /packReveal/reveal error:', err);
    return res.status(500).json({ error: 'Failed to load reveal.' });
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
      return res.status(400).json({ error: 'Invalid pack size. Choose between 1 and 10.' });
    }

    const cards = weightedRandomCards(count);
    res.status(200).json(cards);
  } catch (error) {
    console.error('❌ Error fetching random cards:', error);
    res.status(500).json({ error: 'Failed to fetch cards.' });
  }
});

export default router;
