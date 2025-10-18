// cogs/practice.js
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';

/** ───────────────────────────
 * Small logging helpers
 * ─────────────────────────── */
const iso = () => new Date().toISOString();
const j = (o) => { try { return JSON.stringify(o); } catch { return String(o); } };
const log = {
  info:  (event, data = {}) => console.log (`[practice] ${event} ${j({ t: iso(), ...data })}`),
  warn:  (event, data = {}) => console.warn (`[practice] ${event} ${j({ t: iso(), ...data })}`),
  error: (event, data = {}) => console.error(`[practice] ${event} ${j({ t: iso(), ...data })}`),
};

/** ───────────────────────────
 * Channel restriction
 * ─────────────────────────── */
const DEFAULT_BATTLEFIELD_CHANNEL_ID = '1367986446232719484';
const EFFECTIVE_BATTLEFIELD_CHANNEL_ID =
  process.env.BATTLEFIELD_CHANNEL_ID || DEFAULT_BATTLEFIELD_CHANNEL_ID;

/** ───────────────────────────
 * Config helpers
 * Priority: env → config.json → fallback
 * ─────────────────────────── */
let cfg = {};
try {
  const raw = fs.readFileSync('config.json', 'utf-8');
  cfg = JSON.parse(raw);
} catch (_) {}

const trim = v => String(v).replace(/\/$/, '');
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

// Detect Railway container to prefer 127.0.0.1 for **internal** calls
const IS_RAILWAY =
  !!process.env.RAILWAY_ENVIRONMENT ||
  !!process.env.RAILWAY_STATIC_URL ||
  !!process.env.RAILWAY_PROJECT_ID;

const PORT = process.env.PORT || '8080';

// PUBLIC URL: used for the browser (UI → API). Must be HTTPS in production.
const PUBLIC_BACKEND_URL = pick(
  ['DUEL_BACKEND_URL', 'BACKEND_URL'],
  ['duel_backend_base_url'],
  IS_RAILWAY ? `https://example.invalid` : `http://localhost:${PORT}`
);

// INTERNAL URL: used by the bot (server → server). 127.0.0.1 avoids Railway edge.
const INTERNAL_BACKEND_URL = pick(
  ['INTERNAL_BACKEND_URL'],
  [],
  IS_RAILWAY ? `http://127.0.0.1:${PORT}` : `http://localhost:${PORT}`
);

// UI base (public)
const DUEL_UI_URL = pick(
  ['DUEL_UI_URL', 'DUEL_UI'],
  ['duel_ui_url'],
  'http://localhost:5173'
);

// Whether to append &api=<public-backend> to the UI link.
const PASS_API_QUERY = String(process.env.PASS_API_QUERY ?? cfg.pass_api_query ?? 'true').toLowerCase() === 'true';

/** ───────────────────────────
 * Token + profile helpers (ensure token if linked)
 * ─────────────────────────── */
const linkedDecksPath = path.resolve('./data/linked_decks.json');

const readJson = async (file, fallback = {}) => {
  try {
    const raw = await fs.promises.readFile(file, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};
const writeJson = async (file, data) => {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(file, JSON.stringify(data, null, 2));
};
const randomToken = (len = 24) =>
  crypto.randomBytes(Math.ceil((len * 3) / 4)).toString('base64url').slice(0, len);

/** Return linked profile or null (does NOT create). */
async function getLinkedProfile(userId) {
  const linked = await readJson(linkedDecksPath, {});
  return linked[userId] || null;
}

/** Ensure token exists on an already-linked profile (mint if missing). */
async function ensureTokenIfLinked(userId, userName) {
  const linked = await readJson(linkedDecksPath, {});
  if (!linked[userId]) return null; // not linked

  let changed = false;
  if (linked[userId].discordName !== userName) {
    linked[userId].discordName = userName;
    changed = true;
  }
  if (!linked[userId].token || typeof linked[userId].token !== 'string' || linked[userId].token.length < 12) {
    linked[userId].token = randomToken(24);
    changed = true;
  }
  if (changed) {
    try {
      await writeJson(linkedDecksPath, linked);
    } catch (e) {
      log.warn('token.persist.fail', { userId, err: String(e) });
    }
  }
  return linked[userId].token;
}

/** ───────────────────────────
 * Register /practice
 * ─────────────────────────── */
export default async function registerPractice(bot) {
  const data = new SlashCommandBuilder()
    .setName('practice')
    .setDescription('Start a practice duel vs the bot and get a private link to open the Duel UI.')
    .setDMPermission(false);

  bot.slashData.push(data.toJSON());

  bot.commands.set('practice', {
    name: 'practice',
    execute: async (interaction) => {
      const traceId = interaction.id;

      const guild = interaction.guild;
      const channel = interaction.channel;
      const member = interaction.member;
      const user = interaction.user;

      log.info('invoke', {
        traceId,
        user: { id: user?.id, tag: user?.tag || `${user?.username}#${user?.discriminator}` },
        guild: { id: guild?.id, name: guild?.name },
        channel: { id: channel?.id, name: channel?.name },
        config: {
          IS_RAILWAY,
          PORT,
          INTERNAL_BACKEND_URL,
          PUBLIC_BACKEND_URL,
          DUEL_UI_URL,
          PASS_API_QUERY,
          battlefieldChannelId: EFFECTIVE_BATTLEFIELD_CHANNEL_ID,
        }
      });

      // Channel restriction
      const inAllowedChannel = interaction.channelId === EFFECTIVE_BATTLEFIELD_CHANNEL_ID;
      if (!inAllowedChannel) {
        log.warn('channel.blocked', { traceId, channelId: interaction.channelId });
        await interaction.reply({
          content: `❌ This command can only be used in <#${EFFECTIVE_BATTLEFIELD_CHANNEL_ID}>.\n(Trace: ${traceId})`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Must be linked first (do NOT auto-create here)
      const profile = await getLinkedProfile(user.id);
      if (!profile) {
        await interaction.reply({
          content:
            '⚠️ You are not linked yet. Please run **/linkdeck** in **#manage-cards** before using Duel Bot commands.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Defer ephemerally (prefer flags)
      try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      } catch {
        await interaction.deferReply({ ephemeral: true });
      }

      // Initialize practice duel via INTERNAL URL
      let httpStatus = 0;
      let durationMs = 0;
      try {
        const t0 = Date.now();
        const url = `${INTERNAL_BACKEND_URL}/bot/practice`;
        log.info('backend.request', { traceId, method: 'GET', url, internal: true });
        const res = await fetch(url, { method: 'GET' });
        httpStatus = res.status;
        durationMs = Date.now() - t0;
        const textPeek = await res.text().catch(() => '');
        log.info('backend.response', {
          traceId,
          status: httpStatus,
          durationMs,
          bodyPreview: textPeek.slice(0, 180)
        });
        if (!res.ok) {
          throw new Error(`Backend responded ${httpStatus}: ${textPeek.slice(0, 300)} (INTERNAL_BACKEND_URL=${INTERNAL_BACKEND_URL})`);
        }
      } catch (err) {
        log.error('init.fail', { traceId, err: String(err), status: httpStatus, durationMs });
        await interaction.editReply({
          content:
            `⚠️ Failed to start practice duel:\n\`${String(err)}\`\n` +
            `Trace: ${traceId}\n` +
            `Check INTERNAL_BACKEND_URL and route mounting for /bot/practice.`,
        });
        return;
      }

      // Ensure token on existing profile (mint only if missing)
      let token = profile.token;
      try {
        token = await ensureTokenIfLinked(user.id, user.username);
      } catch (e) {
        log.warn('token.ensure.fail', { traceId, userId: user.id, err: String(e) });
      }

      // Build two personalized Practice UI links:
      //  - Saved Deck   → practiceDeck=saved
      //  - Random Deck  → practiceDeck=random
      const baseParams = new URLSearchParams();
      baseParams.set('mode', 'practice');
      baseParams.set('token', token || '');

      if (PASS_API_QUERY) baseParams.set('api', PUBLIC_BACKEND_URL);

      const imageBase =
        cfg.image_base ||
        cfg.IMAGE_BASE ||
        'https://madv313.github.io/Card-Collection-UI/images/cards';
      if (imageBase) baseParams.set('imgbase', trim(imageBase));

      // Saved Deck link
      const savedParams = new URLSearchParams(baseParams);
      savedParams.set('practiceDeck', 'saved');
      savedParams.set('ts', String(Date.now()));
      const duelUrlSaved = `${DUEL_UI_URL}?${savedParams.toString()}`;

      // Random Deck link
      const randomParams = new URLSearchParams(baseParams);
      randomParams.set('practiceDeck', 'random');
      randomParams.set('ts', String(Date.now() + 1));
      const duelUrlRandom = `${DUEL_UI_URL}?${randomParams.toString()}`;

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
            '• **Use Saved Deck**: your current saved deck from the Deck Builder.',
            '• **Use Random Deck**: a randomized premade deck for quick practice.',
            '',
            `Trace: \`${traceId}\``
          ].join('\n')
        )
        .setColor(0x2ecc71)
        .setFooter({ text: 'This message is visible only to you (ephemeral).' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Use Saved Deck')
          .setStyle(ButtonStyle.Link)
          .setURL(duelUrlSaved),
        new ButtonBuilder()
          .setLabel('Use Random Deck')
          .setStyle(ButtonStyle.Link)
          .setURL(duelUrlRandom),
        new ButtonBuilder()
          .setLabel('API Status')
          .setStyle(ButtonStyle.Link)
          .setURL(`${PUBLIC_BACKEND_URL}/duel/status`)
      );

      await interaction.editReply({ embeds: [embed], components: [row] });
      log.info('init.success', {
        traceId,
        publicUrl: PUBLIC_BACKEND_URL,
        uiUrl: DUEL_UI_URL,
        linkHasApiParam: PASS_API_QUERY,
        tokenIncluded: Boolean(token)
      });
    },
  });
}
