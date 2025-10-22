// routes/duelStart.js
//
// Launches live duels using persistent storage (linked_decks.json via storageClient)
// Mounted at: app.use('/duelstart', duelStartRoutes)

import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { startLiveDuel, duelState } from '../logic/duelState.js';
import { load_file } from '../utils/storageClient.js';

// NEW: session registry (multi-duel discovery)
import {
  upsertSession,
  setSessionStateProvider,
} from '../logic/duelRegistry.js';

const router = express.Router();

// ────────────────────────────────────────────────────────────
// Load CoreMasterReference.json (static asset)
// ────────────────────────────────────────────────────────────
let coreCards = [];
const corePath = path.join(process.cwd(), 'logic', 'CoreMasterReference.json');

try {
  const raw = await fs.readFile(corePath, 'utf-8');
  coreCards = JSON.parse(raw);
  console.log(`[DUEL] Loaded ${coreCards.length} cards from CoreMasterReference`);
} catch (err) {
  console.error('❌ [DUEL] Failed to load CoreMasterReference.json:', err);
  coreCards = [];
}

// ────────────────────────────────────────────────────────────
// POST /start — launches a live duel
// ────────────────────────────────────────────────────────────
router.post('/start', async (req, res) => {
  const { player1Id, player2Id, wager = 0 } = req.body || {};

  // Prevent launching if duel already active (global duelState guard)
  // NOTE: This preserves current behavior. True concurrency will require
  // per-session state in logic/duelState.js (not just a single global duelState).
  const p1Len = duelState.players?.player1?.deck?.length || 0;
  // allow either key for side B (your schema currently uses 'bot')
  const pBLen =
    (duelState.players?.player2?.deck?.length ||
     duelState.players?.bot?.deck?.length || 0);
  if (p1Len > 0 || pBLen > 0) {
    return res.status(409).json({ error: 'A duel is already in progress.' });
  }

  try {
    console.log(`[STORAGE] Loading linked_decks.json from persistent storage...`);
    const linkedData = await load_file('linked_decks.json');
    const deckMap = JSON.parse(linkedData);

    if (!deckMap?.players?.length) {
      console.warn(`[STORAGE] linked_decks.json appears empty or malformed`);
      return res.status(500).json({ error: 'No linked decks found in persistent data.' });
    }

    const deckById = {};
    for (const entry of deckMap.players) {
      deckById[entry.discordId] = entry.deck.map(cardId => ({
        cardId,
        isFaceDown: false
      }));
    }

    const player1Deck = deckById[player1Id];
    const player2Deck =
      player2Id === 'bot' ? generateBotDeck() : deckById[player2Id];

    if (!player1Deck || !player2Deck) {
      console.warn(`[DUEL] Missing deck for ${!player1Deck ? 'player1' : 'player2'}`);
      return res.status(400).json({
        error: 'One or both decks not found for the given player IDs.'
      });
    }

    // Launch the duel (global duelState is initialized here)
    const duelId = uuidv4();
    duelState.duelId = duelId;
    startLiveDuel(player1Id, player2Id, player1Deck, player2Deck, wager);

    // ── NEW: Register this duel in the session registry for /duel/active discovery
    upsertSession({
      id: duelId,
      status: 'live',
      isPractice: false,
      players: [
        { userId: String(player1Id || ''), name: 'Player 1' },
        { userId: String(player2Id || ''), name: (player2Id === 'bot' ? 'Practice Bot' : 'Player 2') },
      ],
    });

    // Expose a state provider. For now, we return the global duelState to retain behavior.
    // When you move to per-session state, replace this with a per-session getter.
    setSessionStateProvider(duelId, () => duelState);

    const uiBase = process.env.FRONTEND_URL || '';
    const uiUrl  = uiBase
      ? `${uiBase}/duel.html?player=${player1Id}`
      : undefined;

    console.log(
      `[DUEL] Started live duel ${duelId} between ${player1Id} and ${player2Id} (wager=${wager})`
    );

    return res.status(200).json({
      message: 'Duel started.',
      url: uiUrl,
      duelId
    });
  } catch (err) {
    console.error('❌ [DUEL] Failed to launch duel:', err);
    return res
      .status(500)
      .json({ error: 'Duel start failed.', details: err.message });
  }
});

// ────────────────────────────────────────────────────────────
// Bot Deck Generator (unchanged logic)
// ────────────────────────────────────────────────────────────
function generateBotDeck() {
  const eligible = coreCards.filter(
    c => ['Common', 'Uncommon'].includes(c.rarity) && c.card_id !== '000'
  );

  const deck = [];
  while (deck.length < 30) {
    const pick = eligible[Math.floor(Math.random() * eligible.length)];
    deck.push({ cardId: pick.card_id, isFaceDown: false });
  }

  console.log(`[DUEL] Generated bot deck (${deck.length} cards)`);
  return deck;
}

export default router;
