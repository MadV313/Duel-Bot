import fs from 'fs';
import path from 'path';
import { SlashCommandBuilder } from 'discord.js';
import { weightedRandomCards } from '../utils/cardPicker.js';
import { getCardRarity } from '../utils/cardRarity.js';
import { isAllowedChannel } from '../utils/checkChannel.js';
import config from '../config.json';

const decksPath = path.resolve('./data/linked_decks.json');
const coinBankPath = path.resolve('./data/coin_bank.json');
const revealPath = path.resolve('./public/data/mock_pack_reveal.json');

export default {
  data: new SlashCommandBuilder()
    .setName('buycard')
    .setDescription('Buy a pack of 3 cards (3 coins required)'),

  async execute(interaction) {
    if (!isAllowedChannel(interaction.channelId, ['manageCards'])) {
      return interaction.reply({
        content: 'This command can only be used in #manage-cards.',
        ephemeral: true
      });
    }

    const userId = interaction.user.id;
    const username = interaction.user.username;

    let coinBank = {};
    let decks = {};
    try {
      if (fs.existsSync(coinBankPath)) {
        coinBank = JSON.parse(fs.readFileSync(coinBankPath));
      }
      if (fs.existsSync(decksPath)) {
        decks = JSON.parse(fs.readFileSync(decksPath));
      }
    } catch (err) {
      console.error('Failed reading files:', err);
      return interaction.reply({ content: 'Internal error loading data.', ephemeral: true });
    }

    const balance = coinBank[userId] || 0;
    const userDeck = decks[userId]?.deck || [];

    if (userDeck.length >= config.coin_system.max_card_collection_size) {
      return interaction.reply({
        content: 'You must have a maximum of 247 cards in your collection to buy more or make room.',
        ephemeral: true
      });
    }

    if (balance < config.coin_system.card_pack_cost) {
      return interaction.reply({ content: 'You need 3 coins to buy a card pack.', ephemeral: true });
    }

    const previous = new Set(userDeck);
    const newCards = weightedRandomCards(3);
    newCards.forEach(card => userDeck.push(card));

    decks[userId] = {
      discordName: username,
      deck: userDeck
    };
    coinBank[userId] = balance - config.coin_system.card_pack_cost;

    try {
      fs.writeFileSync(decksPath, JSON.stringify(decks, null, 2));
      fs.writeFileSync(coinBankPath, JSON.stringify(coinBank, null, 2));
    } catch (err) {
      console.error('Failed saving decks or coin bank:', err);
      return interaction.reply({ content: 'Failed to complete your purchase.', ephemeral: true });
    }

    const revealPayload = {
      title: 'New Card Pack Unlocked!',
      cards: newCards.map(cardId => ({
        cardId,
        rarity: getCardRarity(cardId),
        newUnlock: !previous.has(cardId)
      })),
      autoCloseIn: 10
    };

    try {
      fs.writeFileSync(revealPath, JSON.stringify(revealPayload, null, 2));
    } catch (err) {
      console.error('Failed writing reveal file:', err);
      return interaction.reply({ content: 'Purchase completed, but failed to prepare reveal.', ephemeral: true });
    }

    return interaction.reply({
      content: `✅ Pack purchased! ${config.coin_system.buycard_message}`,
      ephemeral: true
    });
  }
};
