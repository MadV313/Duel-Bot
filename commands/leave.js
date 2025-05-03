// commands/leave.js

import { SlashCommandBuilder } from 'discord.js';
import { duelState } from '../logic/duelState.js';
import fs from 'fs/promises';
import path from 'path';
import { isAllowedChannel } from '../utils/checkChannel.js';
import config from '../config.json';

export default {
  data: new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Leave the duel spectator view'),

  async execute(interaction) {
    // Restrict to #battlefield
    if (!isAllowedChannel(interaction.channelId, ['battlefield'])) {
      return interaction.reply({
        content: 'This command can only be used in #battlefield.',
        ephemeral: true
      });
    }

    const userId = interaction.user.id;
    const username = interaction.user.username;

    const before = duelState.spectators.length;
    duelState.spectators = duelState.spectators.filter(id => id !== userId);
    const removed = before > duelState.spectators.length;

    if (removed) {
      // Log spectator leave
      const logEntry = {
        timestamp: new Date().toISOString(),
        action: 'left',
        userId,
        username
      };

      const logPath = path.join(process.cwd(), 'data', 'logs', 'current_duel_log.json');

      try {
        let existing = [];
        try {
          const raw = await fs.readFile(logPath, 'utf-8');
          existing = JSON.parse(raw);
        } catch (readErr) {
          // Safe if file doesn't exist yet
        }

        existing.push(logEntry);
        await fs.mkdir(path.dirname(logPath), { recursive: true });
        await fs.writeFile(logPath, JSON.stringify(existing, null, 2));
      } catch (writeErr) {
        console.error('Failed to write spectator log:', writeErr);
      }
    }

    return interaction.reply({
      content: removed
        ? 'You have left the spectator view.'
        : 'You were not watching the duel.',
      ephemeral: true
    });
  }
};
