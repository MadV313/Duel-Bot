// cogs/spectate.js
// /spectate — Browse & join active duels as a spectator.
//
// - Battlefield channel only
// - Requires a linked profile; self-heals token if missing
// - Pulls active duels from backend (/duel/active), PUBLIC→INTERNAL fallback
// - Paginated dropdown of matches; returns a personalized spectator URL
//
// Config (ENV CONFIG_JSON takes precedence over config.json):
//   battlefield_channel_id
//   spectator_ui_url (or ui_urls.spectator_ui)  <-- NEW preferred for spectator links
//   duel_ui_url (or ui_urls.duel_ui)            <-- still supported as fallback
//   api_base
//   image_base
//
// Files via Persistent Data API:
//   PATHS.linkedDecks

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  MessageFlags
} from 'discord.js';
import { loadJSON, saveJSON, PATHS } from '../utils/storageClient.js';

/* ───────────────────────── Config helpers ───────────────────────── */
function loadConfig() {
  try { if (process.env.CONFIG_JSON) return JSON.parse(process.env.CONFIG_JSON); }
  catch (e) { console.warn('[spectate] CONFIG_JSON parse error:', e?.message); }
  try { if (fs.existsSync('config.json')) return JSON.parse(fs.readFileSync('config.json', 'utf-8')) || {}; }
  catch {}
  return {};
}
const trim = v => String(v ?? '').trim().replace(/\/+$/, '');

const IS_RAILWAY =
  !!process.env.RAILWAY_ENVIRONMENT ||
  !!process.env.RAILWAY_STATIC_URL ||
  !!process.env.RAILWAY_PROJECT_ID;

const PORT = process.env.PORT || '8080';

function pickUrl({ envKeys = [], cfgKeys = [], fallback = '' }, cfg) {
  for (const k of envKeys) if (process.env[k]) return trim(process.env[k]);
  for (const k of cfgKeys) if (cfg[k]) return trim(cfg[k]);
  return trim(fallback);
}

/* ───────────────────────── Small helpers ───────────────────────── */
const isTokenValid = (t) => typeof t === 'string' && /^[A-Za-z0-9_-]{12,128}$/.test(t);
const randomToken  = (len = 24) => crypto.randomBytes(Math.ceil((len * 3) / 4)).toString('base64url').slice(0, len);

/** Ensure a token exists for an already-linked user; returns token or null if not linked. */
async function ensureTokenIfLinked(userId, userName) {
  let linked = {};
  try { linked = await loadJSON(PATHS.linkedDecks); } catch { linked = {}; }
  if (!linked[userId]) return null;

  let changed = false;
  if (linked[userId].discordName !== userName) {
    linked[userId].discordName = userName;
    changed = true;
  }
  if (!isTokenValid(linked[userId].token)) {
    linked[userId].token = randomToken(24);
    changed = true;
  }
  if (changed) {
    await saveJSON(PATHS.linkedDecks, linked);
  }
  return linked[userId].token;
}

/** Fetch active duels from backend; tries PUBLIC then INTERNAL; returns [] on failure. */
async function fetchActiveDuels({ PUBLIC_BACKEND_URL, INTERNAL_BACKEND_URL, BOT_API_KEY }) {
  const tryUrls = [
    `${PUBLIC_BACKEND_URL}/duel/active`,
    `${INTERNAL_BACKEND_URL}/duel/active`
  ];
  for (const url of tryUrls) {
    try {
      const r = await fetch(url, { headers: { ...(BOT_API_KEY ? { 'X-Bot-Key': BOT_API_KEY } : {}) } });
      if (!r.ok) continue;
      const json = await r.json().catch(() => null);
      if (!json) continue;

      // Accept common shapes: {duels:[]}, {sessions:[]}, {active:[]}, {games:[]}, or a bare array
      const keys = ['duels', 'sessions', 'active', 'games'];
      for (const k of keys) {
        if (Array.isArray(json[k])) return json[k];
      }
      if (Array.isArray(json)) return json;
    } catch {}
  }
  return [];
}

/** Normalize a duel record into a UI-friendly item. */
function normalizeDuel(d, linked, invokerName) {
  const id = String(d.id || d.session || d.sessionId || '').trim();
  const status = String(d.status || d.state || 'active').toLowerCase();
  const practice = !!(d.isPractice || d.practice);

  const players = Array.isArray(d.players) ? d.players : [];
  let a = players[0] || d.challenger || {};
  let b = players[1] || d.opponent   || {};

  const aId = String(a.userId || a.id || a.discordId || '').trim();
  const bId = String(b.userId || b.id || b.discordId || '').trim();

  // Prefer linked display names; for practice, fall back to the invoker's name to avoid "Player"
  const aName = practice
    ? (invokerName || (linked?.[aId]?.discordName) || a.name || (aId ? `<@${aId}>` : 'Player'))
    : ((linked?.[aId]?.discordName) || a.name || (aId ? `<@${aId}>` : 'Unknown'));

  const bName = practice
    ? 'Practice Bot'
    : ((linked?.[bId]?.discordName) || b.name || (bId ? `<@${bId}>` : 'Unknown'));

  return { id, status, aId, bId, aName, bName, isPractice: practice };
}

/** Build personalized spectator URL (points to Spectator UI) */
function buildSpectatorUrl({ sessionId, token, SPECTATOR_UI_URL, PUBLIC_BACKEND_URL, IMAGE_BASE, PASS_API_QUERY, isPractice, userName }) {
  const qp = new URLSearchParams();
  qp.set('mode', isPractice ? 'practice' : 'duel');
  if (!isPractice && sessionId) qp.set('session', sessionId);
  qp.set('role', 'spectator');
  if (userName) qp.set('user', userName);
  if (token) qp.set('token', token);

  // ✅ Normalize API base to ensure it includes '/api'
  if (PASS_API_QUERY) {
    const base = (PUBLIC_BACKEND_URL || '').replace(/\/+$/, '');
    const apiBase = base.endsWith('/api') ? base : `${base}/api`;
    qp.set('api', apiBase);
  }

  if (IMAGE_BASE) qp.set('imgbase', IMAGE_BASE);
  qp.set('ts', String(Date.now()));

  // Ensure we land on the actual spectator index.html if the base is a folder
  const base = SPECTATOR_UI_URL.endsWith('.html')
    ? SPECTATOR_UI_URL
    : `${SPECTATOR_UI_URL.replace(/\/+$/,'')}/index.html`;

  return `${base}?${qp.toString()}`;
}

/* ───────────────────────── Command registration ───────────────────────── */
export default async function registerSpectate(bot) {
  const CFG = loadConfig();

  const BATTLEFIELD_CHANNEL_ID = String(
    CFG.battlefield_channel_id ||
    process.env.BATTLEFIELD_CHANNEL_ID ||
    '1367986446232719484'
  );

  const PUBLIC_BACKEND_URL = pickUrl(
    {
      envKeys: ['DUEL_BACKEND_URL', 'BACKEND_URL'],
      cfgKeys: ['duel_backend_base_url'],
      fallback: IS_RAILWAY ? 'https://example.invalid' : `http://localhost:${PORT}`
    },
    CFG
  );

  const INTERNAL_BACKEND_URL = pickUrl(
    {
      envKeys: ['INTERNAL_BACKEND_URL'],
      cfgKeys: [],
      fallback: IS_RAILWAY ? `http://127.0.0.1:${PORT}` : `http://localhost:${PORT}`
    },
    CFG
  );

  // NEW: prefer Spectator UI for links; fall back to Duel UI if not provided
  const SPECTATOR_UI_URL = pickUrl(
    {
      envKeys: [
        'SPECTATOR_VIEW_UI',     // ✅ your correct env override
        'SPECTATOR_UI_URL',
        'SPEC_UI_URL',
        'SPECTATOR_URL',
        'DUEL_UI_URL',
        'DUEL_UI'
      ],
      cfgKeys: [
        'spectator_ui_url',
        'ui_urls?.spectator_ui',
        'duel_ui_url',
        'ui_urls?.duel_ui'
      ],
      fallback: 'https://madv313.github.io/Spectator-View-UI'
    },
    CFG
  );

  const PASS_API_QUERY = String(process.env.PASS_API_QUERY ?? CFG.pass_api_query ?? 'true').toLowerCase() === 'true';

  const IMAGE_BASE = trim(
    process.env.IMAGE_BASE ||
    CFG.image_base ||
    CFG.IMAGE_BASE ||
    'https://madv313.github.io/Card-Collection-UI/images/cards'
  );

  const BOT_API_KEY = process.env.BOT_API_KEY || '';

  const data = new SlashCommandBuilder()
    .setName('spectate')
    .setDescription('View live duels and join as a spectator.')
    .setDMPermission(false);

  bot.slashData.push(data.toJSON());

  bot.commands.set('spectate', {
    data,
    async execute(interaction) {
      // Channel restriction
      if (String(interaction.channelId) !== String(BATTLEFIELD_CHANNEL_ID)) {
        return interaction.reply({
          content: `⚠️ This command can only be used in <#${BATTLEFIELD_CHANNEL_ID}>.`,
          flags: MessageFlags.Ephemeral
        });
      }

      const invokerId = interaction.user.id;
      const invokerName = interaction.user.username;

      // Must be linked (and ensure a token)
      const token = await ensureTokenIfLinked(invokerId, invokerName);
      if (!token) {
        return interaction.reply({
          content: '❌ You are not linked yet. Please run **/linkdeck** in **#manage-cards**.',
          flags: MessageFlags.Ephemeral
        });
      }

      // Load linked map for name resolution
      let linked = {};
      try { linked = await loadJSON(PATHS.linkedDecks); } catch { linked = {}; }

      // Fetch active duels
      const raw = await fetchActiveDuels({ PUBLIC_BACKEND_URL, INTERNAL_BACKEND_URL, BOT_API_KEY });
      const duels = raw
        .map(d => normalizeDuel(d, linked, invokerName))
        // Accept common live statuses OR any session explicitly marked as practice.
        .filter(d => d.id && (
          ['active', 'live', 'running', 'in_progress', 'started'].includes(d.status) || d.isPractice
        ));

      if (!duels.length) {
        const empty = new EmbedBuilder()
          .setTitle('🕊 No Active Duels')
          .setDescription('There are currently no live duels to spectate. Check back later!')
          .setColor(0x888888);
        return interaction.reply({ embeds: [empty], flags: MessageFlags.Ephemeral });
      }

      // Paginate 25 per page
      const pageSize = 25;
      let page = 0;
      const pages = Math.ceil(duels.length / pageSize);

      const makePage = (p) => {
        const slice = duels.slice(p * pageSize, (p + 1) * pageSize);
        const options = slice.map(d => ({
          label: `${d.aName} vs ${d.bName}`,
          description: d.isPractice ? 'Live (Practice) — click to get spectator link' : 'Live now — click to get spectator link',
          value: d.id
        }));

        const select = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`spectate_select_${p}`)
            .setPlaceholder('Select a live duel to spectate')
            .addOptions(options)
        );

        const nav = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('prev').setStyle(ButtonStyle.Secondary).setLabel('⏮ Prev').setDisabled(p === 0),
          new ButtonBuilder().setCustomId('next').setStyle(ButtonStyle.Secondary).setLabel('Next ⏭').setDisabled(p === pages - 1),
        );

        const embed = new EmbedBuilder()
          .setTitle('🎥 Live Duels')
          .setDescription(
            slice
              .map(d => `• **${d.aName}** vs **${d.bName}** — *Live${d.isPractice ? ' (Practice)' : ''}*`)
              .join('\n')
          )
          .setColor(0x00ccff)
          .setFooter({ text: `Page ${p + 1} of ${pages}` });

        return { embed, select, nav };
      };

      const first = makePage(page);
      const msg = await interaction.reply({
        embeds: [first.embed],
        components: [first.select, first.nav],
        flags: MessageFlags.Ephemeral,
        fetchReply: true
      });

      const btnCollector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 90_000
      });

      btnCollector.on('collect', async i => {
        if (i.user.id !== invokerId) {
          return i.reply({ content: '⚠️ Not your menu.', flags: MessageFlags.Ephemeral });
        }
        if (i.customId === 'prev') page = Math.max(0, page - 1);
        if (i.customId === 'next') page = Math.min(pages - 1, page + 1);
        const built = makePage(page);
        await i.update({ embeds: [built.embed], components: [built.select, built.nav] });
      });

      const ddCollector = msg.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 90_000
      });

      ddCollector.on('collect', async i => {
        if (i.user.id !== invokerId) {
          return i.reply({ content: '⚠️ Not your menu.', flags: MessageFlags.Ephemeral });
        }
        await i.deferUpdate();

        const pickedId = i.values[0];
        const picked = duels.find(d => d.id === pickedId);
        if (!picked) {
          return interaction.editReply({
            content: '⚠️ That duel is no longer available.',
            embeds: [],
            components: []
          });
        }

        // Personalized spectator URL (now points to Spectator UI)
        const specUrl = buildSpectatorUrl({
          sessionId: picked.id,
          token,
          SPECTATOR_UI_URL,
          PUBLIC_BACKEND_URL,
          IMAGE_BASE,
          PASS_API_QUERY,
          isPractice: picked.isPractice,
          userName: invokerName
        });

        const embed = new EmbedBuilder()
          .setTitle('🎥 Spectate Duel')
          .setDescription([
            `**Match:** ${picked.aName} vs ${picked.bName}`,
            `**Status:** ${picked.isPractice ? 'Live (Practice)' : 'Live now'}`
          ].join('\n'))
          .setColor(0x2ecc71);

        // Make it a one-click link
        const openBtn = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setLabel('Open Spectator View').setStyle(ButtonStyle.Link).setURL(specUrl)
        );

        await interaction.editReply({ embeds: [embed], components: [openBtn] });
        try { btnCollector.stop(); } catch {}
        try { ddCollector.stop(); } catch {}
      });

      const endAll = async () => {
        try {
          await interaction.editReply({
            content: '⏰ Spectate menu expired. Run **/spectate** again to refresh.',
            embeds: [],
            components: []
          });
        } catch {}
      };
      btnCollector.on('end', (_c, r) => { if (r === 'time') endAll(); });
      ddCollector.on('end', (_c, r) => { if (r === 'time') endAll(); });
    }
  });
}
