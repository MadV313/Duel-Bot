// commands/clear.js

import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { isAllowedChannel } from '../utils/checkChannel.js';
// ✅ No config import needed — clean and stable

export default {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Admin: Clear recent messages from this duel bot channel')
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('Number of messages to delete (max 100)')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const allowed = isAllowedChannel(interaction.channelId, ['manageCards', 'manageDeck', 'battlefield']);

    if (!allowed) {
      return interaction.reply({
        content: '⚠️ This command can only be used in a duel bot channel.',
        ephemeral: true
      });
    }

    const amount = interaction.options.getInteger('amount');
    if (amount < 1 || amount > 100) {
      return interaction.reply({
        content: '⚠️ Please enter a number between 1 and 100.',
        ephemeral: true
      });
    }

    try {
      await interaction.channel.bulkDelete(amount, true);
      return interaction.reply({
        content: `✅ Deleted ${amount} messages.`,
        ephemeral: true
      });
    } catch (err) {
      console.error('❌ Failed to delete messages:', err);
      return interaction.reply({
        content: '❌ Failed to delete messages. The bot may lack permission.',
        ephemeral: true
      });
    }
  }
};
