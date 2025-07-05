// commands/linkdeck.js

import fs from 'fs/promises';
import path from 'path';
import { SlashCommandBuilder } from 'discord.js';
import { isAllowedChannel } from '../utils/checkChannel.js';

const linkedDecksPath = path.resolve('./data/linked_decks.json');

export default {
  data: new SlashCommandBuilder()
    .setName('link deck')
    .setDescription('Link your Discord ID to create your card collection profile.'),

  async execute(interaction) {
    if (!isAllowedChannel(interaction.channelId, ['manageCards'])) {
      return interaction.reply({
        content: '⚠️ This command can only be used in #manage-cards.',
        ephemeral: true
      });
    }

    const userId = interaction.user.id;
    const userName = interaction.user.username;

    let existing = {};

    try {
      const raw = await fs.readFile(linkedDecksPath, 'utf-8');
      existing = JSON.parse(raw);
    } catch {
      // File doesn't exist or is empty — proceed with empty object
    }

    if (existing[userId]) {
      return interaction.reply({
        content: '⚠️ You already have a linked profile. Use `/viewdeck` or `/save` to update your deck.',
        ephemeral: true
      });
    }

    existing[userId] = {
      discordName: userName,
      deck: [],
      collection: {}
    };

    try {
      await fs.mkdir(path.dirname(linkedDecksPath), { recursive: true });
      await fs.writeFile(linkedDecksPath, JSON.stringify(existing, null, 2));
      return interaction.reply({
        content: '✅ Your profile has been successfully linked! Use `/buycard` to start collecting cards.',
        ephemeral: true
      });
    } catch (err) {
      console.error('❌ Failed to save linked profile:', err);
      return interaction.reply({
        content: '❌ Failed to create your profile. Please try again later.',
        ephemeral: true
      });
    }
  }
};
