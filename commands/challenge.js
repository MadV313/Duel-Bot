// commands/challenge.js

import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import { isAllowedChannel } from '../utils/checkChannel.js';
import fs from 'fs';
import path from 'path';

const coinBankPath = path.resolve('./data/coin_bank.json');

export default {
  data: new SlashCommandBuilder()
    .setName('challenge')
    .setDescription('Challenge another player to a duel')
    .addUserOption(option =>
      option.setName('opponent')
        .setDescription('Select the player to challenge')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('wager')
        .setDescription('Optional coin wager (0–10)')
        .setRequired(false)
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
    const wager = interaction.options.getInteger('wager') || 0;

    if (challenger.id === opponent.id) {
      return interaction.reply({ content: 'You cannot challenge yourself.', ephemeral: true });
    }

    if (wager < 0 || wager > 10) {
      return interaction.reply({
        content: 'Wager must be between 0 and 10 coins.',
        ephemeral: true
      });
    }

    // Read coin balances
    let coinBank = {};
    try {
      if (fs.existsSync(coinBankPath)) {
        coinBank = JSON.parse(fs.readFileSync(coinBankPath));
      }
    } catch (err) {
      console.error('Failed to read coin bank:', err);
    }

    const challengerCoins = coinBank[challenger.id] || 0;
    if (wager > challengerCoins) {
      return interaction.reply({
        content: `You only have ${challengerCoins} coins and cannot wager ${wager}.`,
        ephemeral: true
      });
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`accept_${challenger.id}_${wager}`)
        .setLabel(`Accept Duel${wager > 0 ? ` (Wager: ${wager})` : ''}`)
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`deny_${challenger.id}`)
        .setLabel('Deny')
        .setStyle(ButtonStyle.Danger)
    );

    return interaction.reply({
      content: `⚔️ <@${challenger.id}> has challenged <@${opponent.id}> to a duel${wager > 0 ? ` with a wager of ${wager} coins` : ''}!`,
      components: [row],
      allowedMentions: { users: [challenger.id, opponent.id] }
    });
  }
};
