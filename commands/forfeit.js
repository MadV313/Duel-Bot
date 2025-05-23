import { SlashCommandBuilder } from 'discord.js';
import { duelState, endLiveDuel } from '../logic/duelState.js';
import { rewardDuelWinner } from '../logic/rewardHandler.js';
import { writeDuelSummary } from '../utils/summaryWriter.js';
import fs from 'fs/promises';
import path from 'path';
import { isAllowedChannel } from '../utils/checkChannel.js';

const playerStatsPath = path.resolve('./data/player_data.json');

export default {
  data: new SlashCommandBuilder()
    .setName('forfeit')
    .setDescription('Forfeit the current duel'),

  async execute(interaction) {
    if (!isAllowedChannel(interaction.channelId, ['battlefield'])) {
      return interaction.reply({
        content: 'This command can only be used in #battlefield.',
        ephemeral: true
      });
    }

    const userId = interaction.user.id;
    const player1Id = duelState.players?.player1?.discordId;
    const player2Id = duelState.players?.player2?.discordId;

    if (!player1Id || !player2Id) {
      return interaction.reply({
        content: 'There is no active duel to forfeit.',
        ephemeral: true
      });
    }

    if (![player1Id, player2Id].includes(userId)) {
      return interaction.reply({
        content: 'You are not currently in an active duel.',
        ephemeral: true
      });
    }

    const opponentId = userId === player1Id ? player2Id : player1Id;

    // Update win/loss stats
    try {
      const statsRaw = await fs.readFile(playerStatsPath, 'utf-8');
      const stats = JSON.parse(statsRaw);

      if (!stats[userId]) stats[userId] = { wins: 0, losses: 0 };
      if (!stats[opponentId]) stats[opponentId] = { wins: 0, losses: 0 };

      stats[userId].losses += 1;
      stats[opponentId].wins += 1;

      await fs.writeFile(playerStatsPath, JSON.stringify(stats, null, 2));
    } catch (err) {
      console.error('Failed to update duel stats:', err);
    }

    // Transfer wager if present
    if (duelState.wagerAmount) {
      rewardDuelWinner(opponentId, userId, duelState.wagerAmount);
    }

    // Save summary before ending duel
    try {
      await writeDuelSummary(duelState, opponentId);
    } catch (err) {
      console.error('Failed to write duel summary:', err);
    }

    // End duel
    await endLiveDuel(opponentId);

    return interaction.reply({
      content: `❌ <@${userId}> has forfeited the duel. <@${opponentId}> is the winner!`,
      allowedMentions: { users: [userId, opponentId] }
    });
  }
};
