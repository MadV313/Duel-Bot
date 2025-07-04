// revealPack.js

document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('cardContainer');
  const countdownEl = document.getElementById('countdown');
  const closeBtn = document.getElementById('closeBtn');
  const toast = document.getElementById('toast');

  try {
    const res = await fetch('/packReveal');
    const cards = await res.json();

    cards.forEach((card, i) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'card-wrapper';

      const cardBack = document.createElement('img');
      cardBack.src = 'images/cards/000_WinterlandDeathDeck_Back.png';
      cardBack.className = 'card back';

      const cardFront = document.createElement('img');
      cardFront.src = `images/cards/${card.filename}`;
      cardFront.className = `card front rarity-${card.rarity.toLowerCase()}`;

      if (card.isNew) {
        const badge = document.createElement('div');
        badge.className = 'new-badge';
        badge.textContent = 'New!';
        wrapper.appendChild(badge);
      }

      wrapper.appendChild(cardBack);
      wrapper.appendChild(cardFront);
      container.appendChild(wrapper);

      setTimeout(() => {
        wrapper.classList.add('flip');
        if (card.isNew) {
          showToast(`New card unlocked: ${card.name}`);
        }
      }, 1000 + i * 1000); // Flip delay per card
    });

    let countdown = 10;
    const interval = setInterval(() => {
      countdownEl.textContent = `Closing in ${countdown--}s`;
      if (countdown < 0) {
        clearInterval(interval);
        window.location.href = '/';
      }
    }, 1000);

    closeBtn.addEventListener('click', () => {
      window.location.href = '/';
    });

  } catch (err) {
    console.error('❌ Pack reveal failed:', err);
    container.innerHTML = '<p style="color:white;text-align:center;">Failed to load pack data.</p>';
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
  }
});
