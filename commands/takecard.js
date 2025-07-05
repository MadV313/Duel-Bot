// commands/takecard.js

import fs from 'fs/promises';
import path from 'path';
import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { isAllowedChannel } from '../utils/checkChannel.js';
import { config } from '../utils/config.js';

const decksPath = path.resolve('./data/linked_decks.json');

export default {
  data: new SlashCommandBuilder()
    .setName('takecard')
    .setDescription('Admin: Remove cards from a player’s deck')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Player to remove cards from')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('cardid')
        .setDescription('Card ID to remove (e.g. 045)')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('quantity')
        .setDescription('Number of cards to remove')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!isAllowedChannel(interaction.channelId, ['manageCards'])) {
      return interaction.reply({
        content: '⚠️ This command can only be used in #manage-cards.',
        ephemeral: true
      });
    }

    const user = interaction.options.getUser('user');
    const userId = user.id;
    const cardId = interaction.options.getString('cardid');
    const quantity = interaction.options.getInteger('quantity');

    if (quantity < 1) {
      return interaction.reply({
        content: '⚠️ You must remove at least 1 card.',
        ephemeral: true
      });
    }

    let decks = {};
    try {
      await fs.access(decksPath);
      const raw = await fs.readFile(decksPath, 'utf-8');
      decks = JSON.parse(raw);
    } catch (err) {
      console.error('❌ Error loading decks:', err);
      return interaction.reply({
        content: '❌ Failed to load player decks.',
        ephemeral: true
      });
    }

    const userDeck = decks[userId]?.deck || [];
    const ownedCount = userDeck.filter(c => c === cardId).length;

    if (ownedCount < quantity) {
      return interaction.reply({
        content: `⚠️ <@${userId}> only owns ${ownedCount}x of card #${cardId}.`,
        ephemeral: true
      });
    }

    // Remove the specified cards
    let removed = 0;
    decks[userId].deck = userDeck.filter(c => {
      if (c === cardId && removed < quantity) {
        removed++;
        return false;
      }
      return true;
    });

    try {
      await fs.writeFile(decksPath, JSON.stringify(decks, null, 2));
    } catch (err) {
      console.error('❌ Failed to write updated deck:', err);
      return interaction.reply({
        content: '❌ Could not save the updated deck.',
        ephemeral: true
      });
    }

    return interaction.reply({
      content: `✅ Removed ${quantity}x card #${cardId} from <@${userId}>.`,
      ephemeral: true
    });
  }
};
