// commands/viewdeck.js

import { SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('viewdeck')
    .setDescription('View your current deck in the Deck Builder UI'),

  async execute(interaction) {
    const userId = interaction.user.id;
    const url = `https://your-username.github.io/Deck-Builder-UI/?user=${userId}`;

    return interaction.reply({
      content: `Here’s your current deck: [Open Deck Builder](${url})`,
      ephemeral: true
    });
  }
};
