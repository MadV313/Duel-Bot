import { SlashCommandBuilder } from 'discord.js';
import { getTradeOffer, removeTradeOffer } from '../utils/tradeQueue.js';
import { updatePlayerDeck } from '../utils/deckUtils.js';
import fs from 'fs';
import fetch from 'node-fetch';
import config from '../config.json';

export const data = new SlashCommandBuilder()
  .setName('accept')
  .setDescription('Accept a pending trade request or duel challenge.');

export async function execute(interaction) {
  // Handle duel button interaction
  if (interaction.isButton() && interaction.customId.startsWith('accept_')) {
    const challengerId = interaction.customId.split('_')[1];
    const opponentId = interaction.user.id;

    try {
      const response = await fetch(`${config.ui_urls.duel_ui}/duel/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player1Id: challengerId,
          player2Id: opponentId
        })
      });

      const result = await response.json();

      if (!response.ok) {
        console.error('Duel start failed:', result);
        return interaction.reply({ content: `Failed to start duel: ${result.error}`, ephemeral: true });
      }

      const duelUrl = `${config.ui_urls.duel_ui}/duel.html?player=${opponentId}`;
      return interaction.update({
        content: `✅ <@${opponentId}> has accepted the duel!\n[Click here to join the battle](${duelUrl})`,
        components: []
      });

    } catch (err) {
      console.error('Error starting duel:', err);
      return interaction.reply({ content: 'An error occurred starting the duel.', ephemeral: true });
    }
  }

  // Fallback: trade logic
  const userId = interaction.user.id;
  const trade = getTradeOffer(userId);

  if (!trade) {
    return interaction.reply({ content: 'You have no pending trade offers.', ephemeral: true });
  }

  const playerDecks = JSON.parse(fs.readFileSync('./data/linked_decks.json'));

  const senderDeck = playerDecks[trade.senderId]?.deck || [];
  const receiverDeck = playerDecks[userId]?.deck || [];

  for (const card of trade.cardsFromSender) {
    if (!senderDeck.includes(card)) {
      return interaction.reply({ content: 'Trade failed: sender no longer owns the offered cards.', ephemeral: true });
    }
  }

  for (const card of trade.cardsFromReceiver) {
    if (!receiverDeck.includes(card)) {
      return interaction.reply({ content: 'Trade failed: you no longer own the requested cards.', ephemeral: true });
    }
  }

  trade.cardsFromSender.forEach(card => {
    senderDeck.splice(senderDeck.indexOf(card), 1);
    receiverDeck.push(card);
  });

  trade.cardsFromReceiver.forEach(card => {
    receiverDeck.splice(receiverDeck.indexOf(card), 1);
    senderDeck.push(card);
  });

  updatePlayerDeck(trade.senderId, senderDeck);
  updatePlayerDeck(userId, receiverDeck);
  removeTradeOffer(userId);

  return interaction.reply({
    content: `Trade accepted! Cards exchanged successfully between <@${userId}> and <@${trade.senderId}>.`,
  });
}
