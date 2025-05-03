import { SlashCommandBuilder } from 'discord.js';
import { getTrade, removeTrade } from '../utils/tradeQueue.js';

export default {
  data: new SlashCommandBuilder()
    .setName('deny')
    .setDescription('Deny a pending trade offer')
    .addStringOption(option =>
      option.setName('trade_id')
        .setDescription('ID of the trade offer to deny')
        .setRequired(true)
    ),

  async execute(interaction) {
    const tradeId = interaction.options.getString('trade_id');
    const trade = getTrade(tradeId);

    if (!trade) {
      return interaction.reply({ content: 'Trade not found or already processed.', ephemeral: true });
    }

    if (trade.receiverId !== interaction.user.id) {
      return interaction.reply({ content: 'You are not authorized to deny this trade.', ephemeral: true });
    }

    removeTrade(tradeId);

    return interaction.reply({
      content: `❌ Trade denied and removed from the queue.`,
    });
  }
};
