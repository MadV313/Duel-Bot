// cogs/duelcard.js — Admin-only card give/take command
// Updates:
//  • Ensures the target player has a token (mint if missing) for Collection UI deep-linking
//  • Normalizes collection keys to 3-digit IDs (001, 002, ...)
//  • Adds a tokenized "View Collection" link in the confirmation (uses CONFIG.api_base + collection_ui)
//  • Restores card image URL to your GitHub Pages host
//  • Final confirmation messages are NON-EPHEMERAL so admins see them

import fs from 'fs/promises';
import path from 'path';
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder
} from 'discord.js';
import crypto from 'crypto';

const ADMIN_ROLE_ID = '1173049392371085392';
const ADMIN_CHANNEL_ID = '1368023977519222895';

const linkedDecksPath = path.resolve('./data/linked_decks.json');
const cardListPath = path.resolve('./logic/CoreMasterReference.json');

// ------------ Config helpers ------------
function loadConfig() {
  try {
    const raw = process.env.CONFIG_JSON;
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn(`[duelcard] CONFIG_JSON parse error: ${e?.message}`);
  }
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return JSON.parse(require('fs').readFileSync('config.json', 'utf-8')) || {};
  } catch {
    return {};
  }
}
function trimBase(u = '') { return String(u).trim().replace(/\/+$/, ''); }
function resolveCollectionBase(cfg) {
  return trimBase(
    cfg.collection_ui ||
    cfg.ui_urls?.card_collection_ui ||
    cfg.frontend_url ||
    cfg.ui_base ||
    cfg.UI_BASE ||
    'https://madv313.github.io/Card-Collection-UI'
  );
}
function resolveApiBase(cfg) {
  return trimBase(cfg.api_base || cfg.API_BASE || process.env.API_BASE || '');
}
function resolveImageBase(cfg) {
  // Restore your GitHub Pages image host by default
  return trimBase(cfg.image_base || cfg.IMAGE_BASE || 'https://madv313.github.io/images/cards');
}

// ------------ Utility helpers ------------
function pad3(n) {
  return String(n).padStart(3, '0');
}
function sanitize(s = '') {
  return String(s).replace(/[^a-zA-Z0-9._-]/g, '');
}
function makeFilename(id3, name, type) {
  return `${pad3(id3)}_${sanitize(name || 'Card')}_${sanitize(type || 'Unknown')}.png`;
}
function randomToken(len = 24) {
  return crypto.randomBytes(Math.ceil((len * 3) / 4)).toString('base64url').slice(0, len);
}

// ------------ File I/O helpers ------------
async function readJson(file, fallback = {}) {
  try {
    const raw = await fs.readFile(file, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

export default async function registerDuelCard(client) {
  const CFG = loadConfig();
  const COLLECTION_BASE = resolveCollectionBase(CFG);
  const API_BASE = resolveApiBase(CFG);
  const IMAGE_BASE = resolveImageBase(CFG);
  const apiQP = API_BASE ? `&api=${encodeURIComponent(API_BASE)}` : '';

  const commandData = new SlashCommandBuilder()
    .setName('duelcard')
    .setDescription('Admin only: Give or take cards from a player.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

  client.slashData.push(commandData.toJSON());

  client.commands.set('duelcard', {
    data: commandData,
    async execute(interaction) {
      const timestamp = new Date().toISOString();
      const executor = `${interaction.user.username} (${interaction.user.id})`;

      try {
        console.log(`[${timestamp}] 🔸 /duelcard triggered by ${executor}`);

        const isAdmin = interaction.member?.roles?.cache?.has(ADMIN_ROLE_ID);
        if (!isAdmin) {
          return interaction.reply({ content: '🚫 You do not have permission to use this command.', ephemeral: true });
        }

        if (interaction.channelId !== ADMIN_CHANNEL_ID) {
          return interaction.reply({
            content: '❌ This command MUST be used in the SV13 TCG - admin tools channel.',
            ephemeral: true
          });
        }

        const modeRow = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('duelcard_mode')
            .setPlaceholder('🃏 Choose action')
            .addOptions([
              { label: 'Give Card', value: 'give' },
              { label: 'Take Card', value: 'take' }
            ])
        );

        await interaction.reply({
          content: '🃏 Select whether to give or take a card:',
          components: [modeRow],
          ephemeral: true
        });

        const modeSelect = await interaction.channel.awaitMessageComponent({
          componentType: ComponentType.StringSelect,
          time: 30_000
        });

        try {
          await modeSelect.deferUpdate();
        } catch (err) {
          console.warn('⚠️ Mode select interaction expired or failed:', err);
          return;
        }

        const actionMode = modeSelect.values[0];
        await interaction.editReply({ content: '✅ Mode selected. Loading players...', components: [] });

        let linkedData = {};
        try {
          linkedData = await readJson(linkedDecksPath, {});
        } catch {
          return interaction.editReply({ content: '⚠️ Could not load linked users.' });
        }

        const entries = Object.entries(linkedData);
        if (entries.length === 0) {
          return interaction.editReply({ content: '⚠️ No linked profiles found.' });
        }

        const pageSize = 25;
        let userPage = 0;
        const userPages = Math.ceil(entries.length / pageSize);

        const generateUserPage = (page) => {
          const slice = entries.slice(page * pageSize, (page + 1) * pageSize);
          const options = slice.map(([id, data]) => ({ label: data.discordName, value: id }));

          const embed = new EmbedBuilder()
            .setTitle(`👤 Select Target Player`)
            .setDescription(`Page ${page + 1} of ${userPages}`);

          const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('prev_user_page').setLabel('⏮ Prev').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
            new ButtonBuilder().setCustomId('next_user_page').setLabel('Next ⏭').setStyle(ButtonStyle.Secondary).setDisabled(page === userPages - 1)
          );

          const dropdown = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('duelcard_user_select')
              .setPlaceholder('Select a player')
              .addOptions(options)
          );

          return { embed, buttons, dropdown };
        };

        const updateUserPage = async () => {
          const { embed, buttons, dropdown } = generateUserPage(userPage);
          await interaction.editReply({ embeds: [embed], components: [dropdown, buttons] });
        };

        await updateUserPage();

        const userCollector = interaction.channel.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60_000 });
        const userSelectCollector = interaction.channel.createMessageComponentCollector({
          componentType: ComponentType.StringSelect,
          time: 60_000
        });

        userCollector.on('collect', async i => {
          if (i.user.id !== interaction.user.id) return;
          await i.deferUpdate();
          if (i.customId === 'prev_user_page') userPage--;
          if (i.customId === 'next_user_page') userPage++;
          await updateUserPage();
        });

        userSelectCollector.on('collect', async select => {
          if (select.user.id !== interaction.user.id || !select.customId.includes('duelcard_user_select')) return;
          userCollector.stop();
          userSelectCollector.stop();

          await select.deferUpdate();

          const targetId = select.values[0];
          const playerProfile = linkedData[targetId];
          const targetName = playerProfile?.discordName || 'Unknown';

          console.log(`[${timestamp}] 🎯 ${executor} selected ${targetName} (${targetId})`);

          // Ensure token for the player (for collection UI deep link)
          if (!playerProfile.token || typeof playerProfile.token !== 'string' || playerProfile.token.length < 12) {
            playerProfile.token = randomToken(24);
            await writeJson(linkedDecksPath, linkedData);
          }

          // Load card data
          let cardData = [];
          try {
            const raw = await fs.readFile(cardListPath, 'utf-8');
            const parsed = JSON.parse(raw);
            cardData = Array.isArray(parsed) ? parsed : (parsed.cards || []);
          } catch {
            return interaction.editReply({ content: '⚠️ Could not load card data.' });
          }

          // Normalize and filter out #000
          let filteredCards = cardData
            .map(c => ({ ...c, card_id: pad3(c.card_id) }))
            .filter(card => card.card_id !== '000');

          if (actionMode === 'take') {
            const owned = playerProfile.collection || {};
            filteredCards = filteredCards.filter(card => Number(owned[pad3(card.card_id)]) > 0);
          }

          const cardOptions = filteredCards.map(card => ({
            label: `${card.card_id} ${card.name}`.slice(0, 100),
            value: String(card.card_id)
          }));

          if (actionMode === 'give') {
            cardOptions.unshift({ label: '🎲 Random Card', value: 'RANDOM_CARD' });
          }

          const cardPageSize = 25;
          let cardPage = 0;
          const cardPages = Math.ceil(cardOptions.length / cardPageSize);

          const generateCardPage = (page) => {
            const pageSlice = cardOptions.slice(page * cardPageSize, (page + 1) * cardPageSize);
            const embed = new EmbedBuilder()
              .setTitle(`${actionMode === 'give' ? '🟢 GIVE' : '🔴 TAKE'} a Card`)
              .setDescription(`Select a card for **${targetName}**\nPage ${page + 1} of ${cardPages}`);

            const buttons = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('prev_card_page').setLabel('⏮ Prev').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
              new ButtonBuilder().setCustomId('next_card_page').setLabel('Next ⏭').setStyle(ButtonStyle.Secondary).setDisabled(page === cardPages - 1)
            );

            const dropdown = new ActionRowBuilder().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId('duelcard_card_select')
                .setPlaceholder('Select a card')
                .addOptions(pageSlice)
            );

            return { embed, buttons, dropdown };
          };

          const firstRender = generateCardPage(cardPage);
          const cardMsg = await interaction.editReply({
            embeds: [firstRender.embed],
            components: [firstRender.dropdown, firstRender.buttons],
            fetchReply: true
          });

          const cardCollector = cardMsg.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 60_000,
            filter: i => i.message.id === cardMsg.id && i.user.id === interaction.user.id
          });

          cardCollector.on('collect', async btn => {
            if (btn.customId === 'prev_card_page') cardPage--;
            if (btn.customId === 'next_card_page') cardPage++;

            const update = generateCardPage(cardPage);
            try {
              await btn.update({ embeds: [update.embed], components: [update.dropdown, update.buttons] });
            } catch (err) {
              console.warn('⚠️ Failed to update card page:', err);
              try {
                await cardMsg.edit({ embeds: [update.embed], components: [update.dropdown, update.buttons] });
              } catch (editErr) {
                console.error('❌ Could not fallback-edit cardMsg:', editErr);
              }
            }
          });

          const selectCollector = cardMsg.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 60_000,
            filter: i => i.message.id === cardMsg.id && i.user.id === interaction.user.id
          });

          selectCollector.on('collect', async cardSelect => {
            let selectedId = cardSelect.values[0];

            if (selectedId === 'RANDOM_CARD') {
              const random = filteredCards[Math.floor(Math.random() * filteredCards.length)];
              selectedId = random.card_id;
            }

            const cardId3 = pad3(selectedId);
            const player = linkedData[targetId];
            const collection = player.collection || {};
            const selectedCard = filteredCards.find(c => c.card_id === cardId3) ||
                                 cardData.find(c => pad3(c.card_id) === cardId3) || {};

            if (actionMode === 'give') {
              collection[cardId3] = Number(collection[cardId3] || 0) + 1;
            } else {
              if (!collection[cardId3]) {
                return cardSelect.reply({ content: '⚠️ That player doesn’t own this card.', ephemeral: true });
              }
              collection[cardId3] = Number(collection[cardId3] || 0) - 1;
              if (collection[cardId3] <= 0) delete collection[cardId3];
            }

            player.collection = collection;

            // Ensure token still present
            if (!player.token || typeof player.token !== 'string' || player.token.length < 12) {
              player.token = randomToken(24);
            }

            await writeJson(linkedDecksPath, linkedData);

            const verb = actionMode === 'give' ? 'given to' : 'taken from';
            const adminTag = `<@${interaction.user.id}>`;
            const targetTag = `<@${targetId}>`;

            const imgFile = makeFilename(cardId3, selectedCard?.name, selectedCard?.type);
            // ✅ Restored to GitHub Pages image host
            const imageUrl = `${IMAGE_BASE}/${imgFile}`;

            const embed = new EmbedBuilder()
              .setTitle(`✅ Card ${verb}`)
              .setDescription(`Card **${cardId3} ${selectedCard?.name || ''}** ${verb} ${targetTag} by ${adminTag}.`)
              .setImage(imageUrl)
              .setColor(actionMode === 'give' ? 0x00cc66 : 0xcc0000);

            // Include a tokenized collection link for quick verification
            const collectionUrl = `${COLLECTION_BASE}/?token=${encodeURIComponent(player.token)}${apiQP}`;

            // ➜ Final confirmation is NON-EPHEMERAL so other admins can see it
            await interaction.followUp({
              embeds: [embed],
              content: `📒 **View ${targetName}'s Collection:** ${collectionUrl}`,
              ephemeral: false
            });
          });
        });
      } catch (err) {
        console.error(`❌ Fatal error in /duelcard:`, err);
        if (!interaction.replied) {
          return interaction.reply({ content: '❌ Something went wrong in /duelcard.', ephemeral: true });
        }
        return interaction.editReply({ content: '❌ Something went wrong after interaction started.', ephemeral: true });
      }
    }
  });
}
