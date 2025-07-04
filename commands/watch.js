// commands/watch.js

import { SlashCommandBuilder } from 'discord.js';
import { duelState } from '../logic/duelState.js';
import fs from 'fs/promises';
import path from 'path';
import { isAllowedChannel } from '../utils/checkChannel.js';
import config from "../config.json" assert { type: "json" };

export default {
  data: new SlashCommandBuilder()
    .setName('watch')
    .setDescription('Join the current duel as a spectator'),

  async execute(interaction) {
    // ✅ Channel restriction check
    if (!isAllowedChannel(interaction.channelId, ['battlefield'])) {
      return interaction.reply({
        content: 'This command can only be used in #battlefield.',
        ephemeral: true
      });
    }

    const userId = interaction.user.id;
    const username = interaction.user.username;

    // ✅ Add to spectator list if not already present
    if (!duelState.spectators.includes(userId)) {
      duelState.spectators.push(userId);
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      action: 'joined',
      userId,
      username
    };

    const logPath = path.join(process.cwd(), 'data', 'logs', 'current_duel_log.json');

    try {
      let existing = [];
      try {
        const raw = await fs.readFile(logPath, 'utf-8');
        existing = JSON.parse(raw);
      } catch {
        // File may not exist yet — start fresh
      }

      existing.push(logEntry);
      await fs.mkdir(path.dirname(logPath), { recursive: true });
      await fs.writeFile(logPath, JSON.stringify(existing, null, 2));
    } catch (err) {
      console.error('❌ Failed to write spectator log:', err);
    }

    return interaction.reply({
      content: `👁️ You are now watching the duel!\n[Open Spectator View](${config.ui_urls.spectator_view_ui}?duelId=current&user=${encodeURIComponent(username)})`,
      ephemeral: true
    });
  }
};
