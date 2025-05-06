// logic/duelState.js

// Core duel state structure
export const duelState = {
  players: {
    player1: { hp: 200, hand: [], field: [], deck: [], discardPile: [] },
    bot: { hp: 200, hand: [], field: [], deck: [], discardPile: [] },
  },
  currentPlayer: 'player1',
  winner: null,
  wagerAmount: null,
  spectators: [] // Used by watch/leave/viewlog
};

// Admin-only function to start a practice duel
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

  duelState.players.player1.deck = getRandomDeck();
  duelState.players.bot.deck = getRandomDeck();

  duelState.players.player1.hp = 200;
  duelState.players.bot.hp = 200;

  duelState.players.player1.hand = [];
  duelState.players.bot.hand = [];

  duelState.players.player1.field = [];
  duelState.players.bot.field = [];

  duelState.players.player1.discardPile = [];
  duelState.players.bot.discardPile = [];

  duelState.currentPlayer = 'player1';
  duelState.winner = null;
  duelState.wagerAmount = null;
  duelState.spectators = [];
}

// Function to start a live PvP duel
export function startLiveDuel(player1Id, player2Id, player1Deck, player2Deck, wager = 0) {
  duelState.players = {
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
  };

  duelState.currentPlayer = 'player1';
  duelState.winner = null;
  duelState.wagerAmount = wager;
  duelState.spectators = [];
}

// Function to end/reset the duel
export function endLiveDuel(winnerId = null) {
  duelState.players = {
    player1: { hp: 200, hand: [], field: [], deck: [], discardPile: [] },
    bot: { hp: 200, hand: [], field: [], deck: [], discardPile: [] },
  };
  duelState.currentPlayer = 'player1';
  duelState.winner = winnerId || null;
  duelState.wagerAmount = null;
  duelState.spectators = [];
}
