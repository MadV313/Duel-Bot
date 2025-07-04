// utils/tradeQueue.js

import fs from 'fs';
import path from 'path';

const tradeFile = path.resolve('./data/trade_queue.json');

/**
 * Load the current trade queue from file.
 * @returns {Array} queue - List of trades
 */
export function loadQueue() {
  try {
    if (fs.existsSync(tradeFile)) {
      const rawData = fs.readFileSync(tradeFile, 'utf8');
      return JSON.parse(rawData);
    }
  } catch (err) {
    console.error('❌ Error loading trade queue:', err);
  }
  return [];
}

/**
 * Save the trade queue to disk.
 * @param {Array} queue - The array of trades to store
 */
export function saveQueue(queue) {
  try {
    if (!Array.isArray(queue)) {
      throw new Error('Queue must be an array.');
    }
    fs.writeFileSync(tradeFile, JSON.stringify(queue, null, 2));
    console.log('✅ Trade queue saved successfully.');
  } catch (err) {
    console.error('❌ Error saving trade queue:', err);
  }
}

/**
 * Add a trade to the queue.
 * @param {Object} trade - Trade object containing at least an `id`
 */
export function enqueueTrade(trade) {
  if (!trade || !trade.id) {
    console.error('❌ Invalid trade object: must contain an id.');
    return;
  }

  const queue = loadQueue();
  queue.push(trade);
  saveQueue(queue);
  console.log(`✅ Trade with ID ${trade.id} added to the queue.`);
}

/**
 * Remove a trade from the queue by ID.
 * @param {string} tradeId - ID of the trade to remove
 */
export function removeTradeById(tradeId) {
  if (!tradeId) {
    console.error('❌ Trade ID is required to remove a trade.');
    return;
  }

  let queue = loadQueue();
  queue = queue.filter(t => t.id !== tradeId);
  saveQueue(queue);
  console.log(`✅ Trade with ID ${tradeId} removed from the queue.`);
}

/**
 * Retrieve a trade from the queue by ID.
 * @param {string} tradeId - Trade ID to look up
 * @returns {Object|null} - Found trade or null
 */
export function getTradeById(tradeId) {
  if (!tradeId) {
    console.error('❌ Trade ID is required to find a trade.');
    return null;
  }

  const queue = loadQueue();
  return queue.find(t => t.id === tradeId) || null;
}

/**
 * Retrieve a trade for a specific user ID (used in accept.js).
 * @param {string} userId - User ID to search
 * @returns {Object|null} - First trade involving this user
 */
export function getTradeOffer(userId) {
  const queue = loadQueue();
  return queue.find(t => t.from === userId || t.to === userId) || null;
}

/**
 * Remove a trade for a specific user ID (used in deny.js or on success).
 * @param {string} userId - User ID to remove trade for
 */
export function removeTradeOffer(userId) {
  let queue = loadQueue();
  queue = queue.filter(t => t.from !== userId && t.to !== userId);
  saveQueue(queue);
  console.log(`✅ Trade offer involving user ${userId} removed.`);
}
