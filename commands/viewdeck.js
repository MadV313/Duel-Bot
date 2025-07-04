// commands/viewdeck.js

import { SlashCommandBuilder } from 'discord.js';
import { isAllowedChannel } from '../utils/checkChannel.js';
import fs from "fs/promises";
const config = JSON.parse(await fs.readFile(new URL("../config.json", import.meta.url)));

export default {
  data: new SlashCommandBuilder()
    .setName('viewdeck')
    .setDescription('View your current deck in the Deck Builder UI'),

  async execute(interaction) {
    // ✅ Enforce correct channel use
    if (!isAllowedChannel(interaction.channelId, ['manageDeck'])) {
      return interaction.reply({
        content: 'This command can only be used in #manage-deck.',
        ephemeral: true
      });
    }

    const userId = interaction.user.id;
    const deckUrl = `${config.ui_urls.deck_builder_ui}?user=${userId}`;

    return interaction.reply({
      content: `🃏 Here’s your current deck: [Open Deck Builder](${deckUrl})`,
      ephemeral: true
    });
  }
};
