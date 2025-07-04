// commands/linkdeck.js

import fs from 'fs/promises';
import path from 'path';
import { SlashCommandBuilder } from 'discord.js';
import { isAllowedChannel } from '../utils/checkChannel.js';

const config = JSON.parse(await fs.readFile(new URL("../config.json", import.meta.url)));
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

    let parsedDeck;
    try {
      parsedDeck = JSON.parse(deckInput);
      if (!Array.isArray(parsedDeck) || parsedDeck.length < 20 || parsedDeck.length > 40) {
        throw new Error('Deck must contain between 20 and 40 cards.');
      }
    } catch (err) {
      return interaction.reply({
        content: `❌ Invalid deck data: ${err.message}`,
        ephemeral: true
      });
    }

    let existing = { players: [] };

    try {
      const exists = await fs.access(linkedDecksPath).then(() => true).catch(() => false);
      if (exists) {
        const raw = await fs.readFile(linkedDecksPath, 'utf-8');
        existing = JSON.parse(raw);
      }
    } catch (err) {
      console.error('❌ Failed to read linked decks:', err);
      return interaction.reply({
        content: '❌ Failed to read existing deck data.',
        ephemeral: true
      });
    }

    const existingIndex = existing.players.findIndex(p => p.discordId === userId);
    const playerData = { discordId: userId, discordName: userName, deck: parsedDeck };

    if (existingIndex >= 0) {
      existing.players[existingIndex] = playerData;
    } else {
      existing.players.push(playerData);
    }

    try {
      await fs.writeFile(linkedDecksPath, JSON.stringify(existing, null, 2));
      return interaction.reply({
        content: `✅ Deck linked successfully!\nVisit the [Hub UI](${config.ui_urls.hub_ui}) to begin.`,
        ephemeral: true
      });
    } catch (err) {
      console.error('❌ Failed to write linked deck:', err);
      return interaction.reply({
        content: '❌ Failed to save your deck. Please try again later.',
        ephemeral: true
      });
    }
  }
};
