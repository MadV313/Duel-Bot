// cogs/tradecard.js — Start a trade with another linked player (renamed from /trade to /tradecard).
// - Requires Supporter/Elite role (warns first, with standard copy)
// - Confined to #manage-cards channel (warns if used elsewhere)
// - Warns if player is not linked (must run /linkdeck first)
// - Shows ONLY linked players in the picker
// - Creates a backend trade session and DMs the initiator a tokenized link to pick cards
// - (Optional) Webhook listener: backend notifies the bot when initiator submits;
//    bot DMs the partner with proposal thumbnails + Accept / Deny buttons.
//    Accept => swap cards in linked_decks.json (REMOTE via storageClient); Deny => notify both.

import fs from 'fs/promises'; // kept only for config.json fallback read
import path from 'path';
import http from 'http';
import {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder
} from 'discord.js';

import { loadJSON, saveJSON, PATHS } from '../utils/storageClient.js';
import { adminAlert } from '../utils/adminAlert.js';
import { L } from '../utils/logs.js';
import { requireSupporter } from '../utils/roleGuard.js'; // ✅ role check

/* ---------------- config helpers ---------------- */
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
function trimBase(u = '') { return String(u).trim().replace(/\/+$/, ''); }
function resolveBaseUrl(s) { return (s || '').toString().trim().replace(/\/+$/, ''); }
function isTokenValid(t) { return typeof t === 'string' && /^[A-Za-z0-9_-]{12,128}$/.test(t); }

/* ---------------- runtime state (for Accept/Deny collectors) ---------------- */
const tradeSessionCache = new Map(); // sessionId -> { initiatorId, partnerId, initiatorPicks, partnerPicks }

/* ---------------- thumbnail helper ---------------- */
function cardThumbUrl(filename, CONFIG) {
  const base = CONFIG.image_base || CONFIG.IMAGE_BASE || '';
  if (!base) return null;
  return `${trimBase(base)}/${filename}`;
}

/* ---------------- apply trade to collections ---------------- */
function applySwap(profileA, profileB, picksA = [], picksB = []) {
  for (const p of picksA) {
    const id = String(p.card_id).replace(/^#/, '').padStart(3, '0');
    const q = Math.max(0, Number(p.qty || 0));
    if (!q) continue;
    profileA.collection[id] = Math.max(0, Number(profileA.collection?.[id] || 0) - q);
    profileB.collection[id] = Number(profileB.collection?.[id] || 0) + q;
  }
  for (const p of picksB) {
    const id = String(p.card_id).replace(/^#/, '').padStart(3, '0');
    const q = Math.max(0, Number(p.qty || 0));
    if (!q) continue;
    profileB.collection[id] = Math.max(0, Number(profileB.collection?.[id] || 0) - q);
    profileA.collection[id] = Number(profileA.collection?.[id] || 0) + q;
  }
}

/* ---------------- remote storage wrappers ---------------- */
async function _loadJSONSafe(name) {
  try { return await loadJSON(name); }
  catch (e) { L.storage(`load fail ${name}: ${e.message}`); throw e; }
}
async function _saveJSONSafe(name, data, client) {
  try { await saveJSON(name, data); }
  catch (e) {
    await adminAlert(client, process.env.PAYOUTS_CHANNEL_ID, `${name} save failed: ${e.message}`);
    throw e;
  }
}

/* ---------------- optional webhook server (port-safe) ---------------- */
function startWebhookServerOnce(client, CONFIG) {
  const MAIN_PORT = Number(process.env.PORT || 0); // Railway main port
  const PORT = Number(CONFIG.trade_webhook_port || process.env.TRADE_WEBHOOK_PORT || 0);
  const SECRET = String(CONFIG.trade_webhook_secret || process.env.TRADE_WEBHOOK_SECRET || '');
  if (client.__tradeWebhookStarted) return;

  // If not configured, just skip silently (trade flow still works without webhook)
  if (!PORT) {
    console.log('[tradecard] Webhook disabled (no TRADE_WEBHOOK_PORT set).');
    client.__tradeWebhookStarted = true; // prevent re-attempts
    return;
  }

  // Avoid binding to the same port as Express
  if (MAIN_PORT && PORT === MAIN_PORT) {
    console.warn(`[tradecard] Webhook NOT started: TRADE_WEBHOOK_PORT (${PORT}) equals main PORT (${MAIN_PORT}). Set a different port or mount on Express.`);
    client.__tradeWebhookStarted = true;
    return;
  }

  const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/trade/notify') {
      res.statusCode = 404; return res.end('Not Found');
    }
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const json = JSON.parse(body || '{}');
        if (!SECRET || json.secret !== SECRET) {
          res.statusCode = 401; res.end('Unauthorized'); return;
        }
        const {
          sessionId, initiatorId, partnerId,
          initiatorName, partnerName,
          initiatorPicks = [], partnerPicks = []
        } = json || {};

        tradeSessionCache.set(sessionId, { initiatorId, partnerId, initiatorPicks, partnerPicks });

        const CONFIG2 = loadConfig();
        const thumbs = [];
        for (const p of initiatorPicks) {
          const url = cardThumbUrl(p.filename, CONFIG2);
          thumbs.push(`• **${p.card_id}** ${p.name} (${p.rarity}) × ${p.qty}${url ? ` — [img](${url})` : ''}`);
        }

        const offerText = [
          `**Trade proposal from <@${initiatorId}>**`,
          '',
          '**You would receive:**',
          initiatorPicks.length ? thumbs.join('\n') : '• *(No cards offered)*',
          '',
          '**You would give:**',
          partnerPicks.length
            ? partnerPicks.map(p => {
                const url = cardThumbUrl(p.filename, CONFIG2);
                return `• **${p.card_id}** ${p.name} (${p.rarity}) × ${p.qty}${url ? ` — [img](${url})` : ''}`;
              }).join('\n')
            : '• *(No cards requested)*'
        ].join('\n');

        const embed = new EmbedBuilder()
          .setTitle('🤝 Trade Proposal')
          .setDescription(offerText)
          .setColor(0x00ccff);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`trade_accept_${sessionId}`).setStyle(ButtonStyle.Success).setLabel('Accept ✅'),
          new ButtonBuilder().setCustomId(`trade_deny_${sessionId}`).setStyle(ButtonStyle.Danger).setLabel('Deny ❌')
        );

        try {
          const partnerUser = await client.users.fetch(partnerId);
          await partnerUser.send({ embeds: [embed], components: [row] });
        } catch (e) {
          try {
            const initiatorUser = await client.users.fetch(initiatorId);
            await initiatorUser.send('⚠️ Could not DM your trade partner. Ask them to enable DMs and resubmit.');
          } catch {}
        }

        res.statusCode = 200; res.end('OK');
      } catch (e) {
        res.statusCode = 400; res.end('Bad Request');
      }
    });
  });

  try {
    server.listen(PORT, () => {
      client.__tradeWebhookStarted = true;
      console.log(`[tradecard] Webhook listening on :${PORT}`);
    });
  } catch (err) {
    console.warn(`[tradecard] Webhook listen failed on :${PORT} (${err?.code || err}) — continuing without webhook.`);
    client.__tradeWebhookStarted = true;
  }
}

/* ---------------- command registration ---------------- */
export default async function registerTradeCard(client) {
  const CONFIG = loadConfig();

  const MANAGE_CARDS_CHANNEL_ID =
    String(CONFIG.manage_cards_channel_id || CONFIG.manage_cards || CONFIG['manage-cards'] || '1367977677658656868');

  // Allow env COLLECTION_UI_BASE to override config (per API example)
  const UI_BASE  = trimBase(
    process.env.COLLECTION_UI_BASE ||
    CONFIG.collection_ui ||
    CONFIG.ui_urls?.card_collection_ui ||
    CONFIG.frontend_url ||
    CONFIG.ui_base ||
    'https://madv313.github.io/Card-Collection-UI'
  );

  const API_BASE = trimBase(CONFIG.api_base || process.env.API_BASE || '');
  const BOT_KEY  = process.env.BOT_API_KEY || '';
  const BOT_BEARER = process.env.BOT_AUTH_BEARER || ''; // optional alt header

  startWebhookServerOnce(client, CONFIG);

  const cmd = new SlashCommandBuilder()
    .setName('tradecard')
    .setDescription('Start a card trade with another linked player (3 trades/day).');

  client.slashData.push(cmd.toJSON());

  client.commands.set('tradecard', {
    data: cmd,
    async execute(interaction) {
      // ✅ ROLE GATE
      if (!requireSupporter(interaction.member)) {
        return interaction.reply({
          ephemeral: true,
          content: '❌ You need the **Supporter** or **Elite Collector** role to use this command. Join on Ko-fi to unlock full access.'
        });
      }

      // Channel restriction
      if (String(interaction.channelId) !== MANAGE_CARDS_CHANNEL_ID) {
        return interaction.reply({
          content: `⚠️ This command can only be used in <#${MANAGE_CARDS_CHANNEL_ID}>.`,
          ephemeral: true
        });
      }

      // Load linked profiles (REMOTE)
      let linked = {};
      try {
        linked = await _loadJSONSafe(PATHS.linkedDecks);
      } catch {
        return interaction.reply({ content: '❌ Could not load linked profiles (storage error).', ephemeral: true });
      }

      const userId = interaction.user.id;
      const mine = linked[userId];

      // Not linked warning
      if (!mine?.token || !isTokenValid(mine.token)) {
        return interaction.reply({
          content: '❌ You are not linked yet. Please run **/linkdeck** in **#manage-cards** first.',
          ephemeral: true
        });
      }

      // Build list of OTHER linked players (must have token)
      const entries = Object.entries(linked)
        .filter(([id, data]) => id !== userId && isTokenValid(data?.token));

      if (!entries.length) {
        return interaction.reply({ content: '⚠️ No other linked users available to trade with.', ephemeral: true });
      }

      // Pagination
      const pageSize = 25;
      let page = 0;
      const pages = Math.ceil(entries.length / pageSize);

      const buildPage = (p) => {
        const slice = entries.slice(p * pageSize, (p + 1) * pageSize);
        const row = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`tradecard_select_${p}`)
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

      const first = buildPage(page);
      const msg = await interaction.reply({
        content: `🔁 Choose a player to trade with\n${first.text}`,
        components: [first.row, first.buttons],
        ephemeral: true,
        fetchReply: true
      });

      // Pagination controls
      const btnCollector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 60_000
      });
      btnCollector.on('collect', async i => {
        if (i.user.id !== userId) return i.reply({ content: '⚠️ Not your menu.', ephemeral: true });
        if (i.customId === 'prev') page = Math.max(0, page - 1);
        if (i.customId === 'next') page = Math.min(pages - 1, page + 1);
        const built = buildPage(page);
        await i.update({ content: `🔁 Choose a player to trade with\n${built.text}`, components: [built.row, built.buttons] });
      });

      // Selection handler
      const ddCollector = msg.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 60_000
      });
      ddCollector.on('collect', async i => {
        if (i.user.id !== userId) return i.reply({ content: '⚠️ Not your menu.', ephemeral: true });
        await i.deferUpdate();

        const partnerId = i.values[0];

        if (!API_BASE || (!BOT_KEY && !BOT_BEARER)) {
          return interaction.editReply({
            content: '⚠️ Server is missing API_BASE or bot auth (BOT_API_KEY / BOT_AUTH_BEARER). Ask an admin.',
            components: []
          });
        }

        // 🔎 DEBUG: confirm envs are present at runtime
        console.log('[tradecard] start -> API_BASE=', API_BASE, 'X-Bot-Key?', !!BOT_KEY, 'Bearer?', !!BOT_BEARER);

        // Build request headers per example (prefer X-Bot-Key; support Bearer alt)
        const headers = { 'Content-Type': 'application/json' };
        if (BOT_KEY) headers['X-Bot-Key'] = BOT_KEY;
        if (BOT_BEARER) headers['Authorization'] = `Bearer ${BOT_BEARER}`;

        // Build payload per /trade/start example:
        // include either initiatorToken (preferred) or initiatorId, plus partnerId
        const payload = {
          partnerId,
          apiBase: API_BASE,
          collectionUiBase: UI_BASE // optional
        };
        if (mine.token && isTokenValid(mine.token)) payload.initiatorToken = mine.token;
        else payload.initiatorId = userId;

        // Create backend trade session
        let resp, json, text;
        try {
          resp = await fetch(`${API_BASE}/trade/start`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
          });
          text = await resp.text(); // read first so we can show raw on error
          try { json = JSON.parse(text); } catch { json = {}; }
        } catch (e) {
          return interaction.editReply({ content: `❌ Failed to contact server: ${String(e)}`, components: [] });
        }

        if (!resp.ok || !json.ok) {
          const emsg = json?.error || json?.message || `${resp.status} ${resp.statusText}`;
          return interaction.editReply({
            content: `❌ Could not start trade: ${emsg}\n— raw: ${text?.slice(0, 300) || '(no body)'}`,
            components: []
          });
        }

        const sessionId = json.sessionId || json.session || '';
        const urlInitiator =
          json.urlInitiator ||
          `${UI_BASE}/?mode=trade&tradeSession=${encodeURIComponent(sessionId)}&role=initiator&token=${encodeURIComponent(mine.token)}&api=${encodeURIComponent(API_BASE)}`;

        // DM initiator link
        try {
          await interaction.user.send(
            `🤝 **Trade started!**\nPartner: <@${partnerId}>\nSession: \`${sessionId}\`\n\n` +
            `👉 **Open your collection to pick cards:** ${urlInitiator}\n\n` +
            `_Note: You’ll be able to **view your partner’s collection** within the trade interface via this session._`
          );
        } catch {}

        await interaction.editReply({
          content:
            `✅ Trade session created with <@${partnerId}>.\n` +
            `I’ve sent you a link${json.urlInitiator ? '' : ' (constructed)'} to pick cards.\n` +
            `Session: \`${sessionId}\`\n\n` +
            `If you didn’t get a DM, click here: ${urlInitiator}`,
          components: []
        });

        try { btnCollector.stop(); } catch {}
        try { ddCollector.stop(); } catch {}
      });

      // Cleanup on timeout
      const endAll = async () => {
        if (msg.editable) {
          try {
            await interaction.editReply({
              content: '⏰ Trade partner selection expired. Run **/tradecard** again to restart.',
              components: []
            });
          } catch {}
        }
      };
      btnCollector.on('end', (_c, r) => { if (r === 'time') endAll(); });
      ddCollector.on('end', (_c, r) => { if (r === 'time') endAll(); });
    }
  });

  /* ---------- Button interactions for Accept / Deny (from partner DM) ---------- */
  client.on('interactionCreate', async (i) => {
    try {
      if (!i.isButton()) return;
      const { customId, user } = i;
      if (!/^trade_(accept|deny)_/.test(customId)) return;
      const [, action, sessionId] = customId.split('_');
      const payload = tradeSessionCache.get(sessionId);
      if (!payload) return i.reply({ content: '⚠️ Trade session not found or expired.', ephemeral: true });

      const { initiatorId, partnerId, initiatorPicks, partnerPicks } = payload;
      if (String(user.id) !== String(partnerId)) {
        return i.reply({ content: '⚠️ Only the selected trade partner can act on this request.', ephemeral: true });
      }

      // Load profiles (REMOTE)
      let linked = {};
      try {
        linked = await _loadJSONSafe(PATHS.linkedDecks);
      } catch {
        return i.reply({ content: '❌ Storage error: could not load player collections.', ephemeral: true });
      }

      const initiator = linked[initiatorId];
      const partner = linked[partnerId];
      if (!initiator || !partner) {
        return i.reply({ content: '❌ One or both players are no longer linked. Trade cancelled.', ephemeral: true });
      }

      if (action === 'deny') {
        tradeSessionCache.delete(sessionId);
        await i.update({ content: '❌ Trade denied. Both players have been notified.', components: [] });
        try { (await client.users.fetch(initiatorId)).send(`❌ Your trade with <@${partnerId}> was **denied**.`); } catch {}
        try { (await client.users.fetch(partnerId)).send(`❌ You **denied** the trade with <@${initiatorId}>.`); } catch {}
        return;
      }

      // Accept: swap cards & persist (REMOTE)
      initiator.collection = initiator.collection || {};
      partner.collection = partner.collection || {};
      applySwap(initiator, partner, initiatorPicks, partnerPicks);
      linked[initiatorId] = initiator;
      linked[partnerId] = partner;

      try {
        await _saveJSONSafe(PATHS.linkedDecks, linked, client);
      } catch {
        return i.reply({ content: '❌ Failed to persist trade to storage. Please try again.', ephemeral: true });
      }

      tradeSessionCache.delete(sessionId);

      await i.update({ content: '✅ Trade accepted! Collections have been updated.', components: [] });

      try { (await client.users.fetch(initiatorId)).send(`✅ Your trade with <@${partnerId}> was **accepted**. Collections updated.`); } catch {}
      try { (await client.users.fetch(partnerId)).send(`✅ You **accepted** the trade with <@${initiatorId}>. Collections updated.`); } catch {}

    } catch (e) {
      try { await i.reply({ content: `⚠️ Error handling trade: ${String(e)}`, ephemeral: true }); } catch {}
    }
  });
}
