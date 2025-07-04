// routes/collection.js

import express from 'express';
import fs from 'fs';
import path from 'path';
import { getPlayerCollection } from '../utils/deckUtils.js';

const router = express.Router();

const masterListPath = path.resolve('data', 'dayz_ccg_cards_with_000_all_fixed.json');
const masterList = JSON.parse(fs.readFileSync(masterListPath, 'utf8'));

/**
 * GET /collection?userId=1234567890
 * Returns player's card collection including quantity, metadata, and image info
 */
router.get('/collection', (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  const collection = getPlayerCollection(userId);
  if (!collection) return res.json([]);

  const formatted = Object.entries(collection).map(([cardId, qty]) => {
    const card = masterList.find(c => c.cardId === cardId || c.number === cardId);

    return {
      cardId,
      number: card?.number || cardId,
      owned: qty,
      name: card?.name || "Unknown",
      rarity: card?.rarity || "Common",
      type: card?.type || "Unknown",
      filename: card?.filename || "000_CardBack_Unique.png",
      isNew: false  // Placeholder in case frontend wants to badge "newly unlocked"
    };
  });

  res.json(formatted);
});

export default router;
