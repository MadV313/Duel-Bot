// commands/watch.js

import { SlashCommandBuilder } from 'discord.js';
import { duelState } from '../logic/duelState.js';

export default {
  data: new SlashCommandBuilder()
    .setName('watch')
    .setDescription('Join the current duel as a spectator'),

  async execute(interaction) {
    const userId = interaction.user.id;
    const username = interaction.user.username;

    if (!duelState.spectators.includes(userId)) {
      duelState.spectators.push(userId);
    }

    return interaction.reply({
      content: `You are now watching the duel! Open the UI here:\nhttps://your-spectator-ui-link.com?duelId=current&user=${username}`,
      ephemeral: true
    });
  }
};
