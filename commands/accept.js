import { SlashCommandBuilder } from 'discord.js';
import { getTrade, removeTrade } from '../utils/tradeQueue.js';
import { updatePlayerDecks } from '../utils/deckUtils.js'; // Assumes helper exists

export default {
  data: new SlashCommandBuilder()
    .setName('accept')
    .setDescription('Accept a pending trade offer')
    .addStringOption(option =>
      option.setName('trade_id')
        .setDescription('ID of the trade offer to accept')
        .setRequired(true)
    ),

  async execute(interaction) {
    const tradeId = interaction.options.getString('trade_id');
    const trade = getTrade(tradeId);

    if (!trade) {
      return interaction.reply({ content: 'Trade not found or already processed.', ephemeral: true });
    }

    if (trade.receiverId !== interaction.user.id) {
      return interaction.reply({ content: 'You are not authorized to accept this trade.', ephemeral: true });
    }

    // Swap cards between sender and receiver
    const { senderId, receiverId, senderCards, receiverCards } = trade;
    const result = await updatePlayerDecks(senderId, receiverId, senderCards, receiverCards);

    if (!result.success) {
      return interaction.reply({ content: result.message, ephemeral: true });
    }

    removeTrade(tradeId);

    return interaction.reply({
      content: `✅ Trade accepted! Cards exchanged successfully between <@${senderId}> and <@${receiverId}>.`,
    });
  }
};
