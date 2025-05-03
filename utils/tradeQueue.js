import fs from 'fs';
import path from 'path';

const filePath = path.resolve('./data/trade_queue.json');

function loadQueue() {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath);
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Failed to load trade queue:', err);
  }
  return {};
}

function saveQueue(queue) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(queue, null, 2));
  } catch (err) {
    console.error('Failed to save trade queue:', err);
  }
}

export function addTrade(tradeId, data) {
  const queue = loadQueue();
  queue[tradeId] = data;
  saveQueue(queue);
}

export function getTrade(tradeId) {
  const queue = loadQueue();
  return queue[tradeId];
}

export function removeTrade(tradeId) {
  const queue = loadQueue();
  delete queue[tradeId];
  saveQueue(queue);
}

export function getAllTrades() {
  return loadQueue();
}
