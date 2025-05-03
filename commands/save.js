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
    // Restrict to #manage-deck
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
      if (!Array.isArray(deck) || deck.length < 20 || deck.length > 40) {
        throw new Error('Deck must contain 20 to 40 cards.');
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
        const raw = fs.readFileSync(linkedDecksPath, 'utf-8');
        data = JSON.parse(raw);
      }
    } catch (err) {
      console.error('Failed reading linked decks:', err);
    }

    const index = data.players.findIndex(p => p.discordId === userId);
    if (index >= 0) {
      data.players[index].deck = deck;
      data.players[index].discordName = username;
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
      console.error('Failed to save deck:', err);
      return interaction.reply({
        content: '❌ An error occurred while saving your deck.',
        ephemeral: true
      });
    }
  }
};
