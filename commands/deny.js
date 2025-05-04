import { SlashCommandBuilder } from 'discord.js';
import { removeTradeOffer, getTradeOffer } from '../utils/tradeQueue.js';

export const data = new SlashCommandBuilder()
  .setName('deny')
  .setDescription('Deny a pending trade request or duel challenge.');

export async function execute(interaction) {
  // Handle duel button interaction
  if (interaction.isButton() && interaction.customId.startsWith('deny_')) {
    const challengerId = interaction.customId.split('_')[1];
    const opponentId = interaction.user.id;

    return interaction.update({
      content: `❌ <@${opponentId}> has denied the duel challenge from <@${challengerId}>.`,
      components: []
    });
  }

  // Fallback: trade denial
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
