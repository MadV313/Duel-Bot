// routes/duel.js
import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { startPracticeDuel, duelState } from '../logic/duelState.js';
import { applyBotMove } from '../logic/botHandler.js';

const router = express.Router();            // mounted at /duel
export const botAlias = express.Router();   // mounted at /bot

// ────────────────────────────────────────────────────────────
// Resolve CoreMasterReference.json (once) and cache in memory
// ────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const CORE_PATH  = path.resolve(__dirname, '../logic/CoreMasterReference.json');

let cardsCache = null;
async function loadCoreCards() {
  if (cardsCache) return cardsCache;
  const raw = await fs.readFile(CORE_PATH, 'utf-8');
  cardsCache = JSON.parse(raw);
  console.log(`📦 Loaded ${Array.isArray(cardsCache) ? cardsCache.length : 0} cards from CoreMasterReference.`);
  return cardsCache;
}

// ────────────────────────────────────────────────────────────
// Handlers
// ────────────────────────────────────────────────────────────
async function startPracticeHandler(req, res) {
  const traceId = req.headers['x-trace-id'] || randomUUID();
  const t = new Date().toISOString();
  try {
    const cards = await loadCoreCards();
    startPracticeDuel(cards); // sets duelState (200 HP, draw 3, coin flip)

    console.log(`[duel] practice.init ${JSON.stringify({
      t, traceId, ip: req.ip, ua: req.headers['user-agent'],
      mode: duelState.duelMode, currentPlayer: duelState.currentPlayer
    })}`);

    res.json(duelState);
  } catch (err) {
    console.error(`[duel] practice.error ${JSON.stringify({
      t, traceId, error: String(err?.message || err)
    })}`);
    res.status(500).json({
      error: 'Failed to start practice duel',
      details: String(err?.message || err),
      traceId
    });
  }
}

async function botTurnHandler(req, res) {
  const traceId = req.headers['x-trace-id'] || randomUUID();
  const t = new Date().toISOString();
  try {
    console.log(`[duel] bot.turn.request ${JSON.stringify({
      t, traceId, size: Buffer.byteLength(JSON.stringify(req.body || {}))
    })}`);

    const updated = await applyBotMove(req.body);

    console.log(`[duel] bot.turn.ok ${JSON.stringify({
      t, traceId, currentPlayer: updated?.currentPlayer
    })}`);

    res.json(updated);
  } catch (err) {
