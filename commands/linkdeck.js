// commands/linkdeck.js

import fs from 'fs';
import path from 'path';
import { SlashCommandBuilder } from 'discord.js';
import { isAllowedChannel } from '../utils/checkChannel.js';
import config from '../config.json';

const linkedDecksPath = path.resolve('./data/linked_decks.json');

export default {
  data: new SlashCommandBuilder()
    .setName('link')
    .setDescription('Link your Discord ID to your current deck.')
    .addStringOption(option =>
      option.setName('deck')
        .setDescription('Paste your deck JSON string here')
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
    const userName = interaction.user.username;
    const deckInput = interaction.options.getString('deck');

    let deck;
    try {
      deck = JSON.parse(deckInput);
      if (!Array.isArray(deck) || deck.length < 20 || deck.length > 40) {
        throw new Error("Deck must be an array of 20–40 cards.");
      }
    } catch (err) {
      return interaction.reply({
        content: `Invalid deck data: ${err.message}`,
        ephemeral: true,
      });
    }

    let existing = { players: [] };
    try {
      if (fs.existsSync(linkedDecksPath)) {
        const raw = fs.readFileSync(linkedDecksPath, 'utf-8');
        existing = JSON.parse(raw);
      }
    } catch (err) {
      console.error("Failed to read linked decks:", err);
    }

    const existingIndex = existing.players.findIndex(p => p.discordId === userId);
    if (existingIndex >= 0) {
      existing.players[existingIndex] = { discordId: userId, discordName: userName, deck };
    } else {
      existing.players.push({ discordId: userId, discordName: userName, deck });
    }

    try {
      fs.writeFileSync(linkedDecksPath, JSON.stringify(existing, null, 2));

      return interaction.reply({
        content: `✅ Deck linked successfully!\nVisit the [Hub UI](${config.ui_urls.hub_ui}) to begin.`,
        ephemeral: true
      });
    } catch (err) {
      console.error("Failed to write linked deck:", err);
      return interaction.reply({
        content: '❌ Failed to save your deck.',
        ephemeral: true
      });
    }
  }
};
