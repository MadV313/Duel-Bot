// PRACTICE DUEL LAUNCHER
export function startPracticeDuel() {
  // Reset state
  duelState.players = {
    player1: { hp: 200, hand: [], field: [], deck: [], discardPile: [] },
    bot: { hp: 200, hand: [], field: [], deck: [], discardPile: [] },
  };
  duelState.currentPlayer = 'player1';
  duelState.winner = null;

  // Load mock decks (20 random cards each)
  import('./CoreMasterReference.json', { assert: { type: 'json' } })
    .then(module => {
      const allCards = module.default;

      const playerDeck = [];
      const botDeck = [];

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
