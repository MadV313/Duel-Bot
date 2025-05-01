// Fetches card + coin totals for the current user
async function loadPlayerStats() {
  const userId = localStorage.getItem('discord_id'); // Must be set after login or linking

  if (!userId) {
    document.getElementById('cardCount').textContent = 'Link deck to begin';
    document.getElementById('coinCount').textContent = '-';
    return;
  }

  try {
    const res = await fetch(`https://duel-bot-backend-production.up.railway.app/user/${userId}`);
    if (!res.ok) throw new Error('Player not found');

    const data = await res.json();

    document.getElementById('cardCount').textContent = `${data.cardsOwned} / 127`;
    document.getElementById('coinCount').textContent = data.coins;

  } catch (err) {
    console.error('Failed to load user stats:', err);
    document.getElementById('cardCount').textContent = 'Unavailable';
    document.getElementById('coinCount').textContent = '-';
  }
}

window.addEventListener('DOMContentLoaded', loadPlayerStats);
