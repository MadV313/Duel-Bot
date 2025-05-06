// routes/userStats.js

import express from 'express';
import fs from 'fs/promises';
import path from 'path';

const router = express.Router();

const decksPath = path.resolve('./data/linked_decks.json');
const coinsPath = path.resolve('./data/coin_bank.json');

router.get('/:id', async (req, res) => {
  const userId = req.params.id;

  try {
    const [deckRaw, coinRaw] = await Promise.all([
      fs.readFile(decksPath, 'utf-8'),
      fs.readFile(coinsPath, 'utf-8'),
    ]);

    const decks = JSON.parse(deckRaw);
    const coins = JSON.parse(coinRaw);

    const playerEntry = decks.players.find(p => p.discordId === userId);
    const cardsOwned = Array.isArray(playerEntry?.deck) ? playerEntry.deck.length : 0;
    const coinBalance = coins[userId] ?? 0;

    return res.status(200).json({
      userId,
      cardsOwned,
      coins: coinBalance
    });

  } catch (err) {
    console.error(`❌ Error fetching stats for user ${userId}:`, err.message);
    return res.status(500).json({ error: 'Unable to retrieve user statistics.' });
  }
});

export default router;
