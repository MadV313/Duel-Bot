// utils/tradeQueue.js

import fs from 'fs';
import path from 'path';

const tradeFile = path.resolve('./data/trade_queue.json');

// Load current queue
export function loadQueue() {
  try {
    if (fs.existsSync(tradeFile)) {
      return JSON.parse(fs.readFileSync(tradeFile, 'utf8'));
    }
  } catch (err) {
    console.error('Error loading trade queue:', err);
  }
  return [];
}

// Save queue to file
export function saveQueue(queue) {
  try {
    fs.writeFileSync(tradeFile, JSON.stringify(queue, null, 2));
  } catch (err) {
    console.error('Error saving trade queue:', err);
  }
}

// Add new trade
export function enqueueTrade(trade) {
  const queue = loadQueue();
  queue.push(trade);
  saveQueue(queue);
}

// Remove a trade by ID
export function removeTradeById(tradeId) {
  let queue = loadQueue();
  queue = queue.filter(t => t.id !== tradeId);
  saveQueue(queue);
}

// Find a trade by ID
export function getTradeById(tradeId) {
  const queue = loadQueue();
  return queue.find(t => t.id === tradeId);
}
