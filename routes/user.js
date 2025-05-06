// routes/user.js

import express from 'express';
import fs from 'fs';
import path from 'path';

const router = express.Router();

const decksPath = path.resolve('./data/linked_decks.json');
const coinsPath = path.resolve('./data/coin_bank.json');
const statsPath = path.resolve('./data/player_data.json');

// GET /user/:id — Return coin, card, and win/loss data for a player
router.get('/:id', (req, res) => {
  const userId = req.params.id;

  try {
    const decksRaw = fs.existsSync(decksPath)
      ? JSON.parse(fs.readFileSync(decksPath, 'utf-8'))
      : { players: [] };

    const coinsRaw = fs.existsSync(coinsPath)
      ? JSON.parse(fs.readFileSync(coinsPath, 'utf-8'))
      : {};

    const statsRaw = fs.existsSync(statsPath)
      ? JSON.parse(fs.readFileSync(statsPath, 'utf-8'))
      : {};

    const playerEntry = decksRaw.players.find(p => p.discordId === userId);
    const coinBalance = coinsRaw[userId] ?? 0;
    const cardsOwned = Array.isArray(playerEntry?.deck) ? playerEntry.deck.length : 0;
    const winLoss = statsRaw[userId] ?? { wins: 0, losses: 0 };

    res.status(200).json({
      userId,
      cardsOwned,
      coins: coinBalance,
      wins: winLoss.wins,
      losses: winLoss.losses
    });
  } catch (err) {
    console.error(`❌ Error fetching user data for ${userId}:`, err.message);
    res.status(500).json({ error: 'Failed to retrieve user data.' });
  }
});

export default router;
