// logic/duelState.js

// Core practice duel state structure
export const duelState = {
  players: {
    player1: { hp: 200, hand: [], field: [], deck: [], discardPile: [] },
    bot: { hp: 200, hand: [], field: [], deck: [], discardPile: [] },
  },
  currentPlayer: 'player1',
  winner: null,
};

// Function to start a new practice duel (admin-only command triggers this)
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
}
