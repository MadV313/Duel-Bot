// scripts/summaryLoader.js

import { config } from './config.js';

document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const duelId = urlParams.get('duelId');

  const resultEl   = document.getElementById('resultText');
  const bannerEl   = document.getElementById('victoryBanner');
  const winnerEl   = document.getElementById('winnerName');
  const loserEl    = document.getElementById('loserName');
  const finalHpEl  = document.getElementById('finalHP');
  const eventList  = document.getElementById('eventList');
  const wagerSec   = document.getElementById('wagerSection');
  const wagerText  = document.getElementById('wagerText');

  if (!duelId) {
    if (resultEl) resultEl.textContent = 'No duel ID found in URL.';
    return;
  }

  const API_BASE = String(config.backend_url || '').replace(/\/+$/, '');
  const ts = Date.now();
  const url = `${API_BASE}/summary/${encodeURIComponent(duelId)}?ts=${ts}`;

  fetch(url, { cache: 'no-store' })
    .then(res => {
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res.json();
    })
    .then(data => {
      if (data?.error) throw new Error(data.error);
      renderSummary(data, { bannerEl, resultEl, winnerEl, loserEl, finalHpEl, eventList, wagerSec, wagerText });
    })
    .catch(err => {
      console.error('Summary load error:', err);
      if (resultEl) resultEl.textContent = 'Summary failed to load.';
    });
});

function renderSummary(summary, els) {
  const { players = {}, winner, events, wager } = summary;

  const winnerName =
    players[winner]?.discordName ||
    players[winner]?.name ||
    'Winner';
  const loserKey = winner === 'player1' ? 'player2' : 'player1';
  const loserName =
    players[loserKey]?.discordName ||
    players[loserKey]?.name ||
    'Opponent';
  const finalHP = players[winner]?.hp ?? 0;

  if (els.bannerEl) els.bannerEl.classList.remove('hidden');
  if (els.resultEl) els.resultEl.textContent = `${winnerName.toUpperCase()} WINS THE DUEL!`;
  if (els.winnerEl) els.winnerEl.textContent = `Winner: ${winnerName}`;
  if (els.loserEl) els.loserEl.textContent = `Loser: ${loserName}`;
  if (els.finalHpEl) els.finalHpEl.textContent = `Final HP: ${finalHP}`;

  if (Array.isArray(events) && events.length > 0 && els.eventList) {
    els.eventList.innerHTML = '';
    for (const event of events) {
      const li = document.createElement('li');
      li.textContent = event;
      els.eventList.appendChild(li);
    }
  }

  if (wager && Number(wager.amount)) {
    if (els.wagerSec) els.wagerSec.style.display = 'block';
    if (els.wagerText) els.wagerText.textContent = `${winnerName} gained +${wager.amount} coins.`;
  }
}

// Keep these functions for existing buttons/links
export function returnToMenu() {
  window.location.href = '/';
}

export function replayDuel() {
  window.location.href = '/duel.html?player=player1';
}
