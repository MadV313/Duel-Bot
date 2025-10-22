// logic/botHandler.js

/**
 * Executes the bot's move during a duel.
 * Plays a card if the field has room, otherwise discards.
 *
 * @param {object} duelState - The current duel state object
 * @returns {object} - Updated duelState
 */
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

  console.log(
    `🤖 [Bot Turn] HP: ${bot.hp ?? '?'} | Hand: ${bot.hand.length} | Field: ${bot.field.length}`
  );

  if (bot.hand.length > 0 && bot.field.length < 4) {
    // Play the first card in hand
    const playedCard = bot.hand.shift();
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
    console.log('[Bot] 🚫 No cards to play or discard.');
    duelState.lastBotAction = 'Idle (no cards)';
  }

  // Mark timestamp for logs or spectator freshness display
  duelState.lastBotActionAt = new Date().toISOString();

  // End turn: pass back to player
  duelState.currentPlayer = 'player1';
  return duelState;
}
