// logic/botHandler.js

/**
 * Executes the bot's move during a duel.
 * Plays a card if the field has room, otherwise discards.
 * 
 * @param {object} duelState - The current duel state object
 * @returns {object} - Updated duelState
 */
export async function applyBotMove(duelState) {
  const bot = duelState.players?.bot;

  // Safety checks
  if (
    !bot ||
    !Array.isArray(bot.hand) ||
    !Array.isArray(bot.field) ||
    !Array.isArray(bot.discardPile)
  ) {
    console.error('[Bot] ❌ Invalid bot state:', JSON.stringify(bot, null, 2));
    throw new Error('Bot state is invalid or incomplete.');
  }

  console.log(`🤖 [Bot Turn] HP: ${bot.hp} | Hand: ${bot.hand.length} | Field: ${bot.field.length}`);

  if (bot.hand.length > 0 && bot.field.length < 4) {
    const playedCard = bot.hand.shift();
    bot.field.push(playedCard);
    console.log(`[Bot] ➕ Played card: ${playedCard.cardId || '[Unknown Card]'}`);
  } else if (bot.hand.length > 0) {
    const discardedCard = bot.hand.shift();
    bot.discardPile.push(discardedCard);
    console.log(`[Bot] 🗑️ Discarded card: ${discardedCard.cardId || '[Unknown Card]'}`);
  } else {
    console.log('[Bot] 🚫 No cards to play or discard.');
  }

  // End turn: pass back to player
  duelState.currentPlayer = 'player1';
  return duelState;
}
