// logic/botHandler.js

/**
 * Executes the bot's move during a duel.
 * Plays a card if the field has room, otherwise discards.
 *
 * Cleans resolved/trash cards and maintains deck-hand-field integrity
 * so that spectators and players see consistent states.
 *
 * @param {object} duelState - The current duel state object
 * @returns {object} - Updated duelState
 */

import { drawCard } from './duelState.js';

export async function applyBotMove(duelState) {
  if (!duelState || typeof duelState !== 'object') {
    throw new Error('[Bot] duelState missing or invalid.');
  }

  const bot = duelState.players?.bot;

  // Safety checks / normalization
  if (!bot || typeof bot !== 'object') {
    console.error('[Bot] ❌ Missing bot player in duelState.');
    throw new Error('Bot state missing from duel.');
  }

  if (!Array.isArray(bot.hand)) bot.hand = [];
  if (!Array.isArray(bot.field)) bot.field = [];
  if (!Array.isArray(bot.discardPile)) bot.discardPile = [];
  if (!Array.isArray(bot.deck)) bot.deck = [];

  console.log(
    `🤖 [Bot Turn] HP: ${bot.hp ?? '?'} | Hand: ${bot.hand.length} | Field: ${bot.field.length} | Deck: ${bot.deck.length}`
  );

  // If the bot has no cards in hand, try to draw 1 (with recycle)
  if (bot.hand.length === 0) {
    const { exhausted } = drawCard('bot', 1, { allowRecycle: true });
    if (exhausted) {
      console.log('[Bot] 🔻 Deck exhausted after recycle; cannot draw.');
    }
  }

  // 🔹 Simple logic: play a card if field has room, otherwise discard.
  const FIELD_LIMIT = 4;

  if (bot.hand.length > 0 && bot.field.length < FIELD_LIMIT) {
    // Play the first card in hand
    const playedCard = bot.hand.shift();
    playedCard.isFaceDown = false;
    bot.field.push(playedCard);

    console.log(`[Bot] ➕ Played card: ${playedCard.cardId || '[Unknown Card]'}`);
    duelState.lastBotAction = `Played ${playedCard.cardId || 'Unknown'}`;
  } else if (bot.hand.length > 0) {
    // Field full, discard instead
    const discardedCard = bot.hand.shift();
    bot.discardPile.push(discardedCard);

    console.log(`[Bot] 🗑️ Discarded card: ${discardedCard.cardId || '[Unknown Card]'}`);
    duelState.lastBotAction = `Discarded ${discardedCard.cardId || 'Unknown'}`;
  } else {
    console.log('[Bot] 🚫 No cards to play, discard, or draw.');
    duelState.lastBotAction = 'Idle (no cards)';
  }

  // 🔹 Cleanup resolved cards (keeps the field tidy for spectators)
  const stillActive = [];
  let cleaned = 0;

  for (const c of bot.field) {
    if (c?.toDiscard || c?.resolved) {
      // push a shallow copy so future mutations on field don't affect discard
      bot.discardPile.push({ ...c });
      cleaned++;
    } else {
      stillActive.push(c);
    }
  }

  if (cleaned > 0) {
    console.log(`[Bot] 🧹 Cleaning ${cleaned} resolved cards.`);
  }

  bot.field = stillActive;

  // 🔹 Mark timestamp for logs or spectator freshness display
  duelState.lastBotActionAt = new Date().toISOString();

  // 🔹 End turn: pass back to player ALWAYS
  duelState.currentPlayer = 'player1';

  console.log(
    `[Bot] ✅ Turn complete. Hand=${bot.hand.length}, Field=${bot.field.length}, Discard=${bot.discardPile.length}, Deck=${bot.deck.length}`
  );

  return duelState;
}
