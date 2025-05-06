// commands/practice.js

import { SlashCommandBuilder } from 'discord.js';
import fetch from 'node-fetch';
import { isAllowedChannel } from '../utils/checkChannel.js';
import config from '../config.json';

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

    // Admin-only usage check by role ID
    const memberRoles = interaction.member.roles.cache.map(role => role.id);
    const isAdmin = config.admin_role_ids.some(adminRoleId => memberRoles.includes(adminRoleId));
    if (!isAdmin) {
      return interaction.reply({
        content: 'Only Admins can initiate practice duels.',
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const response = await fetch(`${process.env.backend_url}/duel/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player1Id: interaction.user.id,
          player2Id: 'bot'
        })
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || 'Unknown backend error');
      }

      const duelUrl = `${config.ui_urls.duel_ui}?player=${interaction.user.id}`;
      return interaction.editReply(`🧪 Practice duel started: [Click to open Duel UI](${duelUrl})`);
    } catch (err) {
      console.error('Failed to start practice duel:', err);
      return interaction.editReply({
        content: 'Error starting practice duel. Please try again later.',
        ephemeral: true
      });
    }
  }
};
