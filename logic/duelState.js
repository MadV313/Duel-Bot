// logic/duelState.js

// 🔁 Centralized state for active duel
export const duelState = {
  players: {
    player1: { hp: 200, hand: [], field: [], deck: [], discardPile: [] },
    bot:     { hp: 200, hand: [], field: [], deck: [], discardPile: [] }
  },
  currentPlayer: 'player1',
  winner: null,
  wagerAmount: null,
  spectators: []
};

/**
 * 🔹 Start a practice duel vs bot using mock random decks
 * @param {Array} cardList - Full card pool (excluding #000)
 */
export function startPracticeDuel(cardList) {
  const getRandomDeck = () => {
    const deck = [];
    while (deck.length < 20) {
      const pick = cardList[Math.floor(Math.random() * cardList.length)];
      if (pick.card_id !== '000') {
        deck.push({ cardId: pick.card_id, isFaceDown: false });
      }
    }
    return deck;
  };

  duelState.players.player1 = {
    hp: 200,
    hand: [],
    field: [],
    deck: getRandomDeck(),
    discardPile: []
  };

  duelState.players.bot = {
    hp: 200,
    hand: [],
    field: [],
    deck: getRandomDeck(),
    discardPile: []
  };

  duelState.currentPlayer = 'player1';
  duelState.winner = null;
  duelState.wagerAmount = null;
  duelState.spectators = [];
}

/**
 * 🔸 Start a live PvP duel between two real players
 * @param {string} player1Id - Discord ID of player 1
 * @param {string} player2Id - Discord ID of player 2
 * @param {Array} player1Deck - Array of card objects for player 1
 * @param {Array} player2Deck - Array of card objects for player 2
 * @param {number} wager - Optional wager amount (coins)
 */
export function startLiveDuel(player1Id, player2Id, player1Deck, player2Deck, wager = 0) {
  duelState.players = {
    player1: {
      discordId: player1Id,
      hp: 200,
      hand: [],
      field: [],
      deck: [...player1Deck],
      discardPile: []
    },
    player2: {
      discordId: player2Id,
      hp: 200,
      hand: [],
      field: [],
      deck: [...player2Deck],
      discardPile: []
    }
  };

  duelState.currentPlayer = 'player1';
  duelState.winner = null;
  duelState.wagerAmount = wager;
  duelState.spectators = [];
}

/**
 * 🛑 End or reset the current duel
 * @param {string|null} winnerId - Optional winner’s Discord ID
 */
export function endLiveDuel(winnerId = null) {
  duelState.players = {
    player1: { hp: 200, hand: [], field: [], deck: [], discardPile: [] },
    bot:     { hp: 200, hand: [], field: [], deck: [], discardPile: [] }
  };

  duelState.currentPlayer = 'player1';
  duelState.winner = winnerId || null;
  duelState.wagerAmount = null;
  duelState.spectators = [];
}
