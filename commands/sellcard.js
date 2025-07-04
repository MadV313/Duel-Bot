// commands/sellcard.js

import fs from 'fs/promises';
import path from 'path';
import { SlashCommandBuilder } from 'discord.js';
import { getCardRarity } from '../utils/cardRarity.js';
import { isAllowedChannel } from '../utils/checkChannel.js';

const config = JSON.parse(await fs.readFile(new URL("../config.json", import.meta.url)));
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
        content: '⚠️ You must sell between 1 and 5 cards per day.',
        ephemeral: true
      });
    }

    let decks = {}, coinBank = {}, sellLog = {};
    try {
      const [decksRaw, coinRaw, logRaw] = await Promise.all([
        fs.readFile(decksPath, 'utf-8'),
        fs.readFile(coinBankPath, 'utf-8'),
        fs.readFile(sellLogPath, 'utf-8'),
      ]);
      decks = JSON.parse(decksRaw);
      coinBank = JSON.parse(coinRaw);
      sellLog = JSON.parse(logRaw);
    } catch (err) {
      console.error("❌ Failed to load player data:", err);
      return interaction.reply({
        content: '❌ Internal error occurred while reading files.',
        ephemeral: true
      });
    }

    const today = new Date().toISOString().slice(0, 10);

    // 🧹 Clean up stale logs
    for (const uid in sellLog) {
      for (const date in sellLog[uid]) {
        if (date !== today) delete sellLog[uid][date];
      }
      if (Object.keys(sellLog[uid]).length === 0) delete sellLog[uid];
    }

    const soldToday = sellLog[userId]?.[today] || 0;
    const remaining = config.coin_system.sell_limit_per_day - soldToday;

    if (quantity > remaining) {
      return interaction.reply({
        content: `⚠️ You can only sell ${remaining} more card(s) today.`,
        ephemeral: true
      });
    }

    const playerDeck = decks[userId]?.deck || [];
    const ownedCount = playerDeck.filter(c => c === cardId).length;

    if (ownedCount < quantity) {
      return interaction.reply({
        content: `⚠️ You only own ${ownedCount} of card #${cardId}.`,
        ephemeral: true
      });
    }

    const rarity = getCardRarity(cardId).toLowerCase();
    const valuePerCard = config.coin_system.card_sell_values[rarity] ?? 0.5;
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

    // Update logs + coins
    if (!sellLog[userId]) sellLog[userId] = {};
    sellLog[userId][today] = soldToday + quantity;
    coinBank[userId] = (coinBank[userId] || 0) + payout;

    try {
      await Promise.all([
        fs.writeFile(decksPath, JSON.stringify(decks, null, 2)),
        fs.writeFile(coinBankPath, JSON.stringify(coinBank, null, 2)),
        fs.writeFile(sellLogPath, JSON.stringify(sellLog, null, 2)),
      ]);
      return interaction.reply({
        content: `✅ Sold ${quantity}x #${cardId} (${rarity}) for **${payout} coin(s)**.`,
        ephemeral: true
      });
    } catch (err) {
      console.error("❌ Sell save error:", err);
      return interaction.reply({
        content: '❌ Failed to finalize sale.',
        ephemeral: true
      });
    }
  }
};
