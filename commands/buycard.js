// commands/buycard.js

import fs from 'fs';
import path from 'path';
import { weightedRandomCards } from '../utils/cardPicker.js';
import { getCardRarity } from '../utils/cardRarity.js';

const decksPath = path.resolve('./data/linked_decks.json');
const coinBankPath = path.resolve('./data/coin_bank.json');
const revealDir = path.resolve('./public/data');

export default {
  data: {
    name: 'buycard',
    description: 'Buy a pack of 3 cards (3 coins required)'
  },

  async execute(interaction) {
    const userId = interaction.user.id;
    const username = interaction.user.username;

    let coinBank = {};
    let decks = {};
    try {
      if (fs.existsSync(coinBankPath)) {
        coinBank = JSON.parse(fs.readFileSync(coinBankPath));
      }
      if (fs.existsSync(decksPath)) {
        decks = JSON.parse(fs.readFileSync(decksPath));
      }
    } catch (err) {
      console.error('Failed reading files:', err);
      return interaction.reply({ content: 'Internal error loading data.', ephemeral: true });
    }

    const balance = coinBank[userId] || 0;
    const userDeck = decks[userId]?.deck || [];

    if (userDeck.length >= 250) {
      return interaction.reply({
        content: 'You must have a maximum of 247 cards in your collection to buy more or make room.',
        ephemeral: true
      });
    }

    if (balance < 3) {
      return interaction.reply({ content: 'You need 3 coins to buy a card pack.', ephemeral: true });
    }

    const previous = new Set(userDeck);
    const newCards = weightedRandomCards(3);
    newCards.forEach(card => userDeck.push(card));

    decks[userId] = {
      discordName: username,
      deck: userDeck
    };
    coinBank[userId] = balance - 3;

    try {
      fs.writeFileSync(decksPath, JSON.stringify(decks, null, 2));
      fs.writeFileSync(coinBankPath, JSON.stringify(coinBank, null, 2));
    } catch (err) {
      console.error('Failed saving decks or coin bank:', err);
      return interaction.reply({ content: 'Failed to complete your purchase.', ephemeral: true });
    }

    // Construct reveal payload
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
      fs.writeFileSync(path.join(revealDir, `reveal_${userId}.json`), JSON.stringify(revealPayload, null, 2));
    } catch (err) {
      console.error('Failed writing reveal file:', err);
      return interaction.reply({ content: 'Purchase completed, but failed to prepare reveal.', ephemeral: true });
    }

    return interaction.reply({
      content: `✅ Pack purchased! [Click to reveal](https://your-frontend-domain.com/packReveal.html?user=${userId})`,
      ephemeral: true
    });
  }
};
