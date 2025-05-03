// commands/discard.js

import fs from 'fs';
import path from 'path';
import { isAllowedChannel } from '../utils/checkChannel.js';
import config from '../config.json';

const decksPath = path.resolve('./data/linked_decks.json');

export default {
  name: 'discard',
  description: 'Discard cards from your collection to free up space.',
  options: [
    {
      name: 'cardid',
      type: 3, // STRING
      description: 'Card ID to discard (e.g. 045)',
      required: true,
    },
    {
      name: 'quantity',
      type: 4, // INTEGER
      description: 'Number of cards to discard',
      required: true,
    }
  ],

  async execute(interaction) {
    // Restrict to #manage-cards
    if (!isAllowedChannel(interaction.channelId, ['manageCards'])) {
      return interaction.reply({
        content: 'This command can only be used in #manage-cards.',
        ephemeral: true
      });
    }

    const userId = interaction.user.id;
    const cardId = interaction.options.getString('cardid');
    const quantity = interaction.options.getInteger('quantity');

    if (quantity < 1) {
      return interaction.reply({ content: 'You must discard at least 1 card.', ephemeral: true });
    }

    let decks = {};
    try {
      if (fs.existsSync(decksPath)) {
        decks = JSON.parse(fs.readFileSync(decksPath));
      }
    } catch (err) {
      console.error("Failed to read decks:", err);
      return interaction.reply({ content: 'Error reading your collection.', ephemeral: true });
    }

    const userDeck = decks[userId]?.deck || [];
    const owned = userDeck.filter(c => c === cardId).length;

    if (owned < quantity) {
      return interaction.reply({ content: `You only have ${owned} copies of that card.`, ephemeral: true });
    }

    let removed = 0;
    decks[userId].deck = userDeck.filter(c => {
      if (c === cardId && removed < quantity) {
        removed++;
        return false;
      }
      return true;
    });

    try {
      fs.writeFileSync(decksPath, JSON.stringify(decks, null, 2));
    } catch (err) {
      console.error("Failed to write decks:", err);
      return interaction.reply({ content: 'Failed to discard cards.', ephemeral: true });
    }

    return interaction.reply({ content: `✅ Discarded ${quantity}x Card ${cardId}.`, ephemeral: true });
  }
};
