// commands/leave.js

import { SlashCommandBuilder } from 'discord.js';
import { duelState } from '../logic/duelState.js';
import fs from 'fs/promises';
import path from 'path';
import { isAllowedChannel } from '../utils/checkChannel.js';

export default {
  data: new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Leave the duel spectator view'),

  async execute(interaction) {
    if (!isAllowedChannel(interaction.channelId, ['battlefield'])) {
      return interaction.reply({
        content: 'This command can only be used in #battlefield.',
        ephemeral: true
      });
    }

    const userId = interaction.user.id;
    const username = interaction.user.username;

    const wasSpectating = duelState.spectators.includes(userId);
    duelState.spectators = duelState.spectators.filter(id => id !== userId);

    if (wasSpectating) {
      const logPath = path.resolve('./data/logs/current_duel_log.json');
      const logEntry = {
        timestamp: new Date().toISOString(),
        action: 'left',
        userId,
        username
      };

      try {
        await fs.mkdir(path.dirname(logPath), { recursive: true });

        let existing = [];
        try {
          const raw = await fs.readFile(logPath, 'utf-8');
          existing = JSON.parse(raw);
        } catch {
          // No prior log exists; skip
        }

        existing.push(logEntry);
        await fs.writeFile(logPath, JSON.stringify(existing, null, 2));
      } catch (err) {
        console.error('❌ Spectator leave log failed:', err);
      }
    }

    return interaction.reply({
      content: wasSpectating
        ? '✅ You have left the duel spectator view.'
        : 'You were not watching the duel.',
      ephemeral: true
    });
  }
};
