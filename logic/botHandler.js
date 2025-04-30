export async function applyBotMove(duelState) {
  const bot = duelState.players.bot;

  // Basic placeholder: if bot has a card, play it to the field
  if (bot.hand.length > 0 && bot.field.length < 4) {
    const playedCard = bot.hand.shift();
    bot.field.push(playedCard);
    console.log("Bot played a card.");
  }

  // Then end the bot’s turn
  duelState.currentPlayer = 'player1';
  return duelState;
}
