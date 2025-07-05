// commands/accept.js

import { SlashCommandBuilder } from 'discord.js';
import { getTradeById, removeTradeById } from '../utils/tradeQueue.js';
import { updatePlayerDeck } from '../utils/deckUtils.js';
import { config } from '../utils/config.js';
import fs from 'fs';
import fetch from 'node-fetch';

const coinBankPath = './data/coin_bank.json';

export default {
  data: new SlashCommandBuilder()
    .setName('accept')
    .setDescription('Accept a pending trade request or duel challenge.'),

  async execute(interaction) {
    // ✅ Handle button-based duel acceptance
    if (interaction.isButton() && interaction.customId.startsWith('accept_')) {
      const parts = interaction.customId.split('_');
      const challengerId = parts[1];
      const wager = parseInt(parts[2]) || 0;
      const opponentId = interaction.user.id;

      let coinBank = {};
      try {
        if (fs.existsSync(coinBankPath)) {
          coinBank = JSON.parse(fs.readFileSync(coinBankPath));
        }
      } catch (err) {
        console.error('❌ Failed to read coin bank:', err);
        return interaction.reply({ content: '❌ Could not verify coin balances.', ephemeral: true });
      }

      const challengerCoins = coinBank[challengerId] || 0;
      const opponentCoins = coinBank[opponentId] || 0;

      if (challengerCoins < wager || opponentCoins < wager) {
        return interaction.update({
          content: `❌ One or both players lack the ${wager} coins required for this wager.`,
          components: []
        });
      }

      // Deduct coins
      coinBank[challengerId] -= wager;
      coinBank[opponentId] -= wager;
      fs.writeFileSync(coinBankPath, JSON.stringify(coinBank, null, 2));

      // Start duel via backend
      try {
        const response = await fetch(`${config.backend_urls?.duel_start}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            player1Id: challengerId,
            player2Id: opponentId,
            wager
          })
        });

        const result = await response.json();
        if (!response.ok || result.error) throw new Error(result.error || 'Backend duel start failed.');

        const duelUrl = `${config.ui_urls.duel_ui}/duel.html?player=${opponentId}`;
        return interaction.update({
          content: `✅ <@${opponentId}> accepted the duel! Wager: ${wager} coins each.\n[Click to battle](${duelUrl})`,
          components: []
        });

      } catch (err) {
        console.error('❌ Duel init error:', err);
        return interaction.reply({
          content: '❌ Duel could not be started due to a backend error.',
          ephemeral: true
        });
      }
    }

    // ✅ Handle /accept for trades
    const userId = interaction.user.id;
    const trade = getTradeById(userId);
    if (!trade) {
      return interaction.reply({ content: 'You have no pending trade offers.', ephemeral: true });
    }

    const playerDecks = JSON.parse(fs.readFileSync(config.linked_decks_file));
    const senderDeck = playerDecks[trade.senderId]?.deck || [];
    const receiverDeck = playerDecks[userId]?.deck || [];

    for (const card of trade.cardsFromSender) {
      if (!senderDeck.includes(card)) {
        return interaction.reply({ content: 'Trade failed: sender no longer owns one of the offered cards.', ephemeral: true });
      }
    }

    for (const card of trade.cardsFromReceiver) {
      if (!receiverDeck.includes(card)) {
        return interaction.reply({ content: 'Trade failed: you no longer own one of the requested cards.', ephemeral: true });
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
    removeTradeById(userId);

    return interaction.reply({
      content: `✅ Trade accepted! Cards exchanged between <@${userId}> and <@${trade.senderId}>.`,
    });
  }
};
