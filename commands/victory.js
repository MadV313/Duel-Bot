// commands/victory.js

import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { duelState, endLiveDuel } from '../logic/duelState.js';
import fs from 'fs/promises';
import path from 'path';
import { isAllowedChannel } from '../utils/checkChannel.js';

const playerStatsPath = path.resolve('./data/player_data.json');

export default {
  data: new SlashCommandBuilder()
    .setName('victory')
    .setDescription('Admin: Manually declare a duel winner')
    .addUserOption(option =>
      option.setName('winner')
        .setDescription('Player to declare as winner')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!isAllowedChannel(interaction.channelId, ['battlefield'])) {
      return interaction.reply({
        content: 'This command can only be used in #battlefield.',
        ephemeral: true
      });
    }

    const winner = interaction.options.getUser('winner');
    const winnerId = winner.id;

    const player1Id = duelState.players?.player1?.discordId;
    const player2Id = duelState.players?.player2?.discordId;

    if (![player1Id, player2Id].includes(winnerId)) {
      return interaction.reply({ content: 'Selected user is not in the current duel.', ephemeral: true });
    }

    const loserId = winnerId === player1Id ? player2Id : player1Id;

    try {
      const raw = await fs.readFile(playerStatsPath, 'utf-8');
      const stats = JSON.parse(raw);

      if (!stats[winnerId]) stats[winnerId] = { wins: 0, losses: 0 };
      if (!stats[loserId]) stats[loserId] = { wins: 0, losses: 0 };

      stats[winnerId].wins += 1;
      stats[loserId].losses += 1;

      await fs.writeFile(playerStatsPath, JSON.stringify(stats, null, 2));
    } catch (err) {
      console.error('Failed to update player stats:', err);
    }

    await endLiveDuel(winnerId);

    return interaction.reply({
      content: `✅ Victory declared! <@${winnerId}> is the winner of the duel.`,
      allowedMentions: { users: [winnerId] }
    });
  }
};
