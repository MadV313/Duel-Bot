// cogs/spectate.js — Browse & join active duels as a spectator.
// - Restricted to Battlefield channel (warns otherwise)
// - Requires the invoker to be linked (warns to /linkdeck otherwise)
// - Passes invoker's token in spectator links so the UI can show/viewers
// - Pulls active duels from backend; paginated dropdown of matches
// - On selection, returns an ephemeral embed with a personalized spectator link
//
// Backend contract (best-effort; tries both public & internal):
//   GET  {PUBLIC_BACKEND_URL}/duel/active     (fallback to INTERNAL_BACKEND_URL)
//     returns: { ok: true, duels: [{ id, status, startedAt, isPractice?, players:[{userId,name}], ... }] }
//
// Spectator URL construction (fallback if backend doesn't return URLs):
//   {DUEL_UI_URL}?mode=duel&session=<id>&role=spectator&token=<yourToken>&api=<PUBLIC_BACKEND_URL>&ts=<now>
//
// Notes:
// - We resolve Discord display names using linked_decks.json when possible.
// - Dropdown is ephemeral and supports up to 25 options per page; nav with Prev/Next buttons.

import fs from 'fs/promises';
import fssync from 'fs';
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

/* ───────────── Config & helpers (same style as challenge/practice) ───────────── */

const DEFAULT_BATTLEFIELD_CHANNEL_ID = '1367986446232719484';
const BATTLEFIELD_CHANNEL_ID =
  process.env.BATTLEFIELD_CHANNEL_ID || DEFAULT_BATTLEFIELD_CHANNEL_ID;

const IS_RAILWAY =
  !!process.env.RAILWAY_ENVIRONMENT ||
  !!process.env.RAILWAY_STATIC_URL ||
  !!process.env.RAILWAY_PROJECT_ID;

const PORT = process.env.PORT || '8080';

let cfg = {};
try {
  const raw = fssync.readFileSync('config.json', 'utf-8');
  cfg = JSON.parse(raw);
} catch (_) {}

const trim = v => String(v || '').replace(/\/+$/, '');
const pick = (envKeys, cfgKeys, fallback) => {
  for (const k of envKeys) {
    const v = process.env[k];
    if (v) return trim(v);
  }
  for (const k of cfgKeys) {
    const v = cfg[k];
    if (v) return trim(v);
  }
  return trim(fallback);
};

// Public backend URL (for UIs)
const PUBLIC_BACKEND_URL = pick(
  ['DUEL_BACKEND_URL', 'BACKEND_URL'],
  ['duel_backend_base_url'],
  IS_RAILWAY ? `https://example.invalid` : `http://localhost:${PORT}`
);

// Internal backend URL (for bot→server)
const INTERNAL_BACKEND_URL = pick(
  ['INTERNAL_BACKEND_URL'],
  [],
  IS_RAILWAY ? `http://127.0.0.1:${PORT}` : `http://localhost:${PORT}`
);

// Duel UI base (public)
const DUEL_UI_URL = pick(
  ['DUEL_UI_URL', 'DUEL_UI'],
  ['duel_ui_url'],
  'http://localhost:5173'
);

// Whether to add &api=<public-backend> to links
const PASS_API_QUERY = String(process.env.PASS_API_QUERY ?? cfg.pass_api_query ?? 'true')
  .toLowerCase() === 'true';

// Optional shared BOT key (not required to read public /duel/active)
const BOT_API_KEY = process.env.BOT_API_KEY || '';

/* ───────────── Files & small helpers ───────────── */

const linkedDecksPath = path.resolve('./data/linked_decks.json');

async function readJson(file, fb = {}) {
  try { return JSON.parse(await fs.readFile(file, 'utf-8')); } catch { return fb; }
}
async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}
function randomToken(len = 24) {
  return crypto.randomBytes(Math.ceil((len * 3) / 4)).toString('base64url').slice(0, len);
}
function isTokenValid(t) {
  return typeof t === 'string' && /^[A-Za-z0-9_-]{12,128}$/.test(t);
}

/** Ensure a token exists for an already-linked user. Returns token or null if not linked. */
async function ensureTokenIfLinked(userId, userName) {
  const linked = await readJson(linkedDecksPath, {});
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
  if (changed) await writeJson(linkedDecksPath, linked);
  return linked[userId].token;
}

/** Fetch active duels from backend; tries PUBLIC then INTERNAL; returns [] on failure. */
async function fetchActiveDuels() {
  const tryUrls = [
    `${PUBLIC_BACKEND_URL}/duel/active`,
    `${INTERNAL_BACKEND_URL}/duel/active`
  ];
  for (const url of tryUrls) {
    try {
      const r = await fetch(url, {
        headers: { ...(BOT_API_KEY ? { 'X-Bot-Key': BOT_API_KEY } : {}) }
      });
      if (!r.ok) continue;
      const json = await r.json().catch(() => null);
      if (json && Array.isArray(json.duels)) {
        return json.duels;
      }
      // Some backends might just return an array
      if (Array.isArray(json)) return json;
    } catch {
      // continue to next URL
    }
  }
  return [];
}

/** Normalize a duel record into a UI-friendly item. */
function normalizeDuel(d, linked) {
  const id = String(d.id || d.session || d.sessionId || '');
  const status = String(d.status || 'active').toLowerCase();
  const practice = !!(d.isPractice || d.practice);

  // Extract names/ids
  const players = Array.isArray(d.players) ? d.players : [];
  let a = players[0] || {};
  let b = players[1] || {};
  // Some backends might use fields like challenger/opponent
  if (!players.length && (d.challenger || d.opponent)) {
    a = d.challenger || {};
    b = d.opponent || {};
  }

  const aId = String(a.userId || a.id || a.discordId || '');
  const bId = String(b.userId || b.id || b.discordId || '');

  const aName = (linked?.[aId]?.discordName) || a.name || (aId ? `<@${aId}>` : 'Unknown');
  const bName = practice
    ? 'Practice Bot'
    : ((linked?.[bId]?.discordName) || b.name || (bId ? `<@${bId}>` : 'Unknown'));

  return { id, status, aId, bId, aName, bName, isPractice: practice };
}

/** Build personalized spectator URL */
function buildSpectatorUrl({ sessionId, token }) {
  const qp = new URLSearchParams();
  qp.set('mode', 'duel');
  qp.set('session', sessionId);
  qp.set('role', 'spectator');
  if (token) qp.set('token', token);
  if (PASS_API_QUERY) qp.set('api', PUBLIC_BACKEND_URL);
  const imgBase =
    cfg.image_base || cfg.IMAGE_BASE || 'https://madv313.github.io/Card-Collection-UI/images/cards';
  if (imgBase) qp.set('imgbase', imgBase);
  qp.set('ts', String(Date.now()));
  return `${DUEL_UI_URL}?${qp.toString()}`;
}

/* ───────────── Command registration ───────────── */

export default async function registerSpectate(bot) {
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

      // Must be linked first
      const token = await ensureTokenIfLinked(invokerId, invokerName);
      if (!token) {
        return interaction.reply({
          content: '❌ You are not linked yet. Please run **/linkdeck** in **#manage-cards** before using Duel Bot commands.',
          flags: MessageFlags.Ephemeral
        });
      }

      // Load linked names to render labels
      const linked = await readJson(linkedDecksPath, {});
      const duelsRaw = await fetchActiveDuels();
      const duels = duelsRaw
        .map(d => normalizeDuel(d, linked))
        .filter(d => d.id && (d.status === 'active' || d.status === 'live' || d.status === 'running'));

      if (!duels.length) {
        const empty = new EmbedBuilder()
          .setTitle('🕊 No Active Duels')
          .setDescription('There are currently no live duels to spectate. Check back later!')
          .setColor(0x888888);
        return interaction.reply({ embeds: [empty], flags: MessageFlags.Ephemeral });
      }

      // Paginated dropdown (25 per page)
      const pageSize = 25;
      let page = 0;
      const pages = Math.ceil(duels.length / pageSize);

      const makePage = (p) => {
        const slice = duels.slice(p * pageSize, (p + 1) * pageSize);
        const options = slice.map(d => ({
          label: `${d.aName} vs ${d.bName}`,
          description: 'Live now — click to get spectator link',
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
            slice.map(d => `• **${d.aName}** vs **${d.bName}** — *Live now*`).join('\n')
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

        // Build personalized spectator URL
        const specUrl = buildSpectatorUrl({ sessionId: picked.id, token });

        const embed = new EmbedBuilder()
          .setTitle('🎥 Spectate Duel')
          .setDescription(
            [
              `**Match:** ${picked.aName} vs ${picked.bName}`,
              `**Status:** Live now`,
              '',
              `🔗 **Join as Spectator:** ${specUrl}`
            ].join('\n')
          )
          .setColor(0x2ecc71);

        await interaction.editReply({
          embeds: [embed],
          components: []
        });

        try { btnCollector.stop(); } catch {}
        try { ddCollector.stop(); } catch {}
      });

      const endAll = async () => {
        try {
          await interaction.editReply({
            content: '⏰ Spectate menu expired. Run **/spectate** again to refresh live duels.',
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
