// hubEnhancements.js

import { config } from './config.js';

/**
 * Display a floating toast notification with the given message.
 * @param {string} message
 */
function showToast(message) {
  const toast = document.createElement('div');
  toast.textContent = message;
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '30px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: '#111',
    color: '#fff',
    padding: '10px 20px',
    borderRadius: '6px',
    fontSize: '14px',
    zIndex: '9999',
    boxShadow: '0 0 10px rgba(0,0,0,0.5)`,
    opacity: '0',
    transition: 'opacity 0.5s ease-in-out',
  });

  document.body.appendChild(toast);
  setTimeout(() => (toast.style.opacity = '1'), 100);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 500);
  }, 3000);
}

/**
 * Attempts to detect and store the Discord ID from clipboard or URL.
 */
function detectAndStoreDiscordId() {
  const clipboardCheck = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const match = text.match(/DISCORD_ID:(\d{17,})/);
      if (match) {
        localStorage.setItem('discord_id', match[1]);
        showToast(`Discord ID stored: ${match[1]}`);
      }
    } catch {
      console.warn('📋 Clipboard read failed or not permitted.');
    }
  };

  const urlCheck = () => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('discord_id')) {
      const id = params.get('discord_id');
      localStorage.setItem('discord_id', id);
      showToast(`Discord ID stored: ${id}`);
    }
    // Optional: if a token is present in URL, persist it for privacy-friendly routes
    if (params.has('token')) {
      const token = params.get('token');
      if (token) {
        localStorage.setItem('player_token', token);
        showToast('Player token stored.');
      }
    }
  };

  clipboardCheck();
  urlCheck();
}

/**
 * Loads and renders the current user's card and coin stats into the Hub UI.
 * Prefers token-based stats if available; falls back to /user/:id.
 */
async function loadPlayerStats() {
  const cardEl = document.getElementById('cardCount');
  const coinEl = document.getElementById('coinCount');

  const setPending = () => {
    if (cardEl) cardEl.textContent = 'Link deck to begin';
    if (coinEl) coinEl.textContent = '-';
  };
  const setUnavailable = () => {
    if (cardEl) cardEl.textContent = 'Unavailable';
    if (coinEl) coinEl.textContent = '-';
  };

  const API_BASE = String(config.backend_url || '').replace(/\/+$/, '');
  const userId = localStorage.getItem('discord_id');
  const token  = localStorage.getItem('player_token');
  const ts     = Date.now();

  if (!userId && !token) {
    setPending();
    return;
  }

  try {
    // Prefer token-based stats (privacy) if token exists, else use /user/:id
    const url = token
      ? `${API_BASE}/me/${encodeURIComponent(token)}/stats?ts=${ts}`
      : `${API_BASE}/user/${encodeURIComponent(userId)}?ts=${ts}`;

    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

    const data = await res.json();

    // Normalize expected fields for both endpoints
    // /me/:token/stats => { coins, wins, losses }
    // /user/:id        => { coins, cardsOwned, wins, losses }
    const coins = Number(data.coins || 0);
    const cardsOwned =
      typeof data.cardsOwned === 'number'
        ? data.cardsOwned
        : // If token path, we might not have cardsOwned; show just total known or placeholder
          (typeof data.cardsCollected === 'number' ? data.cardsCollected : null);

    if (cardEl) {
      if (cardsOwned !== null) {
        cardEl.textContent = `${cardsOwned} / ${config.max_cards}`;
      } else {
        // If we cannot compute the total owned on token route without collection call, show placeholder
        cardEl.textContent = `— / ${config.max_cards}`;
      }
    }
    if (coinEl) coinEl.textContent = coins;
  } catch (err) {
    console.error('❌ Failed to load user stats:', err);
    setUnavailable();
  }
}

// Init on page load
window.addEventListener('DOMContentLoaded', () => {
  detectAndStoreDiscordId();
  loadPlayerStats();
});
