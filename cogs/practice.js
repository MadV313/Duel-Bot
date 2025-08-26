// cogs/practice.js
import fs from 'fs';
import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';

/** ───────────────────────────
 * Role / Channel restrictions
 * ─────────────────────────── */
const DEFAULT_ADMIN_ROLE_IDS = ['1173049392371085392']; // Admin only (can add more via env)
const ADMIN_ROLE_IDS = (process.env.ADMIN_ROLE_IDS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const EFFECTIVE_ADMIN_ROLE_IDS = ADMIN_ROLE_IDS.length ? ADMIN_ROLE_IDS : DEFAULT_ADMIN_ROLE_IDS;

const DEFAULT_BATTLEFIELD_CHANNEL_ID = '1367986446232719484';
const EFFECTIVE_BATTLEFIELD_CHANNEL_ID =
  process.env.BATTLEFIELD_CHANNEL_ID || DEFAULT_BATTLEFIELD_CHANNEL_ID;

/** ───────────────────────────
 * Config: UI & Backend URLs
 * Priority: env → config.json → sensible local default
 * ─────────────────────────── */
let cfg = {};
try {
  const raw = fs.readFileSync('config.json', 'utf-8');
  cfg = JSON.parse(raw);
} catch (_) {}

const pickUrl = (envKeys, cfgKeys, fallback) => {
  for (const k of envKeys) {
    const v = process.env[k];
    if (v) return String(v).replace(/\/$/, '');
  }
  for (const k of cfgKeys) {
    const v = cfg[k];
    if (v) return String(v).replace(/\/$/, '');
  }
  return fallback.replace(/\/$/, '');
};

// UI: allow either DUEL_UI_URL or DUEL_UI (you set both in Railway)
const DUEL_UI_URL = pickUrl(
  ['DUEL_UI_URL', 'DUEL_UI'],
  ['duel_ui_url'],
  'http://localhost:5173'
);

// Backend base URL
const DUEL_BACKEND_URL = pickUrl(
  ['DUEL_BACKEND_URL', 'BACKEND_URL'],
  ['duel_backend_base_url'],
  'http://localhost:8080'
);

/** ───────────────────────────
 * Register /practice (loaded by server.js cogs loader)
 * ─────────────────────────── */
export default async function registerPractice(bot) {
  // Define slash command
  const data = new SlashCommandBuilder()
    .setName('practice')
    .setDescription(
      '(Admin only) Start a practice duel vs the bot and get a private link to open the Duel UI.'
    )
    .setDMPermission(false);

  // Make available to the command sync in server.js
  bot.slashData.push(data.toJSON());

  // Executor
  bot.commands.set('practice', {
    name: 'practice',
    execute: async (interaction) => {
      // Channel restriction
      if (interaction.channelId !== EFFECTIVE_BATTLEFIELD_CHANNEL_ID) {
        await interaction.reply({
          content: `❌ This command can only be used in <#${EFFECTIVE_BATTLEFIELD_CHANNEL_ID}>.`,
          flags: MessageFlags.Ephemeral, // future-proof vs "ephemeral" deprecation
        });
        return;
      }

      // Role restriction (Admin only)
      const member = interaction.member; // GuildMember
      const hasAdminRole = member?.roles?.cache?.some(r =>
        EFFECTIVE_ADMIN_ROLE_IDS.includes(r.id)
      );
      if (!hasAdminRole) {
        await interaction.reply({
          content: '❌ You must have the **Admin** role to use this command.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Defer ephemerally (use flags; fall back to ephemeral boolean if needed)
      try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      } catch {
        await interaction.deferReply({ ephemeral: true });
      }

      // Hit backend to initialize the practice duel (build decks, draw 3, coin flip)
      try {
        const res = await fetch(`${DUEL_BACKEND_URL}/bot/practice`, { method: 'GET' });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`Backend responded ${res.status}: ${text.slice(0, 300)}`);
        }
        // const duelState = await res.json(); // available if you want to log
      } catch (err) {
        await interaction.editReply({
          content:
            `⚠️ Failed to start practice duel:\n\`${String(err)}\`\n` +
            `Check DUEL_BACKEND_URL or your server logs.`,
        });
        return;
      }

      // Build UI link and pass backend base via query (?api=...)
      const duelUrl = `${DUEL_UI_URL}?mode=practice&api=${encodeURIComponent(DUEL_BACKEND_URL)}`;

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
            'Click the button below to open the Duel UI.'
          ].join('\n')
        )
        .setColor(0x2ecc71)
        .setFooter({ text: 'This message is visible only to you (ephemeral).' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Open Duel UI')
          .setStyle(ButtonStyle.Link)
          .setURL(duelUrl)
      );

      await interaction.editReply({ embeds: [embed], components: [row] });
    },
  });
}
