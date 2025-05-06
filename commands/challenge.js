import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import { isAllowedChannel } from '../utils/checkChannel.js';

export default {
  data: new SlashCommandBuilder()
    .setName('challenge')
    .setDescription('Challenge another player to a duel')
    .addUserOption(option =>
      option.setName('opponent')
        .setDescription('Select the player to challenge')
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!isAllowedChannel(interaction.channelId, ['battlefield'])) {
      return interaction.reply({
        content: 'This command can only be used in #battlefield.',
        ephemeral: true
      });
    }

    const challenger = interaction.user;
    const opponent = interaction.options.getUser('opponent');

    if (challenger.id === opponent.id) {
      return interaction.reply({ content: 'You cannot challenge yourself.', ephemeral: true });
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`accept_${challenger.id}`)
        .setLabel('Accept')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`deny_${challenger.id}`)
        .setLabel('Deny')
        .setStyle(ButtonStyle.Danger)
    );

    return interaction.reply({
      content: `⚔️ <@${challenger.id}> has challenged <@${opponent.id}> to a duel!`,
      components: [row],
      allowedMentions: { users: [challenger.id, opponent.id] }
    });
  }
};
