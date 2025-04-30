// duelState.js

export const duelState = {
  players: {},
  currentPlayer: null,
  winner: null,
  spectators: [] // NEW: Track spectators
};

// PRACTICE DUEL LAUNCHER
export function startPracticeDuel() {
  // Reset state
  duelState.players = {
    player1: { hp: 200, hand: [], field: [], deck: [], discardPile: [] },
    bot: { hp: 200, hand: [], field: [], deck: [], discardPile: [] },
  };
  duelState.currentPlayer = 'player1';
  duelState.winner = null;
  duelState.spectators = []; // Reset spectators for practice mode

  // Load mock decks (20 random cards each)
  import('./CoreMasterReference.json', { assert: { type: 'json' } })
    .then(module => {
      const allCards = module.default;

      const randomCards = (count) => {
        const sample = [];
        while (sample.length < count) {
          const pick = allCards[Math.floor(Math.random() * allCards.length)];
          if (pick.card_id !== '000') sample.push({ cardId: pick.card_id, isFaceDown: false });
        }
        return sample;
      };

      duelState.players.player1.deck = randomCards(20);
      duelState.players.bot.deck = randomCards(20);
    })
    .catch(err => console.error('Failed to load deck for practice duel:', err));
}

// PVP DUEL LAUNCHER (Live duel via /challenge)
export function startLiveDuel(player1Id, player2Id, player1Deck, player2Deck) {
  duelState.players = {
    player1: { discordId: player1Id, hp: 200, hand: [], field: [], deck: [...player1Deck], discardPile: [] },
    player2: { discordId: player2Id, hp: 200, hand: [], field: [], deck: [...player2Deck], discardPile: [] }
  };
  duelState.currentPlayer = 'player1';
  duelState.winner = null;
  duelState.spectators = []; // Reset for new duel
}
