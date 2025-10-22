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

  // 🔹 Simple logic: play a card if field has room, otherwise discard.
  if (bot.hand.length > 0 && bot.field.length < 4) {
    // Play the first card in hand (and remove from deck entirely)
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
    // Try drawing if empty
    if (bot.deck.length > 0) {
      const drawnCard = bot.deck.shift(); // ✅ always remove from deck
      bot.hand.push(drawnCard);
      console.log(`[Bot] 🃏 Drew card: ${drawnCard.cardId}`);
      duelState.lastBotAction = `Drew ${drawnCard.cardId}`;
    } else {
      console.log('[Bot] 🚫 No cards to play, discard, or draw.');
      duelState.lastBotAction = 'Idle (no cards)';
    }
  }

  // 🔹 Cleanup resolved cards (keeps the field tidy for spectators)
  const stillActive = [];
  const toDiscard = [];

  for (const c of bot.field) {
    if (c?.toDiscard || c?.resolved) {
      toDiscard.push(c);
    } else {
      stillActive.push(c);
    }
  }

  if (toDiscard.length > 0) {
    console.log(`[Bot] 🧹 Cleaning ${toDiscard.length} resolved cards.`);
    bot.discardPile.push(...toDiscard);
  }

  bot.field = stillActive;

  // 🔹 De-duplicate deck and hand (avoid repeat cards)
  const dedupeById = arr => {
    const seen = new Set();
    return arr.filter(c => {
      if (!c || !c.cardId) return false;
      if (seen.has(c.cardId)) return false;
      seen.add(c.cardId);
      return true;
    });
  };

  bot.deck = dedupeById(bot.deck);
  bot.hand = dedupeById(bot.hand);
  bot.field = dedupeById(bot.field);
  bot.discardPile = dedupeById(bot.discardPile);

  // 🔹 Mark timestamp for logs or spectator freshness display
  duelState.lastBotActionAt = new Date().toISOString();

  // 🔹 End turn: pass back to player
  duelState.currentPlayer = 'player1';

  console.log(
    `[Bot] ✅ Turn complete. Hand=${bot.hand.length}, Field=${bot.field.length}, Discard=${bot.discardPile.length}, Deck=${bot.deck.length}`
  );

  return duelState;
}
