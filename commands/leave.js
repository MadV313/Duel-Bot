// commands/leave.js

import { SlashCommandBuilder } from 'discord.js';
import { duelState } from '../logic/duelState.js';

export default {
  data: new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Leave the duel spectator view'),

  async execute(interaction) {
    const userId = interaction.user.id;

    const before = duelState.spectators.length;
    duelState.spectators = duelState.spectators.filter(id => id !== userId);
    const after = duelState.spectators.length;

    const removed = before > after;

    return interaction.reply({
      content: removed
        ? 'You have left the spectator view.'
        : 'You were not watching the duel.',
      ephemeral: true
    });
  }
};
