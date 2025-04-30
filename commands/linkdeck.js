// commands/linkdeck.js

import fs from 'fs';
import path from 'path';

const linkedDecksPath = path.resolve('./data/linked_decks.json');

export default {
  name: 'link',
  description: 'Link your Discord ID to your current deck.',
  options: [
    {
      name: 'deck',
      type: 3, // STRING
      description: 'Paste your deck JSON string here',
      required: true,
    },
  ],

  execute(interaction) {
    const userId = interaction.user.id;
    const userName = interaction.user.username;
    const deckInput = interaction.options.getString('deck');

    let deck;
    try {
      deck = JSON.parse(deckInput);
      if (!Array.isArray(deck) || deck.length < 20 || deck.length > 40) {
        throw new Error("Deck must be an array of 20–40 cards.");
      }
    } catch (err) {
      return interaction.reply({
        content: `Invalid deck data: ${err.message}`,
        ephemeral: true,
      });
    }

    // Read existing structure
    let existing = { players: [] };
    try {
      if (fs.existsSync(linkedDecksPath)) {
        const raw = fs.readFileSync(linkedDecksPath, 'utf-8');
        existing = JSON.parse(raw);
      }
    } catch (err) {
      console.error("Failed to read linked decks:", err);
    }

    // Update or insert player
    const index = existing.players.findIndex(p => p.discordId === userId);
    if (index >= 0) {
      existing.players[index].deck = deck;
      existing.players[index].discordName = userName;
    } else {
      existing.players.push({ discordId: userId, discordName: userName, deck });
    }

    // Save back
    try {
      fs.writeFileSync(linkedDecksPath, JSON.stringify(existing, null, 2));
      return interaction.reply({ content: '✅ Deck linked successfully!', ephemeral: true });
    } catch (err) {
      console.error("Failed to write linked deck:", err);
      return interaction.reply({ content: '❌ Failed to save your deck.', ephemeral: true });
    }
  },
};
