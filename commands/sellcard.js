// commands/sellcard.js

import fs from 'fs';
import path from 'path';
import { SlashCommandBuilder } from 'discord.js';
import { getCardRarity } from '../utils/cardRarity.js';
import { isAllowedChannel } from '../utils/checkChannel.js';
import config from '../config.json';

const decksPath = path.resolve('./data/linked_decks.json');
const coinBankPath = path.resolve('./data/coin_bank.json');
const sellLogPath = path.resolve('./data/sell_log.json');

export default {
  data: new SlashCommandBuilder()
    .setName('sellcard')
    .setDescription('Sell up to 5 cards per day for coins.')
    .addStringOption(option =>
      option.setName('cardid')
        .setDescription('Card ID to sell (e.g. 045)')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('quantity')
        .setDescription('How many of this card to sell (max 5/day total)')
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!isAllowedChannel(interaction.channelId, ['manageCards'])) {
      return interaction.reply({
        content: 'This command can only be used in #manage-cards.',
        ephemeral: true
      });
    }

    const userId = interaction.user.id;
    const cardId = interaction.options.getString('cardid');
    const quantity = interaction.options.getInteger('quantity');

    if (quantity < 1 || quantity > 5) {
      return interaction.reply({
        content: 'You must sell between 1 and 5 cards per day.',
        ephemeral: true
      });
    }

    let decks = {}, coinBank = {}, sellLog = {};
    try {
      if (fs.existsSync(decksPath)) decks = JSON.parse(fs.readFileSync(decksPath));
      if (fs.existsSync(coinBankPath)) coinBank = JSON.parse(fs.readFileSync(coinBankPath));
      if (fs.existsSync(sellLogPath)) sellLog = JSON.parse(fs.readFileSync(sellLogPath));
    } catch (err) {
      console.error("Failed to load player data:", err);
      return interaction.reply({ content: 'Internal error occurred while loading files.', ephemeral: true });
    }

    const today = new Date().toISOString().slice(0, 10);
    const soldToday = (sellLog[userId]?.[today] || 0);
    const remaining = config.coin_system.sell_limit_per_day - soldToday;

    if (quantity > remaining) {
      return interaction.reply({
        content: `You can only sell ${remaining} more card(s) today.`,
        ephemeral: true
      });
    }

    const playerDeck = decks[userId]?.deck || [];
    const ownedCount = playerDeck.filter(c => c === cardId).length;

    if (ownedCount < quantity) {
      return interaction.reply({
        content: `You only own ${ownedCount} of card #${cardId}.`,
        ephemeral: true
      });
    }

    const rarity = getCardRarity(cardId).toLowerCase();
    const valuePerCard = config.coin_system.card_sell_values[rarity] || 0.5;
    const payout = quantity * valuePerCard;

    // Remove cards
    let removed = 0;
    decks[userId].deck = playerDeck.filter(c => {
      if (c === cardId && removed < quantity) {
        removed++;
        return false;
      }
      return true;
    });

    // Update logs + coin bank
    if (!sellLog[userId]) sellLog[userId] = {};
    sellLog[userId][today] = soldToday + quantity;
    coinBank[userId] = (coinBank[userId] || 0) + payout;

    try {
      fs.writeFileSync(decksPath, JSON.stringify(decks, null, 2));
      fs.writeFileSync(coinBankPath, JSON.stringify(coinBank, null, 2));
      fs.writeFileSync(sellLogPath, JSON.stringify(sellLog, null, 2));
    } catch (err) {
      console.error("Sell save error:", err);
      return interaction.reply({ content: 'Failed to finalize sale.', ephemeral: true });
    }

    return interaction.reply({
      content: `✅ Sold ${quantity}x #${cardId} (${rarity}) for **${payout} coin(s)**.`,
      ephemeral: true
    });
  }
};
