// commands/practice.js
import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from 'discord.js';

// ── CONFIG ───────────────────────────────────────────────────────────────────
// Prefer env vars; fall back to config.json if present; otherwise sensible local defaults.
import fs from 'fs';

const ADMIN_ROLE_ID = '1173049392371085392';
const BATTLEFIELD_CHANNEL_ID = '1367986446232719484';

let cfg = {};
try {
  const raw = fs.readFileSync('config.json', 'utf-8');
  cfg = JSON.parse(raw);
} catch (_) {}

const DUEL_BACKEND_URL = (process.env.DUEL_BACKEND_URL || cfg.duel_backend_base_url || 'http://localhost:3000').replace(/\/$/, '');
const DUEL_UI_URL      = (process.env.DUEL_UI_URL || cfg.duel_ui_url || 'http://localhost:5173').replace(/\/$/, '');

export const data = new SlashCommandBuilder()
  .setName('practice')
  .setDescription('(Admin only) Start a practice duel vs the bot and get a private link to open the Duel UI.')
  // no default member permissions here; we’ll enforce role + channel manually
  .setDMPermission(false);

export async function execute(interaction) {
  // Channel restriction
  if (interaction.channelId !== BATTLEFIELD_CHANNEL_ID) {
    await interaction.reply({ content: '❌ This command can only be used in **#battlefield**.', ephemeral: true });
    return;
  }

  // Role restriction (Admin only)
  const member = interaction.member; // GuildMember
  const hasAdminRole = member?.roles?.cache?.has(ADMIN_ROLE_ID);
  if (!hasAdminRole) {
    await interaction.reply({ content: '❌ You must have the **Admin** role to use this command.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  // Call backend to initialize practice duel
  try {
    const res = await fetch(`${DUEL_BACKEND_URL}/bot/practice`, { method: 'GET' });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Backend responded ${res.status}: ${text.slice(0, 300)}`);
    }
    // const duelState = await res.json(); // not needed, but available for logging
  } catch (err) {
    await interaction.editReply({
      content: `⚠️ Failed to start practice duel:\n\`${String(err)}\`\nCheck DUEL_BACKEND_URL or your server logs.`
    });
    return;
  }

  const duelUrl = `${DUEL_UI_URL}?mode=practice`;

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
}
