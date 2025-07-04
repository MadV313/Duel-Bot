// duelUI.js

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const isPractice = urlParams.get('practice') === 'true';
  const playerId = urlParams.get('player');

  const duelEndpoint = isPractice
    ? 'https://duel-bot-backend-production.up.railway.app/bot/practice'
    : 'https://duel-bot-backend-production.up.railway.app/duel/live/current';

  try {
    const response = await fetch(duelEndpoint);
    const duelData = await response.json();

    if (!duelData || duelData.error) {
      throw new Error(duelData.error || 'No duel data found');
    }

    renderDuelUI(duelData, playerId);
  } catch (err) {
    console.error('❌ Duel UI load error:', err);
    document.getElementById('duel-container').textContent = '⚠️ Failed to load duel.';
  }
});

/**
 * Render the Duel UI view based on live duel state.
 * @param {Object} duelData - Full duel state from backend.
 * @param {string} playerId - The current player's Discord ID from URL.
 */
function renderDuelUI(duelData, playerId) {
  const { players, currentPlayer, winner } = duelData;

  const turnLabel = currentPlayer === 'player1' ? 'Player 1 Turn' : 'Player 2 Turn';
  document.getElementById('current-turn').textContent = turnLabel;

  if (winner) {
    const winnerName = players[winner]?.discordName || 'Unknown';
    document.getElementById('winner-banner').textContent = `🏆 Winner: ${winnerName}`;
  }

  // Additional rendering logic goes here, such as hands, fields, HP, animations, etc.
}
