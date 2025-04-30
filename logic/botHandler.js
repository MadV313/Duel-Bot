// logic/botHandler.js

export async function applyBotMove(duelState) {
  const bot = duelState.players.bot;

  // Safety checks
  if (!bot || !bot.hand || !bot.field || !Array.isArray(bot.hand) || !Array.isArray(bot.field)) {
    console.error("Invalid bot state:", bot);
    throw new Error("Bot state is invalid or incomplete.");
  }

  // Log current bot status
  console.log(`Bot Turn — HP: ${bot.hp}, Hand: ${bot.hand.length}, Field: ${bot.field.length}`);

  // Simple AI logic: play first card in hand if field has room
  if (bot.hand.length > 0 && bot.field.length < 4) {
    const playedCard = bot.hand.shift();
    bot.field.push(playedCard);
    console.log("Bot played a card:", playedCard.cardId || "[Unknown]");
  } else if (bot.hand.length > 0) {
    // If field is full, discard a card instead
    const discardedCard = bot.hand.shift();
    bot.discardPile.push(discardedCard);
    console.log("Bot discarded a card:", discardedCard.cardId || "[Unknown]");
  } else {
    console.log("Bot has no cards to play or discard.");
  }

  // End bot's turn
  duelState.currentPlayer = 'player1';

  return duelState;
}
