// utils/tradeQueue.js
//
// Persistent trade queue handler using storageClient instead of local fs.
// Fully backward-compatible with the original API.

import { loadJSON, saveJSON } from './storageClient.js';
import { L } from './logs.js';

const TRADE_FILE = 'trade_queue.json'; // stored remotely via storageClient

/**
 * Load the current trade queue from persistent storage.
 * @returns {Promise<Array>} queue - List of trades
 */
export async function loadQueue() {
  try {
    const queue = await loadJSON(TRADE_FILE);
    if (Array.isArray(queue)) {
      L.trade(`📦 Loaded trade queue with ${queue.length} entries.`);
      return queue;
    }
    L.trade('⚠️ Trade queue format invalid, resetting.');
    return [];
  } catch (err) {
    L.err(`❌ Error loading trade queue: ${err.message}`);
    return [];
  }
}

/**
 * Save the trade queue to persistent storage.
 * @param {Array} queue - The array of trades to store
 */
export async function saveQueue(queue) {
  try {
    if (!Array.isArray(queue)) {
      throw new Error('Queue must be an array.');
    }
    await saveJSON(TRADE_FILE, queue);
    L.trade(`✅ Trade queue saved successfully (${queue.length} entries).`);
  } catch (err) {
    L.err(`❌ Error saving trade queue: ${err.message}`);
  }
}

/**
 * Add a trade to the queue.
 * @param {Object} trade - Trade object containing at least an `id`
 */
export async function enqueueTrade(trade) {
  if (!trade || !trade.id) {
    L.err('❌ Invalid trade object: must contain an id.');
    return;
  }

  const queue = await loadQueue();
  queue.push(trade);
  await saveQueue(queue);
  L.trade(`➕ Trade with ID ${trade.id} added to the queue.`);
}

/**
 * Remove a trade from the queue by ID.
 * @param {string} tradeId - ID of the trade to remove
 */
export async function removeTradeById(tradeId) {
  if (!tradeId) {
    L.err('❌ Trade ID is required to remove a trade.');
    return;
  }

  let queue = await loadQueue();
  const before = queue.length;
  queue = queue.filter(t => t.id !== tradeId);
  await saveQueue(queue);
  L.trade(`🗑️ Removed trade ${tradeId}. (${before - queue.length} entries removed)`);
}

/**
 * Retrieve a trade from the queue by ID.
 * @param {string} tradeId - Trade ID to look up
 * @returns {Promise<Object|null>} - Found trade or null
 */
export async function getTradeById(tradeId) {
  if (!tradeId) {
    L.err('❌ Trade ID is required to find a trade.');
    return null;
  }

  const queue = await loadQueue();
  return queue.find(t => t.id === tradeId) || null;
}

/**
 * Retrieve a trade for a specific user ID (used in accept.js).
 * @param {string} userId - User ID to search
 * @returns {Promise<Object|null>} - First trade involving this user
 */
export async function getTradeOffer(userId) {
  const queue = await loadQueue();
  return queue.find(t => t.from === userId || t.to === userId) || null;
}

/**
 * Remove a trade for a specific user ID (used in deny.js or on success).
 * @param {string} userId - User ID to remove trade for
 */
export async function removeTradeOffer(userId) {
  let queue = await loadQueue();
  const before = queue.length;
  queue = queue.filter(t => t.from !== userId && t.to !== userId);
  await saveQueue(queue);
  L.trade(`🧹 Removed ${before - queue.length} trade(s) involving user ${userId}.`);
}
