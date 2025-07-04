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
    boxShadow: '0 0 10px rgba(0,0,0,0.5)',
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
  };

  clipboardCheck();
  urlCheck();
}

/**
 * Loads and renders the current user's card and coin stats into the Hub UI.
 */
async function loadPlayerStats() {
  const userId = localStorage.getItem('discord_id');

  if (!userId) {
    document.getElementById('cardCount').textContent = 'Link deck to begin';
    document.getElementById('coinCount').textContent = '-';
    return;
  }

  try {
    const res = await fetch(`${config.backend_url}/user/${userId}`);
    if (!res.ok) throw new Error('Player not found');

    const data = await res.json();
    document.getElementById('cardCount').textContent = `${data.cardsOwned} / ${config.max_cards}`;
    document.getElementById('coinCount').textContent = data.coins;
  } catch (err) {
    console.error('❌ Failed to load user stats:', err);
    document.getElementById('cardCount').textContent = 'Unavailable';
    document.getElementById('coinCount').textContent = '-';
  }
}

// Init on page load
window.addEventListener('DOMContentLoaded', () => {
  detectAndStoreDiscordId();
  loadPlayerStats();
});
