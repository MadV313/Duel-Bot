// routes/packreveal.js

import express from 'express';
import { weightedRandomCards } from '../utils/cardPicker.js';  // Core logic for rarity-weighted pulls

const router = express.Router();

/**
 * GET /revealPack?count=3
 * Returns a randomized pack of cards (default: 3 cards)
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
