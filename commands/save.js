// commands/save.js

import fs from 'fs';
import path from 'path';
import { SlashCommandBuilder } from 'discord.js';
import { isAllowedChannel } from '../utils/checkChannel.js';
import config from '../config.json';

const linkedDecksPath = path.resolve('./data/linked_decks.json');

export default {
  data: new SlashCommandBuilder()
    .setName('save')
    .setDescription('Save your current deck for duels')
    .addStringOption(option =>
      option.setName('deck')
        .setDescription('Your full deck as a JSON array (20–40 cards)')
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!isAllowedChannel(interaction.channelId, ['manageDeck'])) {
      return interaction.reply({
        content: 'This command can only be used in #manage-deck.',
        ephemeral: true
      });
    }

    const userId = interaction.user.id;
    const username = interaction.user.username;
    const deckInput = interaction.options.getString('deck');

    let deck;
    try {
      deck = JSON.parse(deckInput);
      if (!Array.isArray(deck)) throw new Error('Deck must be an array.');
      if (deck.length < 20 || deck.length > 40) {
        throw new Error('Deck must contain between 20 and 40 cards.');
      }
    } catch (err) {
      return interaction.reply({
        content: `Invalid deck format: ${err.message}`,
        ephemeral: true
      });
    }

    let data = { players: [] };
    try {
      if (fs.existsSync(linkedDecksPath)) {
        data = JSON.parse(fs.readFileSync(linkedDecksPath, 'utf-8'));
      }
    } catch (err) {
      console.error('Failed to read deck file:', err);
      return interaction.reply({
        content: 'Failed to load existing decks.',
        ephemeral: true
      });
    }

    const existingIndex = data.players.findIndex(p => p.discordId === userId);
    if (existingIndex >= 0) {
      data.players[existingIndex].deck = deck;
      data.players[existingIndex].discordName = username;
    } else {
      data.players.push({ discordId: userId, discordName: username, deck });
    }

    try {
      fs.writeFileSync(linkedDecksPath, JSON.stringify(data, null, 2));
      return interaction.reply({
        content: '✅ Your deck has been saved and is now eligible for duels!',
        ephemeral: true
      });
    } catch (err) {
      console.error('Deck save failed:', err);
      return interaction.reply({
        content: '❌ Failed to save your deck. Please try again.',
        ephemeral: true
      });
    }
  }
};
