function showToast(message) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.position = 'fixed';
  toast.style.bottom = '30px';
  toast.style.left = '50%';
  toast.style.transform = 'translateX(-50%)';
  toast.style.background = '#111';
  toast.style.color = '#fff';
  toast.style.padding = '10px 20px';
  toast.style.borderRadius = '6px';
  toast.style.fontSize = '14px';
  toast.style.zIndex = '9999';
  toast.style.boxShadow = '0 0 10px rgba(0,0,0,0.5)';
  toast.style.opacity = '0';
  toast.style.transition = 'opacity 0.5s ease-in-out';

  document.body.appendChild(toast);
  setTimeout(() => (toast.style.opacity = '1'), 100);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 500);
  }, 3000);
}

function detectAndStoreDiscordId() {
  const clipboardCheck = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const match = text.match(/DISCORD_ID:(\d{17,})/);
      if (match) {
        localStorage.setItem('discord_id', match[1]);
        showToast(`Discord ID stored: ${match[1]}`);
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
      showToast(`Discord ID stored: ${id}`);
    }
  };

  clipboardCheck();
  urlCheck();
}

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
