// duelState.js

import fs from 'fs/promises';
import path from 'path';

// Global Duel State Object
export const duelState = {
  players: {},
  currentPlayer: null,
  winner: null,
  spectators: [],
  turnCount: 0,
  duelMode: 'none',
  startedAt: null
};

// 🧪 PRACTICE DUEL LAUNCHER
export function startPracticeDuel() {
  duelState.players = {
    player1: { hp: 200, hand: [], field: [], deck: [], discardPile: [] },
    bot: { hp: 200, hand: [], field: [], deck: [], discardPile: [] }
  };
  duelState.currentPlayer = 'player1';
  duelState.winner = null;
  duelState.spectators = [];
  duelState.turnCount = 1;
  duelState.duelMode = 'practice';
  duelState.startedAt = new Date();

  import('./logic/CoreMasterReference.json', { assert: { type: 'json' } })
    .then(module => {
      const allCards = module.default;

      const randomCards = (count) => {
        const sample = [];
        while (sample.length < count) {
          const pick = allCards[Math.floor(Math.random() * allCards.length)];
          if (pick.card_id !== '000') {
            sample.push({ cardId: pick.card_id, isFaceDown: false });
          }
        }
        return sample;
      };

      duelState.players.player1.deck = randomCards(20);
      duelState.players.bot.deck = randomCards(20);
    })
    .catch(err => console.error('Failed to load practice decks:', err));
}

// ⚔️ LIVE PVP DUEL LAUNCHER
export async function startLiveDuel(player1Id, player2Id, player1Deck, player2Deck) {
  if (duelState.players?.player1 || duelState.players?.player2) {
    await archiveSpectators();
  }

  duelState.players = {
    player1: {
      discordId: player1Id,
      hp: 200,
      hand: [],
      field: [],
      deck: [...player1Deck],
      discardPile: []
    },
    player2: {
      discordId: player2Id,
      hp: 200,
      hand: [],
      field: [],
      deck: [...player2Deck],
      discardPile: []
    }
  };
  duelState.currentPlayer = 'player1';
  duelState.winner = null;
  duelState.spectators = [];
  duelState.turnCount = 1;
  duelState.duelMode = 'pvp';
  duelState.startedAt = new Date();
}

// 🧹 END DUEL CLEANUP
export async function endLiveDuel(winnerId) {
  const endedAt = new Date();
  const durationSeconds = duelState.startedAt
    ? Math.floor((endedAt - new Date(duelState.startedAt)) / 1000)
    : null;

  const summary = {
    winner: winnerId,
    timestamp: endedAt.toISOString(),
    duration: durationSeconds ? `${durationSeconds}s` : 'unknown',
    player1: duelState.players?.player1?.discordId || null,
    player2: duelState.players?.player2?.discordId || null
  };

  try {
    const summaryPath = path.join(process.cwd(), 'public', 'data', 'duel_summary.json');
    await fs.mkdir(path.dirname(summaryPath), { recursive: true });
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
    console.log('📝 Duel summary saved.');
  } catch (err) {
    console.error('❌ Failed to write duel summary:', err);
  }

  // Reset duelState
  duelState.players = {};
  duelState.currentPlayer = null;
  duelState.winner = winnerId;
  duelState.spectators = [];
  duelState.turnCount = 0;
  duelState.duelMode = 'none';
  duelState.startedAt = null;
}

// 📦 ARCHIVE PREVIOUS SPECTATORS
async function archiveSpectators() {
  if (!duelState.spectators || duelState.spectators.length === 0) return;

  try {
    const timestamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15);
    const filename = `spectators_${timestamp}.json`;
    const logDir = path.join(process.cwd(), 'data', 'spectator_logs');

    await fs.mkdir(logDir, { recursive: true });
    const fullPath = path.join(logDir, filename);

    await fs.writeFile(fullPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      spectators: duelState.spectators
    }, null, 2));

    console.log(`📁 Archived spectator log: ${filename}`);
  } catch (err) {
    console.error('❌ Error archiving spectators:', err);
  }
}
