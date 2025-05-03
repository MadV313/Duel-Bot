import { SlashCommandBuilder } from 'discord.js';
import fetch from 'node-fetch';
import { isAllowedChannel } from '../utils/checkChannel.js';

export default {
  data: new SlashCommandBuilder()
    .setName('practice')
    .setDescription('Start a duel against the bot (admin only)'),

  async execute(interaction) {
    if (!isAllowedChannel(interaction.channelId, ['battlefield'])) {
      return interaction.reply({
        content: 'This command can only be used in #battlefield.',
        ephemeral: true
      });
    }

    // Optional: restrict to admin users only
    const adminRoles = ['Admin', 'Trial Admin'];
    const memberRoles = interaction.member.roles.cache.map(role => role.name);
    if (!memberRoles.some(r => adminRoles.includes(r))) {
      return interaction.reply({
        content: 'Only Admins can initiate practice duels.',
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const result = await fetch('http://localhost:3000/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player1Id: interaction.user.id,
          player2Id: 'bot'
        })
      }).then(res => res.json());

      if (result.error) {
        throw new Error(result.error);
      }

      return interaction.editReply(`Practice duel started: [Click to open Duel UI](${result.url})`);
    } catch (err) {
      console.error('Failed to start practice duel:', err);
      return interaction.editReply({
        content: 'Error starting practice duel. Try again later.',
        ephemeral: true
      });
    }
  }
};
