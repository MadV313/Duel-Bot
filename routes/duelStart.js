// routes/duelStart.js

import express from 'express';
import fs from 'fs/promises';
import path from 'path';

const router = express.Router();

router.post('/start', async (req, res) => {
  const { player1Id, player2Id } = req.body;

  try {
    const dataPath = path.join(process.cwd(), 'data', 'linked_decks.json');
    const raw = await fs.readFile(dataPath, 'utf-8');
    const deckMap = JSON.parse(raw);

    const player1Deck = deckMap[player1Id];
    const player2Deck = player2Id === 'bot' ? generateBotDeck() : deckMap[player2Id];

    if (!player1Deck || !player2Deck) {
      return res.status(400).json({ error: 'One or both decks not found for the given player IDs.' });
    }

    const duelState = {
      currentPlayer: 'player1',
      winner: null,
      players: {
        player1: {
          discordId: player1Id,
          hp: 200,
          hand: [],
          field: [],
          deck: [...player1Deck],
          discardPile: [],
        },
        player2: {
          discordId: player2Id,
          hp: 200,
          hand: [],
          field: [],
          deck: [...player2Deck],
          discardPile: [],
        },
      }
    };

    return res.status(200).json(duelState);
  } catch (err) {
    console.error("Failed to load duel:", err);
    return res.status(500).json({ error: 'Duel start failed.', details: err.message });
  }
});

function generateBotDeck() {
  // Generate a default mock deck of 30 cards (cardId: 001–030 for testing)
  return Array.from({ length: 30 }, (_, i) => ({ cardId: String(i + 1).padStart(3, '0') }));
}

export default router;
