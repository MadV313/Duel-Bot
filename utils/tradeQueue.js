import fs from 'fs';
import path from 'path';

const tradeFile = path.resolve('./data/trade_queue.json');

// Load current queue
export function loadQueue() {
  try {
    if (fs.existsSync(tradeFile)) {
      const rawData = fs.readFileSync(tradeFile, 'utf8');
      return JSON.parse(rawData);
    }
  } catch (err) {
    console.error('Error loading trade queue:', err);
  }
  return []; // Return an empty array if no data exists or an error occurs
}

// Save queue to file
export function saveQueue(queue) {
  try {
    // Validate queue to ensure it's an array
    if (!Array.isArray(queue)) {
      throw new Error('Queue must be an array.');
    }

    fs.writeFileSync(tradeFile, JSON.stringify(queue, null, 2));
    console.log('✅ Trade queue saved successfully.');
  } catch (err) {
    console.error('Error saving trade queue:', err);
  }
}

// Add new trade
export function enqueueTrade(trade) {
  if (!trade || !trade.id) {
    console.error('Invalid trade object: must contain an id.');
    return;
  }

  const queue = loadQueue();
  queue.push(trade);
  saveQueue(queue);
  console.log(`✅ Trade with ID ${trade.id} added to the queue.`);
}

// Remove a trade by ID
export function removeTradeById(tradeId) {
  if (!tradeId) {
    console.error('Trade ID is required to remove a trade.');
    return;
  }

  let queue = loadQueue();
  queue = queue.filter(t => t.id !== tradeId);
  saveQueue(queue);
  console.log(`✅ Trade with ID ${tradeId} removed from the queue.`);
}

// Find a trade by ID
export function getTradeById(tradeId) {
  if (!tradeId) {
    console.error('Trade ID is required to find a trade.');
    return null;
  }

  const queue = loadQueue();
  const trade = queue.find(t => t.id === tradeId);
  return trade || null; // Return null if trade not found
}
