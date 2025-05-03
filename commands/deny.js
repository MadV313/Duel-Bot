// commands/deny.js

import { SlashCommandBuilder } from 'discord.js';
import { removeTradeOffer, getTradeOffer } from '../utils/tradeQueue.js';

export const data = new SlashCommandBuilder()
  .setName('deny')
  .setDescription('Deny a pending trade request.');

export async function execute(interaction) {
  const userId = interaction.user.id;
  const trade = getTradeOffer(userId);

  if (!trade) {
    return interaction.reply({
      content: 'You have no pending trade offers to deny.',
      ephemeral: true,
    });
  }

  removeTradeOffer(userId);

  return interaction.reply({
    content: `Trade denied. Offer from <@${trade.senderId}> has been removed.`,
    ephemeral: false,
  });
}
