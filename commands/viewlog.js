// commands/viewlog.js

import { SlashCommandBuilder } from 'discord.js';
import { duelState } from '../logic/duelState.js';

export default {
  data: new SlashCommandBuilder()
    .setName('viewlog')
    .setDescription('View all users currently spectating the duel'),

  async execute(interaction) {
    if (!duelState.spectators || duelState.spectators.length === 0) {
      return interaction.reply({ content: 'No one is currently spectating.', ephemeral: true });
    }

    const viewers = duelState.spectators.map(id => `<@${id}>`).join('\n');

    return interaction.reply({
      content: `**Current Spectators:**\n${viewers}`,
      ephemeral: true
    });
  }
};
