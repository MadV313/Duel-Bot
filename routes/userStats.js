// routes/userStats.js

import express from 'express';
import fs from 'fs/promises';
import path from 'path';

const router = express.Router();

const decksPath = path.resolve('./data/linked_decks.json');
const coinsPath = path.resolve('./data/coin_bank.json');
const statsPath = path.resolve('./data/player_data.json');

/**
 * GET /userStats/:id
 * Returns player name, coin balance, unlocked count, and duel stats
 */
router.get('/:id', async (req, res) => {
  const userId = req.params.id;
  console.log(`📥 API call: /userStats/${userId}`);

  try {
    const [deckRaw, coinRaw, statsRaw] = await Promise.all([
      fs.readFile(decksPath, 'utf-8'),
      fs.readFile(coinsPath, 'utf-8'),
      fs.readFile(statsPath, 'utf-8'),
    ]);

    const decks = JSON.parse(deckRaw);
    const coins = JSON.parse(coinRaw);
    const stats = JSON.parse(statsRaw);

    const player = decks[userId];
    if (!player) {
      console.warn(`⚠️ No linked deck for user: ${userId}`);
      return res.status(404).json({ error: 'Player not found or not linked.' });
    }

    const name = player.discordName || player.username || 'Survivor';
    const coinBalance = coins[userId] ?? 0;
    const winCount = stats[userId]?.wins ?? 0;
    const lossCount = stats[userId]?.losses ?? 0;

    const collection = player.collection || {};
    const cardsOwned = Object.values(collection).reduce((sum, qty) => sum + qty, 0);
    const cardsCollected = Object.keys(collection)
      .filter(id => {
        const parsed = parseInt(id, 10);
        return parsed >= 1 && parsed <= 127;
      }).length;

    const result = {
      name,
      coins: coinBalance,
      cardsCollected,
      cardsOwned,
      duelsWon: winCount,
      duelsLost: lossCount,
    };

    console.log(`✅ Stats for ${userId}:`, result);
    return res.status(200).json(result);

  } catch (err) {
    console.error(`❌ Error in /userStats/${userId}:`, err);
    return res.status(500).json({ error: 'Unable to retrieve user statistics.' });
  }
});

export default router;
