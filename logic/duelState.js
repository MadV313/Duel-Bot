// logic/duelState.js

/**
 * Centralized duel state + lifecycle helpers for Practice and Live duels.
 * Requirements wired in:
 *  - Both players start at 200 HP
 *  - Each player draws 3 cards on start
 *  - Coin flip chooses who goes first
 *  - Field/hand limits enforced elsewhere (UI / action handlers)
 */

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// 🔁 Global duel state (kept simple; expand as needed)
export const duelState = {
  players: {
    player1: {
      id: null,              // Discord ID (for live duels)
      discordName: 'Player 1',
      hp: 200,
      hand: [],
      field: [],
      deck: [],
      discardPile: []
    },
    bot: {
      id: 'bot',
      discordName: 'Practice Bot',
      hp: 200,
      hand: [],
      field: [],
      deck: [],
      discardPile: []
    }
  },
  currentPlayer: 'player1',   // 'player1' | 'bot' | 'player2' for PvP
  winner: null,
  wagerAmount: null,
  spectators: [],
  duelMode: 'none',           // 'practice' | 'live'
  startedAt: null,
};

/* -----------------------------------------------------------
 * Utilities
 * ---------------------------------------------------------*/

/** Fisher–Yates shuffle (in place) */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Draw up to `count` cards from a player's deck */
export function drawCard(playerKey, count = 1) {
  const p = duelState.players[playerKey];
  if (!p) return;

  for (let i = 0; i < count; i++) {
    if (p.deck.length === 0) break;
    const card = p.deck.shift();
    p.hand.push(card);
  }
}

/** Reset a player's zone arrays and HP */
function resetPlayer(player, discordNameFallback) {
  player.hp = 200;
  player.hand = [];
  player.field = [];
  player.deck = [];
  player.discardPile = [];
  if (!player.discordName) player.discordName = discordNameFallback;
}

/* -----------------------------------------------------------
 * Practice Duel (vs Bot)
 * ---------------------------------------------------------*/

/**
 * Build a simple 30-card deck from provided cardList.
 * Uses Common/Uncommon only, excludes card_id '000' (back image).
 */
function buildPracticeDeck(cardList) {
  const eligible = cardList.filter(
    c => c && ['Common', 'Uncommon'].includes(c.rarity) && c.card_id !== '000'
  );

  const deck = [];
  while (deck.length < 30 && eligible.length > 0) {
    const pick = eligible[Math.floor(Math.random() * eligible.length)];
    // Minimal payload the UI/handlers expect:
    deck.push({
      cardId: pick.card_id,
      isFaceDown: false,
    });
  }
  return shuffle(deck);
}

/**
 * Start a fresh Practice duel against the bot using CoreMaster cards.
 * - Resets duelState
 * - Builds 30-card decks for both sides
 * - Each draws 3
 * - Coin flip for first turn
 */
export function startPracticeDuel(cardList) {
  // Reset players
  resetPlayer(duelState.players.player1, 'Player 1');
  resetPlayer(duelState.players.bot, 'Practice Bot');

  // Build decks
  duelState.players.player1.deck = buildPracticeDeck(cardList);
  duelState.players.bot.deck = buildPracticeDeck(cardList);

  // Opening draws (3 each)
  drawCard('player1', 3);
  drawCard('bot', 3);

  // Coin flip for who goes first
  duelState.currentPlayer = Math.random() < 0.5 ? 'player1' : 'bot';

  // Reset meta
  duelState.duelMode = 'practice';
  duelState.wagerAmount = null;
  duelState.winner = null;
  duelState.spectators = [];
  duelState.startedAt = new Date().toISOString();

  return duelState;
}

/* -----------------------------------------------------------
 * Live Duel (PvP) – used by routes/duelStart.js
 * ---------------------------------------------------------*/

/**
 * Start a live duel.
 *
 * Compatible signatures:
 *   1) Object form (as documented here):
 *      startLiveDuel({
 *        player1Id, player2Id,
 *        player1Name?, player2Name?,
 *        player1Deck, player2Deck,
 *        wagerAmount?
 *      })
 *
 *   2) Positional form (as used in existing routes/duelStart.js):
 *      startLiveDuel(player1Id, player2Id, player1Deck, player2Deck, wagerAmount?)
 */
export function startLiveDuel(...args) {
  // Normalize arguments to an options object
  let opts;
  if (args.length === 1 && typeof args[0] === 'object' && !Array.isArray(args[0])) {
    opts = args[0];
  } else {
    const [player1Id, player2Id, player1Deck, player2Deck, wagerAmount] = args;
    opts = { player1Id, player2Id, player1Deck, player2Deck, wagerAmount };
  }

  const {
    player1Id,
    player2Id,
    player1Name = 'Challenger',
    player2Name = (opts?.player2Id === 'bot' ? 'Practice Bot' : 'Opponent'),
    player1Deck,
    player2Deck,
    wagerAmount = 0,
  } = opts || {};

  // Basic validation (you can expand with full deck checks)
  if (!Array.isArray(player1Deck) || !Array.isArray(player2Deck)) {
    throw new Error('Invalid decks provided for live duel.');
  }

  const p1 = duelState.players.player1;
  const p2 = duelState.players.bot; // NOTE: For symmetric PvP, rename 'bot' -> 'player2' across UI/handlers.

  // Assign identities
  p1.id = player1Id || null;
  p2.id = player2Id || null;

  p1.discordName = player1Name || 'Challenger';
  p2.discordName = player2Name || 'Opponent';

  // Reset and assign decks
  resetPlayer(p1, p1.discordName);
  resetPlayer(p2, p2.discordName);

  p1.deck = shuffle(deepClone(player1Deck));
  p2.deck = shuffle(deepClone(player2Deck));

  // Opening draws (3 each)
  drawCard('player1', 3);
  drawCard('bot', 3);

  // Turn + meta
  duelState.currentPlayer = Math.random() < 0.5 ? 'player1' : 'bot';
  duelState.duelMode = 'live';
  duelState.wagerAmount = wagerAmount || 0;
  duelState.winner = null;
  duelState.spectators = [];
  duelState.startedAt = new Date().toISOString();

  return duelState;
}

/**
 * End / reset the current duel.
 * Optionally record a winner ID (for summary pipeline).
 */
export function endLiveDuel(winnerId = null) {
  duelState.players.player1 = {
    id: null,
    discordName: 'Player 1',
    hp: 200,
    hand: [],
    field: [],
    deck: [],
    discardPile: []
  };

  duelState.players.bot = {
    id: 'bot',
    discordName: 'Practice Bot',
    hp: 200,
    hand: [],
    field: [],
    deck: [],
    discardPile: []
  };

  duelState.currentPlayer = 'player1';
  duelState.duelMode = 'none';
  duelState.wagerAmount = null;
  duelState.winner = winnerId || null;
  duelState.spectators = [];
  duelState.startedAt = null;

  return duelState;
}
