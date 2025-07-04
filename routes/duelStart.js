// routes/duelStart.js

import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { startLiveDuel, duelState } from '../logic/duelState.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Load CoreMasterReference.json at runtime
let coreCards = [];
const corePath = path.join(process.cwd(), 'data', 'CoreMasterReference.json');
try {
  const raw = await fs.readFile(corePath, 'utf-8');
  coreCards = JSON.parse(raw);
} catch (err) {
  console.error('❌ Failed to load CoreMasterReference.json:', err);
}

router.post('/start', async (req, res) => {
  const { player1Id, player2Id, wager = 0 } = req.body;

  // Prevent launching if duel already active
  if (
    duelState.players?.player1?.deck.length ||
    duelState.players?.player2?.deck.length
  ) {
    return res.status(409).json({ error: 'A duel is already in progress.' });
  }

  try {
    const dataPath = path.join(process.cwd(), 'data', 'linked_decks.json');
    const raw = await fs.readFile(dataPath, 'utf-8');
    const deckMap = JSON.parse(raw);

    const deckById = {};
    for (const entry of deckMap.players) {
      deckById[entry.discordId] = entry.deck.map(id => ({
        cardId: id,
        isFaceDown: false
      }));
    }

    const player1Deck = deckById[player1Id];
    const player2Deck =
      player2Id === 'bot' ? generateBotDeck() : deckById[player2Id];

    if (!player1Deck || !player2Deck) {
      return res.status(400).json({
        error: 'One or both decks not found for the given player IDs.'
      });
    }

    // Launch duel
    const duelId = uuidv4();
    duelState.duelId = duelId;
    startLiveDuel(player1Id, player2Id, player1Deck, player2Deck, wager);

    const uiUrl = `${process.env.FRONTEND_URL}/duel.html?player=${player1Id}`;
    return res.status(200).json({ message: 'Duel started.', url: uiUrl, duelId });
  } catch (err) {
    console.error('Failed to load duel:', err);
    return res.status(500).json({ error: 'Duel start failed.', details: err.message });
  }
});

function generateBotDeck() {
  const eligible = coreCards.filter(
    c => ['Common', 'Uncommon'].includes(c.rarity) && c.card_id !== '000'
  );

  const botDeck = [];
  while (botDeck.length < 30) {
    const pick = eligible[Math.floor(Math.random() * eligible.length)];
    botDeck.push({ cardId: pick.card_id, isFaceDown: false });
  }

  return botDeck;
}

export default router;
