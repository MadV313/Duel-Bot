// commands/deny.js

import { SlashCommandBuilder } from 'discord.js';
import { removeTradeOffer, getTradeOffer } from '../utils/tradeQueue.js';

export default {
  data: new SlashCommandBuilder()
    .setName('deny')
    .setDescription('Deny a pending trade request or duel challenge.'),

  async execute(interaction) {
    // ✅ Handle duel challenge denial via button
    if (interaction.isButton() && interaction.customId.startsWith('deny_')) {
      const challengerId = interaction.customId.split('_')[1];
      const opponentId = interaction.user.id;

      return interaction.update({
        content: `❌ <@${opponentId}> has denied the duel challenge from <@${challengerId}>.`,
        components: []
      });
    }

    // ✅ Fallback: deny a pending trade
    const userId = interaction.user.id;
    const trade = getTradeOffer(userId);

    if (!trade) {
      return interaction.reply({
        content: '⚠️ You have no pending trade offers to deny.',
        ephemeral: true
      });
    }

    removeTradeOffer(userId);

    return interaction.reply({
      content: `❌ Trade denied. Offer from <@${trade.senderId}> has been removed.`,
      ephemeral: false
    });
  }
};
