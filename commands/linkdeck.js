// commands/linkdeck.js

import fs from 'fs/promises';
import path from 'path';
import { SlashCommandBuilder } from 'discord.js';
import { isAllowedChannel } from '../utils/checkChannel.js';

const linkedDecksPath = path.resolve('./data/linked_decks.json');

export default {
  data: new SlashCommandBuilder()
    .setName('linkdeck') // ✅ Registered name must exactly match
    .setDescription('Link your Discord ID to create your card collection profile.'),

  async execute(interaction) {
    const userId = interaction.user.id;
    const userName = interaction.user.username;
    const channelId = interaction.channelId;
    const guildId = interaction.guildId;

    console.log(`📥 [linkdeck] Command received from ${userName} (${userId}) in Guild ${guildId}, Channel ${channelId}`);

    // ✅ Check channel access
    if (!isAllowedChannel(channelId, ['manageCards'])) {
      console.warn(`⛔ [linkdeck] Denied: Channel ${channelId} is not allowed.`);
      return interaction.reply({
        content: '⚠️ This command can only be used in #manage-cards.',
        ephemeral: true
      });
    }

    let existing = {};
    try {
      const raw = await fs.readFile(linkedDecksPath, 'utf-8');
      existing = JSON.parse(raw);
      console.log('📂 [linkdeck] linked_decks.json loaded successfully');
    } catch (err) {
      console.warn('📁 [linkdeck] No existing linked_decks.json found. Starting fresh.');
    }

    if (existing[userId]) {
      console.log(`⚠️ [linkdeck] User ${userId} already linked`);
      return interaction.reply({
        content: '⚠️ You already have a linked profile. Use `/viewdeck` or `/save` to update your deck.',
        ephemeral: true
      });
    }

    // ✅ Add new profile
    existing[userId] = {
      discordName: userName,
      deck: [],
      collection: {}
    };

    try {
      await fs.mkdir(path.dirname(linkedDecksPath), { recursive: true });
      await fs.writeFile(linkedDecksPath, JSON.stringify(existing, null, 2));
      console.log(`✅ [linkdeck] New profile linked for ${userName} (${userId})`);
      return interaction.reply({
        content: '✅ Your profile has been successfully linked! Use `/buycard` to start collecting cards.',
        ephemeral: true
      });
    } catch (err) {
      console.error('❌ [linkdeck] Failed to save linked profile:', err);
      return interaction.reply({
        content: '❌ Failed to create your profile. Please try again later.',
        ephemeral: true
      });
    }
  }
};
