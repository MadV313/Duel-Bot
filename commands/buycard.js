// commands/buycard.js

import fs from 'fs';
import path from 'path';
import { weightedRandomCards } from '../utils/cardPicker.js';

const coinBankPath = path.resolve('./data/coin_bank.json');
const linkedDecksPath = path.resolve('./data/linked_decks.json');

export default {
  name: 'buycard',
  description: 'Buy a card pack (3 random cards for 3 coins)',

  async execute(interaction) {
    const userId = interaction.user.id;

    let coinBank = {};
    let decks = {};

    try {
      if (fs.existsSync(coinBankPath)) {
        coinBank = JSON.parse(fs.readFileSync(coinBankPath));
      }
      if (fs.existsSync(linkedDecksPath)) {
        decks = JSON.parse(fs.readFileSync(linkedDecksPath));
      }
    } catch (err) {
      console.error('Failed to read data:', err);
      return interaction.reply({ content: 'Internal error occurred.', ephemeral: true });
    }

    const balance = coinBank[userId] || 0;
    if (balance < 3) {
      return interaction.reply({ content: 'You need 3 coins to buy a card pack.', ephemeral: true });
    }

    const currentDeck = decks[userId]?.deck || [];
    if (currentDeck.length >= 248) {
      return interaction.reply({
        content: 'You must have a maximum of 247 cards in your collection to buy more or make room.',
        ephemeral: true
      });
    }

    const newCards = weightedRandomCards(3);
    const updatedDeck = [...currentDeck, ...newCards];

    decks[userId] = {
      discordName: interaction.user.username,
      deck: updatedDeck
    };
    coinBank[userId] = balance - 3;

    try {
      fs.writeFileSync(linkedDecksPath, JSON.stringify(decks, null, 2));
      fs.writeFileSync(coinBankPath, JSON.stringify(coinBank, null, 2));
    } catch (err) {
      console.error('Failed to save updates:', err);
      return interaction.reply({ content: 'Purchase failed. Try again.', ephemeral: true });
    }

    return interaction.reply({
      content: `✅ You bought a card pack: ${newCards.join(', ')}\n\nPack will reveal in your UI.`,
      ephemeral: true
    });
  }
};
