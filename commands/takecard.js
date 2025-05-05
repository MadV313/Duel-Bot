import fs from 'fs';
import path from 'path';
import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { isAllowedChannel } from '../utils/checkChannel.js';

const decksPath = path.resolve('./data/linked_decks.json');

export default {
  data: new SlashCommandBuilder()
    .setName('takecard')
    .setDescription('Admin: Remove cards from a player’s deck')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Player to remove cards from')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('cardid')
        .setDescription('Card ID to remove (e.g. 045)')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('quantity')
        .setDescription('Number of cards to remove')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    // Restrict to #manage-cards
    if (!isAllowedChannel(interaction.channelId, ['manageCards'])) {
      return interaction.reply({
        content: 'This command can only be used in #manage-cards.',
        ephemeral: true
      });
    }

    const user = interaction.options.getUser('user');
    const userId = user.id;
    const cardId = interaction.options.getString('cardid');
    const quantity = interaction.options.getInteger('quantity');

    if (quantity < 1) {
      return interaction.reply({ content: 'You must remove at least 1 card.', ephemeral: true });
    }

    let decks = {};
    try {
      if (fs.existsSync(decksPath)) {
        decks = JSON.parse(fs.readFileSync(decksPath));
      }
    } catch (err) {
      console.error('Error loading decks:', err);
      return interaction.reply({ content: 'Failed to load deck data.', ephemeral: true });
    }

    const userDeck = decks[userId]?.deck || [];
    const owned = userDeck.filter(c => c === cardId).length;

    if (owned < quantity) {
      return interaction.reply({
        content: `Player only owns ${owned} of card #${cardId}.`,
        ephemeral: true
      });
    }

    // Remove cards
    let removed = 0;
    decks[userId].deck = userDeck.filter(c => {
      if (c === cardId && removed < quantity) {
        removed++;
        return false;
      }
      return true;
    });

    try {
      fs.writeFileSync(decksPath, JSON.stringify(decks, null, 2));
    } catch (err) {
      console.error('Failed to update deck:', err);
      return interaction.reply({ content: 'Could not save updated deck.', ephemeral: true });
    }

    return interaction.reply({
      content: `✅ Removed ${quantity}x card #${cardId} from ${user.username}.`,
      ephemeral: true
    });
  }
};
