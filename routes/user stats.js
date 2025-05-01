import express from 'express';
import fs from 'fs/promises';
import path from 'path';

const router = express.Router();

router.get('/stats/:id', async (req, res) => {
  const userId = req.params.id;

  try {
    const decksPath = path.resolve('./data/linked_decks.json');
    const coinsPath = path.resolve('./data/coin_bank.json');

    const [deckDataRaw, coinDataRaw] = await Promise.all([
      fs.readFile(decksPath, 'utf-8'),
      fs.readFile(coinsPath, 'utf-8'),
    ]);

    const decks = JSON.parse(deckDataRaw);
    const coins = JSON.parse(coinDataRaw);

    const userDeck = decks[userId]?.deck || [];
    const coinCount = coins[userId] || 0;

    return res.json({
      cardsOwned: userDeck.length,
      coins: coinCount
    });
  } catch (err) {
    console.error("User stats fetch failed:", err);
    return res.status(500).json({ error: 'Failed to fetch user stats.' });
  }
});

export default router;
