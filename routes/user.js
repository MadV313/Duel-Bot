// routes/user.js

import express from 'express';
import { load_file } from '../utils/storageClient.js';

const router = express.Router();

// Persistent storage keys
const LINKED_DECKS_FILE = 'linked_decks.json';
const COIN_BANK_FILE    = 'coin_bank.json';
const PLAYER_DATA_FILE  = 'player_data.json';

// Safe JSON loader with fallback
async function readJsonRemote(name, fallback) {
  try {
    const raw = await load_file(name);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

// Compute a user's card count from either legacy or new shapes
function getCardsOwnedFromLinked(linked, userId) {
  if (!linked) return 0;

  // Newer shape: keyed by userId → { collection: { "001": 2, ... }, deck?: [...] }
  if (linked[userId]) {
    const profile = linked[userId] || {};
    // Prefer collection sum if available
    if (profile.collection && typeof profile.collection === 'object') {
      let total = 0;
      for (const qty of Object.values(profile.collection)) {
        const n = Number(qty || 0);
        if (n > 0) total += n;
      }
      if (total > 0) return total;
    }
    // Fallback to deck length if present
    if (Array.isArray(profile.deck)) {
      return profile.deck.length;
    }
    return 0;
  }

  // Legacy shape: { players: [{ discordId, deck: [...] }, ...] }
  if (Array.isArray(linked.players)) {
    const entry = linked.players.find(p => p.discordId === userId);
    if (Array.isArray(entry?.deck)) {
      return entry.deck.length;
    }
  }

  return 0;
}

/**
 * GET /user/:id
 * Returns a user's coin balance, card count, and win/loss stats
 */
router.get('/:id', async (req, res) => {
  const userId = String(req.params.id);

  try {
    const [linked, coins, stats] = await Promise.all([
      readJsonRemote(LINKED_DECKS_FILE, {}),   // linked profiles (new or legacy)
      readJsonRemote(COIN_BANK_FILE, {}),      // { userId: coins }
      readJsonRemote(PLAYER_DATA_FILE, {}),    // { userId: { wins, losses, ... } }
    ]);

    const cardsOwned = getCardsOwnedFromLinked(linked, userId);
    const coinBalance = Number(coins?.[userId] ?? 0);
    const winLoss = stats?.[userId] ?? { wins: 0, losses: 0 };

    return res.status(200).json({
      userId,
      cardsOwned,
      coins: coinBalance,
      wins: Number(winLoss.wins || 0),
      losses: Number(winLoss.losses || 0),
    });
  } catch (err) {
    console.error(`❌ [USER] Error fetching user data for ${userId}:`, err?.message || err);
    return res.status(500).json({ error: 'Failed to retrieve user data.' });
  }
});

export default router;
