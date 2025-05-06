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
    if (!duelData || duelData.error) throw new Error(duelData.error || 'No duel data found');

    renderDuelUI(duelData, playerId);
  } catch (err) {
    console.error('Duel UI load error:', err);
    document.getElementById('duel-container').textContent = 'Failed to load duel.';
  }
});

function renderDuelUI(duelData, playerId) {
  const { players, currentPlayer, winner } = duelData;

  document.getElementById('current-turn').textContent =
    currentPlayer === 'player1' ? 'Player 1 Turn' : 'Player 2 Turn';

  if (winner) {
    document.getElementById('winner-banner').textContent =
      `Winner: ${players[winner]?.discordName || 'Unknown'}`;
  }

  // Additional rendering logic here...
}
