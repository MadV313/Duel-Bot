// routes/packReveal.js
//
// Serves per-user pack reveal payloads written by /buycard under ./public/data.
// API:
//   GET /packReveal/reveal?token=...   (preferred)
//   GET /packReveal/reveal?uid=...     (legacy)
//
// Also exposes a dev endpoint:
//   GET /packReveal/revealPack?count=3

import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { weightedRandomCards } from '../utils/cardPicker.js';
import { resolveUserIdByToken } from '../utils/deckUtils.js';

const router = express.Router();
const REVEAL_DIR = path.resolve('./public/data');

function noStore(res) {
  res.set('Cache-Control', 'no-store');
  return res;
}

async function readRevealIfExists(filename) {
  try {
    const full = path.join(REVEAL_DIR, filename);
    const raw = await fs.readFile(full, 'utf-8');
    // /buycard writes an array; tolerate {cards: [...]} too.
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : (parsed?.cards ?? []);
  } catch {
    return null;
  }
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

    // Resolve userId from token if we don’t have uid
    if (!uid && token) {
      try {
        const resolved = await resolveUserIdByToken(token);
        if (resolved) uid = resolved;
      } catch { /* ignore */ }
    }

    // Try token file first, then uid file
    let cards = null;
    if (token) cards = await readRevealIfExists(`reveal_${token}.json`);
    if (!cards && uid) cards = await readRevealIfExists(`reveal_${uid}.json`);

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
