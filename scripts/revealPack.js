// scripts/revealPack.js

import { config } from './config.js';

document.addEventListener('DOMContentLoaded', async () => {
  const container   = document.getElementById('cardContainer');
  const countdownEl = document.getElementById('countdown');
  const closeBtn    = document.getElementById('closeBtn');
  const toastEl     = document.getElementById('toast');

  const API_BASE = String(config.backend_url || '').replace(/\/+$/, '');
  const params   = new URLSearchParams(window.location.search);
  const token    = params.get('token');
  const uid      = params.get('uid');
  const ts       = Date.now();

  // Choose endpoint:
  //  - Prefer token/uid-aware reveal payload from backend (/packReveal/reveal)
  //  - Fallback to random developer reveal (/revealPack?count=3)
  const revealUrl = token
    ? `${API_BASE}/packReveal/reveal?token=${encodeURIComponent(token)}&ts=${ts}`
    : uid
    ? `${API_BASE}/packReveal/reveal?uid=${encodeURIComponent(uid)}&ts=${ts}`
    : `${API_BASE}/revealPack?count=3&ts=${ts}`;

  try {
    const res = await fetch(revealUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const cards = await res.json();

    if (!Array.isArray(cards) || cards.length === 0) {
      throw new Error('Empty reveal payload.');
    }

    cards.forEach((card, i) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'card-wrapper';

      const cardBack = document.createElement('img');
      cardBack.src = 'images/cards/000_WinterlandDeathDeck_Back.png'; // keep existing back asset
      cardBack.className = 'card back';

      // Decide front image:
      // - If card.image is an absolute URL, use it
      // - Else prefer sanitized filename (if provided) under images/cards/
      // - Else fallback to image name under images/cards/
      const frontSrc = (() => {
        const file = card.filename || card.image || '';
        if (/^https?:\/\//i.test(file)) return file;
        return `images/cards/${file}`;
      })();

      const cardFront = document.createElement('img');
      cardFront.src = frontSrc;
      cardFront.className = `card front rarity-${String(card.rarity || 'Common').toLowerCase()}`;

      if (card.isNew) {
        const badge = document.createElement('div');
        badge.className = 'new-badge';
        badge.textContent = 'New!';
        wrapper.appendChild(badge);
      }

      wrapper.appendChild(cardBack);
      wrapper.appendChild(cardFront);
      if (container) container.appendChild(wrapper);

      // Staggered flip per card
      setTimeout(() => {
        wrapper.classList.add('flip');
        if (card.isNew) {
          showToast(`New card unlocked: ${card.name}`);
        }
      }, 1000 + i * 1000);
    });

    // countdown → redirect to hub root (keep existing behavior)
    let countdown = 10;
    const updateCountdown = () => {
      if (countdownEl) countdownEl.textContent = `Closing in ${countdown--}s`;
      if (countdown < 0) {
        clearInterval(timer);
        window.location.href = '/';
      }
    };
    const timer = setInterval(updateCountdown, 1000);
    updateCountdown();

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        window.location.href = '/';
      });
    }
  } catch (err) {
    console.error('❌ Pack reveal failed:', err);
    if (container) {
      container.innerHTML = '<p style="color:white;text-align:center;">Failed to load pack data.</p>';
    }
  }

  function showToast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), 2500);
  }
});
