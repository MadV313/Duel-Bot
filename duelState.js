// logic/duelState.js

import path from 'path';
import {
  loadJSON,
  saveJSON,
  PATHS
} from '../utils/storageClient.js';
import { writeDuelSummary } from '../utils/summaryWriter.js';

// Global Duel State Object (in-memory runtime state)
export const duelState = {
  players: {},
  currentPlayer: null,
  winner: null,
  spectators: [],
  turnCount: 0,
  duelMode: 'none',
  startedAt: null,
  duelId: null, // set for live duels
};

/* -------------------------------- Utilities -------------------------------- */

function log(...a)  { console.log('[DUEL]', ...a); }
function err(...a)  { console.error('[DUEL]', ...a); }
const nowISO = () => new Date().toISOString();

function randSampleFromList(list, count) {
  const out = [];
  while (out.length < count && list.length > 0) {
    const pick = list[Math.floor(Math.random() * list.length)];
    out.push(pick);
  }
  return out;
}

/* --------------------------- PRACTICE DUEL LAUNCHER -------------------------- */
export function startPracticeDuel() {
  // Initialize minimal practice state immediately
  duelState.players = {
    player1: { hp: 200, hand: [], field: [], deck: [], discardPile: [] },
    bot:     { hp: 200, hand: [], field: [], deck: [], discardPile: [] }
  };
  duelState.currentPlayer = 'player1';
  duelState.winner = null;
  duelState.spectators = [];
  duelState.turnCount = 1;
  duelState.duelMode = 'practice';
  duelState.startedAt = new Date();
  duelState.duelId = null;

  // Load cards lazily (no blocking of the HTTP response)
  // NOTE: duelState.js lives in /logic, so reference is "./CoreMasterReference.json"
  import('./CoreMasterReference.json', { assert: { type: 'json' } })
    .then(module => {
      const allCards = module.default || [];
      const filtered = allCards.filter(c => c?.card_id && c.card_id !== '000');

      const toDeckObjs = (arr) =>
        arr.map(c => ({ cardId: String(c.card_id).padStart(3, '0'), isFaceDown: false }));

      const p1 = toDeckObjs(randSampleFromList(filtered, 20));
      const bot = toDeckObjs(randSampleFromList(filtered, 20));

      duelState.players.player1.deck = p1;
      duelState.players.bot.deck = bot;

      log('practice.init: decks loaded', {
        t: nowISO(),
        p1: p1.length,
        bot: bot.length
      });
    })
    .catch(e => err('practice.init: failed to load cards', e?.message || e));
}

/* ------------------------------ LIVE PVP STARTER ----------------------------- */
export async function startLiveDuel(player1Id, player2Id, player1Deck, player2Deck, wager = 0) {
  try {
    // If a duel was running, archive spectators into persistent logs first
    if (duelState.players?.player1 || duelState.players?.player2) {
      await archiveSpectators();
    }

    // Seed state
    duelState.players = {
      player1: {
        discordId: player1Id,
        hp: 200,
        hand: [],
        field: [],
        deck: Array.isArray(player1Deck) ? [...player1Deck] : [],
        discardPile: [],
        discordName: null, // can be filled by upstream caller
      },
      player2: {
        discordId: player2Id,
        hp: 200,
        hand: [],
        field: [],
        deck: Array.isArray(player2Deck) ? [...player2Deck] : [],
        discardPile: [],
        discordName: null,
      }
    };
    duelState.currentPlayer = 'player1';
    duelState.winner = null;
    duelState.spectators = [];
    duelState.turnCount = 1;
    duelState.duelMode = 'pvp';
    duelState.startedAt = new Date();
    duelState.duelId = `${Date.now()}-${Math.random().toString(16).slice(2)}`; // lightweight id until summary is written

    // Persist a rolling duelStats ledger (non-blocking best-effort)
    try {
      const stats = await loadJSON(PATHS.duelStats).catch(() => ({}));
      stats.lastLive = {
        duelId: duelState.duelId,
        startedAt: duelState.startedAt?.toISOString?.() || nowISO(),
        players: { p1: player1Id, p2: player2Id },
        wager,
        mode: 'pvp'
      };
      await saveJSON(PATHS.duelStats, stats);
      log('[STATS] duelStats updated for live start');
    } catch (e) {
      err('[STATS] failed to write duelStats on start', e?.message || e);
    }

    log('live.init', {
      t: nowISO(),
      p1: player1Id,
      p2: player2Id,
      wager
    });
  } catch (e) {
    err('live.init failed', e?.message || e);
    throw e;
  }
}

/* ---------------------------------- CLEANUP ---------------------------------- */
export async function endLiveDuel(winnerId) {
  const endedAt = new Date();
  const durationSeconds = duelState.startedAt
    ? Math.floor((endedAt - new Date(duelState.startedAt)) / 1000)
    : null;

  const p1 = duelState.players?.player1?.discordId || null;
  const p2 = duelState.players?.player2?.discordId || null;

  // Build a minimal payload for quick logs/metrics
  const quickSummary = {
    duelId: duelState.duelId || null,
    winner: winnerId,
    timestamp: endedAt.toISOString(),
    duration: durationSeconds ?? null,
    player1: p1,
    player2: p2
  };

  // Write a full, tokenized summary via summaryWriter (persistent storage)
  try {
    const finalId = await writeDuelSummary(
      {
        players: {
          player1: {
            discordId: p1,
            discordName: duelState.players?.player1?.discordName || 'Player 1',
            hp: duelState.players?.player1?.hp ?? 0,
            cardsPlayed: duelState.players?.player1?.cardsPlayed ?? 0,
            damageDealt: duelState.players?.player1?.damageDealt ?? 0,
          },
          player2: {
            discordId: p2,
            discordName: duelState.players?.player2?.discordName || 'Player 2',
            hp: duelState.players?.player2?.hp ?? 0,
            cardsPlayed: duelState.players?.player2?.cardsPlayed ?? 0,
            damageDealt: duelState.players?.player2?.damageDealt ?? 0,
          }
        },
        wagerAmount: duelState.wagerAmount || 0
      },
      winnerId
    );

    // Backfill duelId if summary writer minted a canonical one
    if (finalId) quickSummary.duelId = finalId;

    // Also append to duelStats.json for quick historical lookups
    try {
      const stats = await loadJSON(PATHS.duelStats).catch(() => ({}));
      const list = Array.isArray(stats.completed) ? stats.completed : [];
      list.push({
        duelId: quickSummary.duelId,
        winner: quickSummary.winner,
        player1: p1,
        player2: p2,
        duration: quickSummary.duration,
        endedAt: quickSummary.timestamp
      });
      stats.completed = list.slice(-2000); // clamp to last N results to keep file sane
      await saveJSON(PATHS.duelStats, stats);
      log('[STATS] duelStats appended with completed duel');
    } catch (e) {
      err('[STATS] failed to append completed duel', e?.message || e);
    }

    log('live.end summary saved', quickSummary);
  } catch (e) {
    err('live.end: failed to write summary', e?.message || e);
  }

  // Finally reset in-memory duel state
  duelState.players = {};
  duelState.currentPlayer = null;
  duelState.winner = winnerId || null;
  duelState.spectators = [];
  duelState.turnCount = 0;
  duelState.duelMode = 'none';
  duelState.startedAt = null;
  duelState.duelId = null;
}

/* ---------------------------- SPECTATOR ARCHIVING ---------------------------- */
// Persist spectator sessions into a rolling JSON array at storage root.
//
// Structure:
// spectator_logs.json = [
//   { timestamp, spectators: [<ids>], mode: "pvp|practice", duelId }
//   ...
// ]
async function archiveSpectators() {
  try {
    if (!Array.isArray(duelState.spectators) || duelState.spectators.length === 0) return;

    const entry = {
      timestamp: nowISO(),
      mode: duelState.duelMode || 'unknown',
      duelId: duelState.duelId || null,
      spectators: duelState.spectators.slice(0, 500)
    };

    let logs;
    try {
      logs = await loadJSON('spectator_logs.json');
      if (!Array.isArray(logs)) logs = [];
    } catch {
      logs = [];
    }

    logs.push(entry);
    // Keep last N entries to avoid uncontrolled growth
    const pruned = logs.slice(-1000);

    await saveJSON('spectator_logs.json', pruned);
    log('spectators.archived', { count: entry.spectators.length, mode: entry.mode });
  } catch (e) {
    err('spectators.archive failed', e?.message || e);
  }
}

/* --------------------------------- Helpers ---------------------------------- */
/**
 * Increment the internal turn counter (optionally persist a heartbeat to duelStats)
 */
export async function incrementTurn() {
  duelState.turnCount = (duelState.turnCount || 0) + 1;

  // Non-blocking heartbeat write
  try {
    const stats = await loadJSON(PATHS.duelStats).catch(() => ({}));
    stats.lastHeartbeat = {
      t: nowISO(),
      duelId: duelState.duelId || null,
      mode: duelState.duelMode,
      turn: duelState.turnCount,
      currentPlayer: duelState.currentPlayer
    };
    await saveJSON(PATHS.duelStats, stats);
  } catch (e) {
    // soft-fail; no spam
  }

  log('turn.increment', { turn: duelState.turnCount, current: duelState.currentPlayer });
}

/**
 * Set the current player ("player1" | "player2" | "bot") and persist a small heartbeat
 */
export async function setCurrentPlayer(next) {
  duelState.currentPlayer = next;
  try {
    const stats = await loadJSON(PATHS.duelStats).catch(() => ({}));
    stats.lastPlayerSwap = { t: nowISO(), currentPlayer: next, duelId: duelState.duelId || null };
    await saveJSON(PATHS.duelStats, stats);
  } catch {}
  log('turn.player', { current: next });
}
