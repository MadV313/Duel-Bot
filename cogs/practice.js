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
 * Role / Channel restrictions
 * ─────────────────────────── */
const DEFAULT_ADMIN_ROLE_IDS = ['1173049392371085392']; // Admin only
const ADMIN_ROLE_IDS = (process.env.ADMIN_ROLE_IDS || '')
  .split(',').map(s => s.trim()).filter(Boolean);
const EFFECTIVE_ADMIN_ROLE_IDS =
  ADMIN_ROLE_IDS.length ? ADMIN_ROLE_IDS : DEFAULT_ADMIN_ROLE_IDS;

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
  IS_RAILWAY ? `https://example.invalid` : `http://localhost:${PORT}` // placeholder if not set on Railway
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

// Whether to append &api=<public-backend> to the UI link (default false since UI proxies /api now)
const PASS_API_QUERY = String(process.env.PASS_API_QUERY ?? cfg.pass_api_query ?? 'false').toLowerCase() === 'true';

/** ───────────────────────────
 * Token + profile helpers (ensure invoking admin has a token)
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

/** Ensure a linked profile + token exists for a given Discord user ID. */
async function ensureUserToken(userId, userName) {
  const linked = await readJson(linkedDecksPath, {});
  let changed = false;

  if (!linked[userId]) {
    linked[userId] = {
      discordName: userName,
      deck: [],
      collection: {},
      createdAt: new Date().toISOString(),
    };
    changed = true;
  } else {
    if (linked[userId].discordName !== userName) {
      linked[userId].discordName = userName;
      changed = true;
    }
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
    .setDescription('(Admin only) Start a practice duel vs the bot and get a private link to open the Duel UI.')
    .setDMPermission(false);

  bot.slashData.push(data.toJSON());

  bot.commands.set('practice', {
    name: 'practice',
    execute: async (interaction) => {
      // Correlation ID for logs (Discord interaction snowflake)
      const traceId = interaction.id;

      // Gather context for logs
      const guild = interaction.guild;
      const channel = interaction.channel;
      const member = interaction.member; // GuildMember
      const user = interaction.user;

      const roleList = [];
      try {
        member?.roles?.cache?.forEach(r => roleList.push({ id: r.id, name: r.name }));
      } catch { /* ignore */ }

      log.info('invoke', {
        traceId,
        user: { id: user?.id, tag: user?.tag || `${user?.username}#${user?.discriminator}` },
        guild: { id: guild?.id, name: guild?.name },
        channel: { id: channel?.id, name: channel?.name },
        roles: roleList,
        config: {
          IS_RAILWAY,
          PORT,
          INTERNAL_BACKEND_URL,
          PUBLIC_BACKEND_URL,
          DUEL_UI_URL,
          PASS_API_QUERY,
          adminRoleIds: EFFECTIVE_ADMIN_ROLE_IDS,
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

      // Role restriction
      const hasAdminRole = member?.roles?.cache?.some(r =>
        EFFECTIVE_ADMIN_ROLE_IDS.includes(r.id)
      );
      if (!hasAdminRole) {
        log.warn('role.blocked', { traceId, userId: user?.id, roles: roleList.map(r => r.id) });
        await interaction.reply({
          content: `❌ You must have the **Admin** role to use this command.\n(Trace: ${traceId})`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Defer ephemerally (use flags; fall back to boolean if needed)
      try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      } catch {
        await interaction.deferReply({ ephemeral: true });
      }

      // Initialize practice duel via INTERNAL URL (never hits Railway edge)
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
        // Optionally: const duelState = JSON.parse(textPeek);
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

      // Ensure invoking admin has a token for UI deep-linking
      let token = '';
      try {
        token = await ensureUserToken(user.id, user.username);
      } catch (e) {
        log.warn('token.ensure.fail', { traceId, userId: user.id, err: String(e) });
      }

      // Build UI link
      const qp = new URLSearchParams();
      qp.set('mode', 'practice');
      if (token) qp.set('token', token);

      if (PASS_API_QUERY) {
        qp.set('api', PUBLIC_BACKEND_URL);
      }

      // Optional: pass image base to the UI if configured (keeps images consistent across UIs)
      const imageBase =
        cfg.image_base ||
        cfg.IMAGE_BASE ||
        'https://madv313.github.io/Card-Collection-UI/images/cards';
      if (imageBase) qp.set('imgbase', trim(imageBase));
      qp.set('ts', String(Date.now())); // bust caches

      const duelUrl = `${DUEL_UI_URL}?${qp.toString()}`;

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
            `Click the button below to open the Duel UI.\n\nTrace: \`${traceId}\``
          ].join('\n')
        )
        .setColor(0x2ecc71)
        .setFooter({ text: 'This message is visible only to you (ephemeral).' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Open Duel UI')
          .setStyle(ButtonStyle.Link)
          .setURL(duelUrl),
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
