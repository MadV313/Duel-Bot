// cogs/linkdeck.js

import fs from 'fs/promises';
import path from 'path';
import { SlashCommandBuilder } from 'discord.js';
import { isAllowedChannel } from '../utils/checkChannel.js';

const linkedDecksPath = path.resolve('./data/linked_decks.json');
const coinBankPath = path.resolve('./data/coin_bank.json');
const playerDataPath = path.resolve('./data/player_data.json');

export default async function registerLinkDeck(client) {
  const commandData = new SlashCommandBuilder()
    .setName('linkdeck')
    .setDescription('Link your Discord ID to create your card collection profile.');

  client.slashData.push(commandData.toJSON());

  client.commands.set('linkdeck', {
    data: commandData,
    async execute(interaction) {
      const userId = interaction.user.id;
      const userName = interaction.user.username;
      const channelId = interaction.channelId;
      const guildId = interaction.guildId;

      console.log(`📥 [linkdeck] Command received from ${userName} (${userId}) in Guild ${guildId}, Channel ${channelId}`);

      if (!isAllowedChannel(channelId, ['manageCards'])) {
        console.warn(`⛔ [linkdeck] Denied: Channel ${channelId} is not allowed.`);
        return interaction.reply({
          content: '⚠️ This command can only be used in #manage-cards.',
          ephemeral: true
        });
      }

      // Load existing linked deck profiles
      let existing = {};
      try {
        const raw = await fs.readFile(linkedDecksPath, 'utf-8');
        existing = JSON.parse(raw);
        console.log('📂 [linkdeck] linked_decks.json loaded successfully');
      } catch {
        console.warn('📁 [linkdeck] No existing linked_decks.json found. Starting fresh.');
      }

      if (existing[userId]) {
        console.log(`⚠️ [linkdeck] User ${userId} already linked`);
        return interaction.reply({
          content: '⚠️ You already have a linked profile. Use /viewdeck or /save to update your deck.',
          ephemeral: true
        });
      }

      // Add new profile
      existing[userId] = {
        discordName: userName,
        deck: [],
        collection: {}
      };

      try {
        await fs.mkdir(path.dirname(linkedDecksPath), { recursive: true });
        await fs.writeFile(linkedDecksPath, JSON.stringify(existing, null, 2));
        console.log(`✅ [linkdeck] New profile linked for ${userName} (${userId})`);
      } catch (err) {
        console.error('❌ [linkdeck] Failed to save linked profile:', err);
        return interaction.reply({
          content: '❌ Failed to create your profile. Please try again later.',
          ephemeral: true
        });
      }

      // Create coin bank entry
      let coinData = {};
      try {
        const raw = await fs.readFile(coinBankPath, 'utf-8');
        coinData = JSON.parse(raw);
      } catch {
        console.warn('📁 [linkdeck] No existing coin_bank.json found. Starting fresh.');
      }

      if (!coinData[userId]) {
        coinData[userId] = 0;
        try {
          await fs.writeFile(coinBankPath, JSON.stringify(coinData, null, 2));
          console.log(`💰 [linkdeck] Initialized coin bank for ${userName} (${userId})`);
        } catch (err) {
          console.error('❌ [linkdeck] Failed to save coin_bank.json:', err);
        }
      }

      // Create player_data entry
      let playerData = {};
      try {
        const raw = await fs.readFile(playerDataPath, 'utf-8');
        playerData = JSON.parse(raw);
      } catch {
        console.warn('📁 [linkdeck] No existing player_data.json found. Starting fresh.');
      }

      if (!playerData[userId]) {
        playerData[userId] = { wins: 0, losses: 0 };
        try {
          await fs.writeFile(playerDataPath, JSON.stringify(playerData, null, 2));
          console.log(`📊 [linkdeck] Initialized player stats for ${userName} (${userId})`);
        } catch (err) {
          console.error('❌ [linkdeck] Failed to save player_data.json:', err);
        }
      }

      return interaction.reply({
        content: '✅ Your profile has been successfully linked! Use /buycard to start collecting cards.',
        ephemeral: true
      });
    }
  });
}
