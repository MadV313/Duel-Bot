// commands/sellcard.js

import fs from 'fs';
import path from 'path';
import { getCardRarity } from '../utils/cardRarity.js';

const coinBankPath = path.resolve('./data/coin_bank.json');
const decksPath = path.resolve('./data/linked_decks.json');
const sellLogPath = path.resolve('./data/sell_log.json');

export default {
  name: 'sellcard',
  description: 'Sell up to 5 cards per day for coins.',
  options: [
    {
      name: 'cardid',
      type: 3, // STRING
      description: 'Card ID to sell (e.g. 045)',
      required: true,
    },
    {
      name: 'quantity',
      type: 4, // INTEGER
      description: 'How many of this card to sell (max 5/day total)',
      required: true,
    },
  ],

  async execute(interaction) {
    const userId = interaction.user.id;
    const cardId = interaction.options.getString('cardid');
    const quantity = interaction.options.getInteger('quantity');

    if (quantity < 1) {
      return interaction.reply({ content: 'You must sell at least 1 card.', ephemeral: true });
    }

    let decks = {}, coinBank = {}, sellLog = {};
    try {
      if (fs.existsSync(decksPath)) decks = JSON.parse(fs.readFileSync(decksPath));
      if (fs.existsSync(coinBankPath)) coinBank = JSON.parse(fs.readFileSync(coinBankPath));
      if (fs.existsSync(sellLogPath)) sellLog = JSON.parse(fs.readFileSync(sellLogPath));
    } catch (err) {
      console.error("Failed reading data:", err);
      return interaction.reply({ content: 'Internal error reading data.', ephemeral: true });
    }

    const today = new Date().toISOString().slice(0, 10);
    if (!sellLog[userId]) sellLog[userId] = {};
    if (!sellLog[userId][today]) sellLog[userId][today] = 0;

    if (sellLog[userId][today] + quantity > 5) {
      return interaction.reply({ content: 'You can only sell 5 cards per day.', ephemeral: true });
    }

    const userDeck = decks[userId]?.deck || [];
    const owned = userDeck.filter(c => c === cardId).length;

    if (owned < quantity) {
      return interaction.reply({ content: `You only have ${owned} of that card.`, ephemeral: true });
    }

    const rarity = getCardRarity(cardId);
    const coinValue = rarity === 'Legendary' ? 1 : 0.5;
    const payout = coinValue * quantity;

    let removed = 0;
    decks[userId].deck = userDeck.filter(c => {
      if (c === cardId && removed < quantity) {
        removed++;
        return false;
      }
      return true;
    });

    coinBank[userId] = (coinBank[userId] || 0) + payout;
    sellLog[userId][today] += quantity;

    try {
      fs.writeFileSync(decksPath, JSON.stringify(decks, null, 2));
      fs.writeFileSync(coinBankPath, JSON.stringify(coinBank, null, 2));
      fs.writeFileSync(sellLogPath, JSON.stringify(sellLog, null, 2));
    } catch (err) {
      console.error("Failed saving sell transaction:", err);
      return interaction.reply({ content: 'Sell failed to save.', ephemeral: true });
    }

    return interaction.reply({
      content: `✅ Sold ${quantity} card(s) for ${payout} coins.`,
      ephemeral: true
    });
  }
};
