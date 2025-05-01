// commands/givecard.js

import fs from 'fs';
import path from 'path';
import { SlashCommandBuilder } from 'discord.js';
import { weightedRandomCards } from '../utils/cardPicker.js';

const linkedDecksPath = path.resolve('./data/linked_decks.json');

export default {
  data: new SlashCommandBuilder()
    .setName('givecard')
    .setDescription('Admin: Give a card pack (3 cards) to a user')
    .addUserOption(option =>
      option.setName('target')
        .setDescription('User to receive the card pack')
        .setRequired(true)
    ),

  async execute(interaction) {
    // Only allow admins to run this
    if (!interaction.member.permissions.has('Administrator')) {
      return interaction.reply({ content: 'Only admins can use this command.', ephemeral: true });
    }

    const targetUser = interaction.options.getUser('target');
    const userId = targetUser.id;

    let decks = {};
    try {
      if (fs.existsSync(linkedDecksPath)) {
        decks = JSON.parse(fs.readFileSync(linkedDecksPath));
      }
    } catch (err) {
      console.error('Failed to read linked decks:', err);
      return interaction.reply({ content: 'Failed to load decks.', ephemeral: true });
    }

    // Generate 3 weighted random cards
    const newCards = weightedRandomCards(3);
    const userDeck = decks[userId]?.deck || [];

    newCards.forEach(card => userDeck.push(card));
    decks[userId] = {
      discordName: targetUser.username,
      deck: userDeck
    };

    try {
      fs.writeFileSync(linkedDecksPath, JSON.stringify(decks, null, 2));
    } catch (err) {
      console.error('Failed to save deck after giving cards:', err);
      return interaction.reply({ content: 'Failed to save new cards.', ephemeral: true });
    }

    const revealUrl = `https://your-packreveal-ui-link.com?cards=${newCards.join(',')}`;

    return interaction.reply({
      content: `✅ Gave ${targetUser.username} a card pack!\n[Click to reveal their cards](${revealUrl})`,
      ephemeral: true
    });
  }
};
