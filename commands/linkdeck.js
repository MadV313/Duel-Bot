// commands/linkdeck.js

import fs from 'fs/promises';
import path from 'path';
import { SlashCommandBuilder } from 'discord.js';
import { isAllowedChannel } from '../utils/checkChannel.js';

const linkedDecksPath = path.resolve('./data/linked_decks.json');

export default {
  data: new SlashCommandBuilder()
    .setName('linkdeck')
    .setDescription('Link your Discord ID to create your card collection profile.'),

  async execute(interaction) {
    const userId = interaction.user.id;
    const userName = interaction.user.username;
    const channelId = interaction.channelId;

    console.log(`📥 /link_deck invoked by ${userName} (${userId}) in channel ${channelId}`);

    // ✅ Channel restriction check
    if (!isAllowedChannel(channelId, ['manageCards'])) {
      console.warn(`⛔ Command denied for ${userName} (${userId}) — wrong channel (${channelId})`);
      return interaction.reply({
        content: '⚠️ This command can only be used in #manage-cards.',
        ephemeral: true
      });
    }

    let existing = {};

    try {
      const raw = await fs.readFile(linkedDecksPath, 'utf-8');
      existing = JSON.parse(raw);
      console.log(`📂 Loaded existing linked_decks.json for linking`);
    } catch (err) {
      console.warn(`⚠️ No existing linked_decks.json found or failed to parse. Starting fresh. Error: ${err.message}`);
    }

    if (existing[userId]) {
      console.log(`⚠️ ${userName} (${userId}) already has a linked profile.`);
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
      console.log(`✅ Created new profile for ${userName} (${userId}) and saved to linked_decks.json`);
      return interaction.reply({
        content: '✅ Your profile has been successfully linked! Use `/buycard` to start collecting cards.',
        ephemeral: true
      });
    } catch (err) {
      console.error(`❌ Failed to write linked profile for ${userName} (${userId}):`, err);
      return interaction.reply({
        content: '❌ Failed to create your profile. Please try again later.',
        ephemeral: true
      });
    }
  }
};
