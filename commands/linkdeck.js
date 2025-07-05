// commands/linkdeck.js

import fs from 'fs/promises';
import path from 'path';
import { SlashCommandBuilder } from 'discord.js';
import { isAllowedChannel } from '../utils/checkChannel.js';

const linkedDecksPath = path.resolve('./data/linked_decks.json');

export default {
  data: new SlashCommandBuilder()
    .setName('linkdeck') // ✅ Match registered name exactly (no underscore!)
    .setDescription('Link your Discord ID to create your card collection profile.'),

  async execute(interaction) {
    console.log(`📥 /linkdeck triggered by ${interaction.user.username} (${interaction.user.id})`);
  
    if (!isAllowedChannel(interaction.channelId, ['manageCards'])) {
      console.warn(`⛔ Blocked: /linkdeck run outside allowed channel (${interaction.channelId})`);
      return interaction.reply({
        content: '⚠️ This command can only be used in #manage-cards.',
        ephemeral: true
      });
    }
  
    const userId = interaction.user.id;
    const userName = interaction.user.username;
  
    console.log(`👤 Proceeding to link profile for: ${userName} (${userId})`);
  
    let existing = {};
  
    try {
      const raw = await fs.readFile(linkedDecksPath, 'utf-8');
      existing = JSON.parse(raw);
      console.log(`📂 loaded existing linked_decks.json`);
    } catch (err) {
      console.warn(`⚠️ linked_decks.json not found or empty. Starting fresh.`);
    }
  
    if (existing[userId]) {
      console.warn(`⚠️ Duplicate profile: ${userId} already linked`);
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
      console.log(`✅ Linked profile saved for ${userId}`);
      return interaction.reply({
        content: '✅ Your profile has been successfully linked! Use `/buycard` to start collecting cards.',
        ephemeral: true
      });
    } catch (err) {
      console.error('❌ Failed to write linked profile:', err);
      return interaction.reply({
        content: '❌ Failed to create your profile. Please try again later.',
        ephemeral: true
      });
    }
  }

