// commands/discard.js

import fs from 'fs';
import path from 'path';
import { SlashCommandBuilder } from 'discord.js';
import { isAllowedChannel } from '../utils/checkChannel.js';
// ❌ Removed unused: import fs from "fs/promises";
const config = JSON.parse(await fs.readFile(new URL("../config.json", import.meta.url)));

const decksPath = path.resolve('./data/linked_decks.json');

export default {
  data: new SlashCommandBuilder()
    .setName('discard')
    .setDescription('Discard cards from your collection to free up space.')
    .addStringOption(option =>
      option.setName('cardid')
        .setDescription('Card ID to discard (e.g. 045)')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('quantity')
        .setDescription('Number of cards to discard')
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

    if (quantity < 1) {
      return interaction.reply({ content: 'You must discard at least 1 card.', ephemeral: true });
    }

    let decks = {};
    try {
      if (fs.existsSync(decksPath)) {
        const raw = fs.readFileSync(decksPath, 'utf-8');
        decks = JSON.parse(raw);
      }
    } catch (err) {
      console.error('Failed to read decks:', err);
      return interaction.reply({ content: 'Error reading your collection.', ephemeral: true });
    }

    const userDeck = decks[userId]?.deck || [];

    if (!decks[userId]) {
      return interaction.reply({
        content: 'You do not have a linked collection to discard from.',
        ephemeral: true
      });
    }

    const owned = userDeck.filter(c => c === cardId).length;

    if (owned < quantity) {
      return interaction.reply({
        content: `You only have ${owned} copies of that card.`,
        ephemeral: true
      });
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
      console.error('Failed to write decks:', err);
      return interaction.reply({ content: 'Failed to discard cards.', ephemeral: true });
    }

    return interaction.reply({
      content: `✅ Discarded ${quantity}x Card ${cardId}.`,
      ephemeral: true
    });
  }
};
