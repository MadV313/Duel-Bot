import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import fetch from 'node-fetch';
import config from '../config.json';
import { isAllowedChannel } from '../utils/checkChannel.js';

export default {
  data: new SlashCommandBuilder()
    .setName('challenge')
    .setDescription('Challenge another player to a duel')
    .addUserOption(option =>
      option.setName('opponent')
        .setDescription('Select the player to challenge')
        .setRequired(true)
    ),

  async execute(interaction) {
    const allowed = isAllowedChannel(interaction.channelId, ['battlefield']);
    if (!allowed) {
      return interaction.reply({
        content: 'This command can only be used in #battlefield.',
        ephemeral: true
      });
    }

    const challengerId = interaction.user.id;
    const opponent = interaction.options.getUser('opponent');
    const opponentId = opponent.id;

    if (challengerId === opponentId) {
      return interaction.reply({ content: 'You cannot challenge yourself.', ephemeral: true });
    }

    try {
      const response = await fetch(`${config.backendUrl}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player1Id: challengerId,
          player2Id: opponentId
        })
      });

      const result = await response.json();

      if (!response.ok) {
        console.error('Duel start error:', result.error || result);
        return interaction.reply({ content: `Failed to start duel: ${result.error}`, ephemeral: true });
      }

      const duelUrl = `${config.frontendUrl}/duel.html?player=${challengerId}`;
      return interaction.reply({
        content: `⚔️ <@${challengerId}> has challenged <@${opponentId}> to a duel!\n[Click here to join the duel](${duelUrl})`,
        allowedMentions: { users: [challengerId, opponentId] }
      });

    } catch (error) {
      console.error('Challenge command failed:', error);
      return interaction.reply({ content: 'Internal error starting duel.', ephemeral: true });
    }
  }
};
