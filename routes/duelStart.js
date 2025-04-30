import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { startLiveDuel } from '../logic/duelState.js';

const router = express.Router();

router.post('/start', async (req, res) => {
  const { player1Id, player2Id } = req.body;

  try {
    const dataPath = path.join(process.cwd(), 'data', 'linked_decks.json');
    const raw = await fs.readFile(dataPath, 'utf-8');
    const deckMap = JSON.parse(raw);

    // Convert to fast lookup
    const deckById = {};
    for (const entry of deckMap.players) {
      deckById[entry.discordId] = entry.deck.map(id => ({
        cardId: id,
        isFaceDown: false
      }));
    }

    const player1Deck = deckById[player1Id];
    const player2Deck = player2Id === 'bot' ? generateBotDeck() : deckById[player2Id];

    if (!player1Deck || !player2Deck) {
      return res.status(400).json({ error: 'One or both decks not found for the given player IDs.' });
    }

    // Launch duel
    startLiveDuel(player1Id, player2Id, player1Deck, player2Deck);

    return res.status(200).json({ message: 'Duel started.' });
  } catch (err) {
    console.error("Failed to load duel:", err);
    return res.status(500).json({ error: 'Duel start failed.', details: err.message });
  }
});

function generateBotDeck() {
  return Array.from({ length: 30 }, (_, i) => ({
    cardId: String(i + 1).padStart(3, '0'),
    isFaceDown: false
  }));
}

export default router;
