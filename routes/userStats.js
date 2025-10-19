// routes/userStats.js

import express from 'express';
import { load_file } from '../utils/storageClient.js';

const router = express.Router();

// Persistent storage keys
const LINKED_DECKS_FILE = 'linked_decks.json';
const COIN_BANK_FILE    = 'coin_bank.json';
const PLAYER_DATA_FILE  = 'player_data.json';

/**
 * GET /userStats/:id
 * Returns player name, coin balance, unlocked count, and duel stats
 */
router.get('/:id', async (req, res) => {
  const userId = req.params.id;
  console.log(`📥 API call: /userStats/${userId}`);

  try {
    // Load from persistent storage (graceful fallbacks)
    const [deckRaw, coinRaw, statsRaw] = await Promise.all([
      load_file(LINKED_DECKS_FILE).catch(() => null),
      load_file(COIN_BANK_FILE).catch(() => null),
      load_file(PLAYER_DATA_FILE).catch(() => null),
    ]);

    const decks = deckRaw ? JSON.parse(deckRaw) : {};
    const coins = coinRaw ? JSON.parse(coinRaw) : {};
    const stats = statsRaw ? JSON.parse(statsRaw) : {};

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
    const cardsOwned = Object.values(collection).reduce((sum, qty) => sum + (Number(qty) || 0), 0);
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
    console.error(`❌ Error in /userStats/${userId}:`, err?.message || err);
    return res.status(500).json({ error: 'Unable to retrieve user statistics.' });
  }
});

export default router;
