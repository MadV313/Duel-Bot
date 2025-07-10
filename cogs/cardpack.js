// cogs/cardpack.js — Admin-only command to send a pack of 3 random cards via DM

import fs from 'fs/promises';
import path from 'path';
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  UserSelectMenuBuilder,
  ComponentType,
  EmbedBuilder
} from 'discord.js';

const ADMIN_ROLE_ID = '1173049392371085392';
const ADMIN_CHANNEL_ID = '1368023977519222895';

const linkedDecksPath = path.resolve('./data/linked_decks.json');
const cardListPath = path.resolve('./logic/CoreMasterReference.json');
const revealOutputPath = path.resolve('./public/data');

export default async function registerCardPack(client) {
  const commandData = new SlashCommandBuilder()
    .setName('cardpack')
    .setDescription('Admin only: Send a pack of 3 random cards to a user.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

  client.slashData.push(commandData.toJSON());

  client.commands.set('cardpack', {
    data: commandData,
    async execute(interaction) {
      if (!interaction.member?.roles?.cache?.has(ADMIN_ROLE_ID)) {
        return interaction.reply({ content: '🚫 You do not have permission to use this command.', ephemeral: true });
      }

      if (interaction.channelId !== ADMIN_CHANNEL_ID) {
        return interaction.reply({ content: '❌ This command must be used in the admin-tools channel.', ephemeral: true });
      }

      const userSelectRow = new ActionRowBuilder().addComponents(
        new UserSelectMenuBuilder()
          .setCustomId('cardpack_user_select')
          .setPlaceholder('👤 Select a player to send a card pack')
          .setMaxValues(1)
      );

      await interaction.reply({
        content: '🎯 Choose the player to receive the card pack:',
        components: [userSelectRow],
        ephemeral: true
      });

      const userSelection = await interaction.channel.awaitMessageComponent({
        componentType: ComponentType.UserSelect,
        time: 30_000,
        filter: i => i.user.id === interaction.user.id
      }).catch(() => null);

      if (!userSelection) {
        return interaction.editReply({ content: '⌛ Selection timed out.', components: [] });
      }

      const userId = userSelection.values[0];
      const targetUser = await client.users.fetch(userId).catch(() => null);

      if (!targetUser) {
        return userSelection.update({ content: '⚠️ Could not find user.', components: [] });
      }

      let cardList = [];
      try {
        const raw = await fs.readFile(cardListPath, 'utf-8');
        cardList = JSON.parse(raw).filter(card => card.card_id !== '000');
      } catch (err) {
        console.error('❌ Failed to load card list:', err);
        return userSelection.update({ content: '⚠️ Failed to load card list.', components: [] });
      }

      const rarityWeights = { Common: 5, Uncommon: 3, Rare: 2, Legendary: 1 };

      function weightedRandomCard() {
        const pool = cardList.flatMap(card =>
          Array(rarityWeights[card.rarity] || 1).fill(card)
        );
        const selected = structuredClone(pool[Math.floor(Math.random() * pool.length)]);
        return selected;
      }

      const drawnCards = [
        weightedRandomCard(),
        weightedRandomCard(),
        weightedRandomCard()
      ];

      const linkedRaw = await fs.readFile(linkedDecksPath, 'utf-8');
      const linkedData = JSON.parse(linkedRaw);
      const userProfile = linkedData[userId] || {
        discordName: targetUser.username,
        collection: {}
      };

      const revealJson = [];
      for (const card of drawnCards) {
        const ownedCount = userProfile.collection[card.card_id] || 0;
        const isNew = ownedCount === 0;

        userProfile.collection[card.card_id] = ownedCount + 1;

        revealJson.push({
          card_id: `#${card.card_id}`,
          name: card.name,
          rarity: card.rarity || 'Common',
          filename: `${card.card_id}_${card.name.replace(/[^a-zA-Z0-9.]/g, '')}_${card.type}.png`,
          isNew,
          owned: userProfile.collection[card.card_id]
        });
      }

      linkedData[userId] = userProfile;

      await fs.writeFile(linkedDecksPath, JSON.stringify(linkedData, null, 2));
      await fs.mkdir(revealOutputPath, { recursive: true }); // Ensure folder exists
      await fs.writeFile(path.join(revealOutputPath, `reveal_${userId}.json`), JSON.stringify(revealJson, null, 2));

      try {
        await targetUser.send({
          embeds: [
            new EmbedBuilder()
              .setTitle('🎁 You’ve received a new card pack!')
              .setDescription('Click below to open your 3-card reveal.')
              .setURL(`https://madv313.github.io/Pack-Reveal-UI/?userId=${userId}`)
              .setColor(0x00ccff)
          ],
          content: `🔓 [Open Your Pack](https://madv313.github.io/Pack-Reveal-UI/?uid=${userId})`
        });
      } catch (err) {
        console.warn(`⚠️ Could not DM user ${userId}`, err);
        return userSelection.update({ content: '⚠️ Cards granted, but failed to send DM.', components: [] });
      }

      return userSelection.update({
        content: `✅ Pack sent to <@${userId}> and 3 cards added to their collection.`,
        components: []
      });
    }
  });
}
