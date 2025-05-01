// Automatically extract and store DISCORD_ID if found in clipboard or query
function detectAndStoreDiscordId() {
  const clipboardCheck = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const match = text.match(/DISCORD_ID:(\d{17,})/);
      if (match) {
        localStorage.setItem('discord_id', match[1]);
        console.log(`Stored Discord ID: ${match[1]}`);
      }
    } catch (err) {
      console.warn('Clipboard read failed or not allowed.');
    }
  };

  const urlCheck = () => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('discord_id')) {
      const id = params.get('discord_id');
      localStorage.setItem('discord_id', id);
      console.log(`Stored Discord ID from URL: ${id}`);
    }
  };

  clipboardCheck();
  urlCheck();
}

// Fetches card + coin totals for the current user
async function loadPlayerStats() {
  const userId = localStorage.getItem('discord_id');

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

window.addEventListener('DOMContentLoaded', () => {
  detectAndStoreDiscordId();
  loadPlayerStats();
});
