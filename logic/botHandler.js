// logic/botHandler.js

export async function applyBotMove(duelState) {
  const bot = duelState.players.bot;

  // Safety checks
  if (!bot || !bot.hand || !bot.field) {
    console.error("Invalid bot state:", bot);
    throw new Error("Bot state is invalid or incomplete.");
  }

  // Simple AI logic: play first card in hand if field has room
  if (bot.hand.length > 0 && bot.field.length < 4) {
    const playedCard = bot.hand.shift();
    bot.field.push(playedCard);
    console.log("Bot played a card.");
  } else {
    console.log("Bot could not play a card (hand empty or field full).");
  }

  // End bot's turn
  duelState.currentPlayer = 'player1';
  return duelState;
}
