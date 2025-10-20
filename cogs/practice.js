// cogs/practice.js
// /practice — Start a practice duel vs the bot and give the user private links to the Duel UI.
// - Restricted to #battlefield (configurable)
// - Requires the user to be linked (prompts to /linkdeck if not)
// - Ensures/mints a per-user token and persists it via Persistent Data API
// - Calls backend /bot/practice (INTERNAL url for server->server), then returns two links:
//     • Use Saved Deck   (?mode=practice&practiceDeck=saved)
//     • Use Random Deck  (?mode=practice&practiceDeck=random)
// - Each link carries ?token=..., optional &api=..., &imgbase=..., and cache-busting &ts=...

import fs from 'fs';
import crypto from 'crypto';
import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';
import { loadJSON, saveJSON, PATHS } from '../utils/storageClient.js';

const iso = () => new Date().toISOString();
const j = (o) => { try { return JSON.stringify(o); } catch { return String(o); } };
const log = {
  info:  (event, data = {}) => console.log (`[practice] ${event} ${j({ t: iso(), ...data })}`),
  warn:  (event, data = {}) => console.warn (`[practice] ${event} ${j({ t: iso(), ...data })}`),
  error: (event, data = {}) => console.error(`[practice] ${event} ${j({ t: iso(), ...data })}`),
};

// ─────────────────────────── Config resolution helpers ───────────────────────────
let cfg = {};
try {
  if (fs.existsSync('config.json')) {
    cfg = JSON.parse(fs.readFileSync('config.json', 'utf-8')) || {};
  }
} catch (_) {}

const trim = (v = '') => String(v).trim().replace(/\/+$/, '');
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

const DEFAULT_BATTLEFIELD_CHANNEL_ID = '1367986446232719484';
const BATTLEFIELD_CHANNEL_ID =
  process.env.BATTLEFIELD_CHANNEL_ID ||
  cfg.battlefield_channel_id ||
  DEFAULT_BATTLEFIELD_CHANNEL_ID;

// Prefer an internal loopback for bot→backend when on Railway.
const IS_RAILWAY =
  !!process.env.RAILWAY_ENVIRONMENT ||
  !!process.env.RAILWAY_STATIC_URL ||
  !!process.env.RAILWAY_PROJECT_ID;

const PORT = process.env.PORT || '8080';

const PUBLIC_BACKEND_URL = pick(
  ['DUEL_BACKEND_URL', 'BACKEND_URL'],
  ['duel_backend_base_url'],
  IS_RAILWAY ? 'https://example.invalid' : `http://localhost:${PORT}`
);

const INTERNAL_BACKEND_URL = pick(
  ['INTERNAL_BACKEND_URL'],
  [],
  IS_RAILWAY ? `http://127.0.0.1:${PORT}` : `http://localhost:${PORT}`
);

const DUEL_UI_URL = pick(
  ['DUEL_UI_URL', 'DUEL_UI'],
  ['duel_ui_url'],
  'https://madv313.github.io/Duel-UI'
);

const PASS_API_QUERY = String(process.env.PASS_API_QUERY ?? cfg.pass_api_query ?? 'true')
  .toLowerCase() === 'true';

// Default image base (can be overridden in config.json or env)
const IMAGE_BASE = trim(
  process.env.IMAGE_BASE ||
  cfg.image_base ||
  cfg.IMAGE_BASE ||
  'https://madv313.github.io/Card-Collection-UI/images/cards'
);

// ─────────────────────────── Token & profile helpers ───────────────────────────
const isTokenValid = (t) => typeof t === 'string' && /^[A-Za-z0-9_-]{12,128}$/.test(t);
const randomToken = (len = 24) =>
  crypto.randomBytes(Math.ceil((len * 3) / 4)).toString('base64url').slice(0, len);

/** Fetch the caller’s profile from Persistent Data server; null if not linked. */
async function getLinkedProfile(userId) {
  try {
    const linked = await loadJSON(PATHS.linkedDecks);
    return linked[userId] || null;
  } catch (e) {
    log.warn('linkedDecks.load.fail', { err: String(e) });
    return null;
  }
}

/** Ensure token exists for an already-linked profile; persist if minted. */
async function ensureTokenIfLinked(userId, username) {
  let linked = {};
  try { linked = await loadJSON(PATHS.linkedDecks); } catch { linked = {}; }
  if (!linked[userId]) return null;

  let changed = false;
  if (linked[userId].discordName !== username) {
    linked[userId].discordName = username;
    changed = true;
  }
  if (!isTokenValid(linked[userId].token)) {
    linked[userId].token = randomToken(24);
    changed = true;
  }
  if (changed) {
    try { await saveJSON(PATHS.linkedDecks, linked); }
    catch (e) { log.warn('token.persist.fail', { userId, err: String(e) }); }
  }
  return linked[userId].token;
}

// ─────────────────────────── Command registration ───────────────────────────
export default async function registerPractice(bot) {
  const data = new SlashCommandBuilder()
    .setName('practice')
    .setDescription('Start a practice duel vs the bot and get private links to the Duel UI.')
    .setDMPermission(false);

  bot.slashData.push(data.toJSON());

  bot.commands.set('practice', {
    data,
    async execute(interaction) {
      const traceId = interaction.id;

      // Channel restriction
      if (String(interaction.channelId) !== String(BATTLEFIELD_CHANNEL_ID)) {
        await interaction.reply({
          content: `❌ This command can only be used in <#${BATTLEFIELD_CHANNEL_ID}>.\n(Trace: ${traceId})`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Must be linked first (do NOT auto-create)
      const profile = await getLinkedProfile(interaction.user.id);
      if (!profile) {
        await interaction.reply({
          content:
            '⚠️ You are not linked yet. Please run **/linkdeck** in **#manage-cards** before using Duel Bot commands.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Defer ephemerally
      try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      } catch {
        await interaction.deferReply({ ephemeral: true });
      }

      // Initialize practice duel via INTERNAL URL
      let httpStatus = 0, durationMs = 0;
      try {
        const t0 = Date.now();
        const url = `${INTERNAL_BACKEND_URL}/bot/practice`;
        const res = await fetch(url, { method: 'GET' });
        httpStatus = res.status;
        durationMs = Date.now() - t0;
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(`Backend ${httpStatus}: ${body.slice(0, 300)}`);
        }
      } catch (err) {
        log.error('backend.init.fail', { traceId, err: String(err), httpStatus, durationMs });
        await interaction.editReply({
          content:
            `⚠️ Failed to start practice duel:\n\`${String(err)}\`\n` +
            `Trace: ${traceId}\n` +
            `Check INTERNAL_BACKEND_URL and that /bot/practice is mounted.`,
        });
        return;
      }

      // Ensure token on existing profile (mint only if missing)
      let token = profile.token;
      try { token = await ensureTokenIfLinked(interaction.user.id, interaction.user.username) || token; }
      catch (e) { log.warn('token.ensure.fail', { userId: interaction.user.id, err: String(e) }); }

      // Build two personalized Practice UI links
      const baseParams = new URLSearchParams();
      baseParams.set('mode', 'practice');
      baseParams.set('token', token || '');
      if (PASS_API_QUERY) baseParams.set('api', PUBLIC_BACKEND_URL);
      if (IMAGE_BASE) baseParams.set('imgbase', IMAGE_BASE);

      const paramsSaved = new URLSearchParams(baseParams);
      paramsSaved.set('practiceDeck', 'saved');
      paramsSaved.set('ts', String(Date.now()));
      const duelUrlSaved = `${DUEL_UI_URL}?${paramsSaved.toString()}`;

      const paramsRandom = new URLSearchParams(baseParams);
      paramsRandom.set('practiceDeck', 'random');
      paramsRandom.set('ts', String(Date.now() + 1));
      const duelUrlRandom = `${DUEL_UI_URL}?${paramsRandom.toString()}`;

      const embed = new EmbedBuilder()
        .setTitle('Practice Duel Ready')
        .setDescription(
          [
            'A fresh duel vs **Practice Bot** has been initialized.',
            '',
            '• Both sides start at **200 HP**',
            '• Each draws **3 cards**',
            '• **Coin flip** decides who goes first',
            '',
            '**Choose how you want to practice:**',
            '• **Use Saved Deck**: your current saved deck from the Deck Builder',
            '• **Use Random Deck**: a randomized premade deck for quick practice',
            '',
            `Trace: \`${traceId}\``
          ].join('\n')
        )
        .setColor(0x2ecc71)
        .setFooter({ text: 'This message is visible only to you (ephemeral).' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('Use Saved Deck').setStyle(ButtonStyle.Link).setURL(duelUrlSaved),
        new ButtonBuilder().setLabel('Use Random Deck').setStyle(ButtonStyle.Link).setURL(duelUrlRandom),
        new ButtonBuilder().setLabel('API Status').setStyle(ButtonStyle.Link).setURL(`${PUBLIC_BACKEND_URL}/duel/status`)
      );

      await interaction.editReply({ embeds: [embed], components: [row] });
      log.info('practice.ready', {
        traceId,
        ui: DUEL_UI_URL,
        publicApi: PUBLIC_BACKEND_URL,
        passApiParam: PASS_API_QUERY,
        hasToken: !!token,
      });
    },
  });
}
