// duelUI.js

import { config } from './scripts/config.js';

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const isPractice = urlParams.get('practice') === 'true';
  const playerId = urlParams.get('player') || '';
  const safeView = urlParams.get('safeView'); // optional: 'true' to redact hands

  const API_BASE = String(config.backend_url || '').replace(/\/+$/, '');
  const ts = Date.now(); // cache-buster

  const duelEndpoint = isPractice
    ? `${API_BASE}/bot/practice?ts=${ts}`
    : `${API_BASE}/duel/live/current${safeView === 'true' ? `?safeView=true&ts=${ts}` : `?ts=${ts}`}`;

  try {
    const response = await fetch(duelEndpoint, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    const duelData = await response.json();

    if (!duelData || duelData.error) {
      throw new Error(duelData?.error || 'No duel data found');
    }

    renderDuelUI(duelData, playerId);
  } catch (err) {
    console.error('❌ Duel UI load error:', err);
    const container = document.getElementById('duel-container');
    if (container) container.textContent = '⚠️ Failed to load duel.';
  }
});

/**
 * Render the Duel UI view based on live duel state.
 * @param {Object} duelData - Full duel state from backend.
 * @param {string} playerId - The current player's Discord ID from URL.
 */
function renderDuelUI(duelData, playerId) {
  const { players = {}, currentPlayer, winner } = duelData;

  const turnLabel =
    currentPlayer === 'player1'
      ? 'Player 1 Turn'
      : currentPlayer === 'player2'
      ? 'Player 2 Turn'
      : 'Waiting…';

  const turnEl = document.getElementById('current-turn');
  if (turnEl) turnEl.textContent = turnLabel;

  if (winner) {
    const winnerName =
      players[winner]?.discordName ||
      players[winner]?.name ||
      'Unknown';
    const winEl = document.getElementById('winner-banner');
    if (winEl) winEl.textContent = `🏆 Winner: ${winnerName}`;
  }

  // Additional rendering logic goes here (hands, fields, HP, animations, etc.)
  // Keep existing structure; this file only refactors endpoint usage + hardening.
}
