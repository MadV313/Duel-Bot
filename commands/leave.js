// commands/leave.js

import { SlashCommandBuilder } from 'discord.js';
import { duelState } from '../logic/duelState.js';

export default {
  data: new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Stop watching the duel'),

  async execute(interaction) {
    const userId = interaction.user.id;

    duelState.spectators = duelState.spectators.filter(id => id !== userId);

    return interaction.reply({
      content: 'You have left the spectator view.',
      ephemeral: true
    });
  }
};
