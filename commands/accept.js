// commands/accept.js

import { SlashCommandBuilder } from 'discord.js';
import { getTradeOffer, removeTradeOffer } from '../utils/tradeQueue.js';
import { updatePlayerDeck } from '../utils/deckUtils.js';
import fs from 'fs';

export const data = new SlashCommandBuilder()
  .setName('accept')
  .setDescription('Accept a pending trade request.');

export async function execute(interaction) {
  const userId = interaction.user.id;
  const trade = getTradeOffer(userId);

  if (!trade) {
    return interaction.reply({ content: 'You have no pending trade offers.', ephemeral: true });
  }

  const playerDecks = JSON.parse(fs.readFileSync('./data/linked_decks.json'));

  const senderDeck = playerDecks[trade.senderId]?.deck || [];
  const receiverDeck = playerDecks[userId]?.deck || [];

  // Validate sender still owns the cards
  for (const card of trade.cardsFromSender) {
    const index = senderDeck.indexOf(card);
    if (index === -1) {
      return interaction.reply({ content: 'Trade failed: sender no longer owns the offered cards.', ephemeral: true });
    }
  }

  // Validate receiver still owns the requested cards
  for (const card of trade.cardsFromReceiver) {
    const index = receiverDeck.indexOf(card);
    if (index === -1) {
      return interaction.reply({ content: 'Trade failed: you no longer own the requested cards.', ephemeral: true });
    }
  }

  // Execute trade
  trade.cardsFromSender.forEach(card => {
    senderDeck.splice(senderDeck.indexOf(card), 1);
    receiverDeck.push(card);
  });

  trade.cardsFromReceiver.forEach(card => {
    receiverDeck.splice(receiverDeck.indexOf(card), 1);
    senderDeck.push(card);
  });

  // Save updated decks
  updatePlayerDeck(trade.senderId, senderDeck);
  updatePlayerDeck(userId, receiverDeck);

  // Remove trade offer
  removeTradeOffer(userId);

  return interaction.reply({
    content: `Trade accepted! Cards exchanged successfully between <@${userId}> and <@${trade.senderId}>.`,
  });
}
