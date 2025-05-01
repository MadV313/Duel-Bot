// routes/user.js

import express from 'express';
import fs from 'fs';
import path from 'path';

const router = express.Router();

const decksPath = path.resolve('./data/linked_decks.json');
const coinsPath = path.resolve('./data/coin_bank.json');

// GET /user/:id — Return coin and card count for a player
router.get('/:id', (req, res) => {
  const userId = req.params.id;

  try {
    const decksRaw = fs.existsSync(decksPath)
      ? JSON.parse(fs.readFileSync(decksPath))
      : { players: [] };

    const coinsRaw = fs.existsSync(coinsPath)
      ? JSON.parse(fs.readFileSync(coinsPath))
      : {};

    const playerEntry = decksRaw.players.find(p => p.discordId === userId);
    const coinBalance = coinsRaw[userId] || 0;
    const cardsOwned = playerEntry?.deck?.length || 0;

    res.status(200).json({ cardsOwned, coins: coinBalance });
  } catch (err) {
    console.error("Failed to fetch user data:", err);
    res.status(500).json({ error: 'Internal error fetching user data.' });
  }
});

export default router;
