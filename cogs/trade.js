// cogs/trade.js — Start a trade with another linked player.
// Creates a trade session and DMs you a tokenized link to pick your cards.

import fs from 'fs/promises';
import path from 'path';
import {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from 'discord.js';

const linkedDecksPath = path.resolve('./data/linked_decks.json');

// Channel restriction (same as /linkdeck)
const MANAGE_CARDS_CHANNEL_ID = String(process.env.MANAGE_CARDS_CHANNEL_ID || '1367977677658656868');

function trimBase(u = '') { return String(u).trim().replace(/\/+$/, ''); }

function loadConfig() {
  try {
    const raw = process.env.CONFIG_JSON;
    if (raw) return JSON.parse(raw);
  } catch {}
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return JSON.parse(require('fs').readFileSync('config.json', 'utf-8')) || {};
  } catch { return {}; }
}

export default async function registerTrade(bot) {
  const cmd = new SlashCommandBuilder()
    .setName('trade')
    .setDescription('Start a card trade with another linked player (3 trades/day).');

  bot.slashData.push(cmd.toJSON());

  bot.commands.set('trade', {
    data: cmd,
    async execute(interaction) {
      // Channel restriction
      if (String(interaction.channelId) !== MANAGE_CARDS_CHANNEL_ID) {
        return interaction.reply({
          content: `⚠️ This command can only be used in <#${MANAGE_CARDS_CHANNEL_ID}>.`,
          ephemeral: true
        });
      }

      // Load linked profiles to build the list (exclude self)
      let linked = {};
      try {
        linked = JSON.parse(await fs.readFile(linkedDecksPath, 'utf-8'));
      } catch {
        return interaction.reply({ content: '⚠️ No linked users found yet.', ephemeral: true });
      }

      const userId = interaction.user.id;
      const mine = linked[userId];
      if (!mine?.token) {
        return interaction.reply({ content: '❌ You must link first: use **/linkdeck** in #manage-cards.', ephemeral: true });
      }

      const entries = Object.entries(linked).filter(([id]) => id !== userId);
      if (!entries.length) {
        return interaction.reply({ content: '⚠️ No other linked users available to trade with.', ephemeral: true });
      }

      const pageSize = 25;
      let page = 0;
      const pages = Math.ceil(entries.length / pageSize);

      const build = (p) => {
        const slice = entries.slice(p * pageSize, (p + 1) * pageSize);
        const row = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`trade_select_${p}`)
            .setPlaceholder('Select a player to trade with')
            .addOptions(slice.map(([id, data]) => ({
              label: data.discordName || id,
              value: id
            })))
        );
        const buttons = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('prev').setStyle(ButtonStyle.Secondary).setLabel('⏮ Prev').setDisabled(p === 0),
          new ButtonBuilder().setCustomId('next').setStyle(ButtonStyle.Secondary).setLabel('Next ⏭').setDisabled(p === pages - 1),
        );
        return { row, buttons, text: `Page ${p + 1} of ${pages}` };
      };

      const first = build(page);
      const msg = await interaction.reply({
        content: `🔁 Choose a player to trade with\n${first.text}`,
        components: [first.row, first.buttons],
        ephemeral: true,
        fetchReply: true
      });

      const btnCollector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60_000 });
      btnCollector.on('collect', async i => {
        if (i.user.id !== userId) return i.reply({ content: '⚠️ Not your menu.', ephemeral: true });
        if (i.customId === 'prev') page = Math.max(0, page - 1);
        if (i.customId === 'next') page = Math.min(pages - 1, page + 1);
        const built = build(page);
        await i.update({ content: `🔁 Choose a player to trade with\n${built.text}`, components: [built.row, built.buttons] });
      });

      const ddCollector = msg.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 60_000 });
      ddCollector.on('collect', async i => {
        if (i.user.id !== userId) return i.reply({ content: '⚠️ Not your menu.', ephemeral: true });
        await i.deferUpdate();

        const partnerId = i.values[0];
        const cfg = loadConfig();

        const API_BASE = trimBase(cfg.api_base || process.env.API_BASE || '');
        const UI_BASE  = trimBase(
          cfg.collection_ui ||
          cfg.ui_urls?.card_collection_ui ||
          cfg.frontend_url ||
          cfg.ui_base ||
          'https://madv313.github.io/Card-Collection-UI'
        );
        const BOT_KEY  = process.env.BOT_API_KEY || '';

        if (!API_BASE || !BOT_KEY) {
          return interaction.editReply({
            content: '⚠️ Server is missing API_BASE or BOT_API_KEY. Ask an admin.',
            components: []
          });
        }

        // Create session (bot-only). Prefer initiatorToken per backend contract.
        let resp, json;
        try {
          resp = await fetch(`${API_BASE}/trade/start`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Bot-Key': BOT_KEY
            },
            body: JSON.stringify({
              initiatorToken: mine.token,
              partnerId,
              // Optional hints for backend link building:
              apiBase: API_BASE,
              collectionUiBase: UI_BASE
            })
          });
          json = await resp.json().catch(() => ({}));
        } catch (e) {
          return interaction.editReply({ content: `❌ Failed to contact server: ${String(e)}`, components: [] });
        }

        if (!resp.ok) {
          const msg = json?.error || json?.message || `${resp.status} ${resp.statusText}`;
          return interaction.editReply({ content: `❌ Could not start trade: ${msg}`, components: [] });
        }

        const sessionId = json.sessionId || json.session || '';
        // Prefer backend-provided URL; otherwise construct client-side
        const urlInitiator =
          json.urlInitiator ||
          `${UI_BASE}/?mode=trade&tradeSession=${encodeURIComponent(sessionId)}&role=initiator&token=${encodeURIComponent(mine.token)}&api=${encodeURIComponent(API_BASE)}`;

        // Try DM first (clean UX)
        try {
          await interaction.user.send(
            `🤝 **Trade started!**\n` +
            `Partner: <@${partnerId}>\n` +
            `Session: \`${sessionId}\`\n\n` +
            `👉 **Open your collection to pick up to 3 cards:** ${urlInitiator}`
          );
        } catch {
          // DM might be closed; fall back to ephemeral reply only
        }

        await interaction.editReply({
          content:
            `✅ Trade session created with <@${partnerId}>.\n` +
            `I’ve sent you a link${
              json.urlInitiator ? '' : ' (constructed)'
            } to pick your cards.\n` +
            `Session: \`${sessionId}\`\n\n` +
            `If you didn’t get a DM, click here: ${urlInitiator}`,
          components: []
        });

        // Stop collectors after success
        try { btnCollector.stop(); } catch {}
        try { ddCollector.stop(); } catch {}
      });

      // Auto-cleanup on timeout
      const endAll = async () => {
        if (msg.editable) {
          try {
            await interaction.editReply({
              content: '⏰ Trade partner selection expired. Run **/trade** again to restart.',
              components: []
            });
          } catch {}
        }
      };
      btnCollector.on('end', (_c, r) => { if (r === 'time') endAll(); });
      ddCollector.on('end', (_c, r) => { if (r === 'time') endAll(); });
    }
  });
}
