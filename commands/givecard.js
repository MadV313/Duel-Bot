// commands/givecard.js

import fs from 'fs';
import path from 'path';
import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { weightedRandomCards } from '../utils/cardPicker.js';
import { getCardRarity } from '../utils/cardRarity.js';
import { isAllowedChannel } from '../utils/checkChannel.js';
import fs from "fs/promises";
const config = JSON.parse(await fs.readFile(new URL("../config.json", import.meta.url)));

const decksPath = path.resolve('./data/linked_decks.json');
const revealDir = path.resolve('./public/data');

export default {
  data: new SlashCommandBuilder()
    .setName('givecard')
    .setDescription('Admin: Give a card pack to a player')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to receive card pack')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!isAllowedChannel(interaction.channelId, ['manageCards'])) {
      return interaction.reply({
        content: 'This command can only be used in #manage-cards.',
        ephemeral: true
      });
    }

    const user = interaction.options.getUser('user');
    const userId = user.id;
    const username = user.username;

    let decks = {};
    try {
      if (fs.existsSync(decksPath)) {
        decks = JSON.parse(fs.readFileSync(decksPath));
      }
    } catch (err) {
      console.error('Failed to read decks:', err);
      return interaction.reply({ content: 'Failed to load player decks.', ephemeral: true });
    }

    const userDeck = decks[userId]?.deck || [];

    if (userDeck.length >= config.coin_system.max_card_collection_size) {
      return interaction.reply({
        content: 'Player must have fewer than 248 cards to receive a pack.',
        ephemeral: true
      });
    }

    const previous = new Set(userDeck);
    const newCards = weightedRandomCards(3);
    newCards.forEach(card => userDeck.push(card));

    decks[userId] = {
      discordName: username,
      deck: userDeck
    };

    try {
      fs.writeFileSync(decksPath, JSON.stringify(decks, null, 2));
    } catch (err) {
      console.error('Failed to save updated deck:', err);
      return interaction.reply({ content: 'Could not update the player’s deck.', ephemeral: true });
    }

    const revealPayload = {
      title: 'New Card Pack Unlocked!',
      cards: newCards.map(cardId => ({
        cardId,
        rarity: getCardRarity(cardId),
        newUnlock: !previous.has(cardId)
      })),
      autoCloseIn: 10
    };

    try {
      if (!fs.existsSync(revealDir)) {
        fs.mkdirSync(revealDir, { recursive: true });
      }
      const revealFilePath = path.join(revealDir, `reveal_${userId}.json`);
      fs.writeFileSync(revealFilePath, JSON.stringify(revealPayload, null, 2));
    } catch (err) {
      console.error('Failed to write reveal file:', err);
      return interaction.reply({ content: 'Failed to prepare pack reveal.', ephemeral: true });
    }

    return interaction.reply({
      content: `✅ Cards given to <@${userId}>! [Click to reveal](${config.ui_urls.pack_reveal_ui}?user=${userId})`,
      ephemeral: false,
      allowedMentions: { users: [userId] }
    });
  }
};
