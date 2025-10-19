
async function _loadJSONSafe(name){
  try { return await loadJSON(name); }
  catch(e){ L.storage(`load fail ${name}: ${e.message}`); throw e; }
}
async function _saveJSONSafe(name, data, client){
  try { await saveJSON(name, data); }
  catch(e){ await adminAlert(client, process.env.PAYOUTS_CHANNEL_ID, `${name} save failed: ${e.message}`); throw e; }
}

import { requireSupporter } from '../utils/roleGuard.js';
import { adminAlert } from '../utils/adminAlert.js';
import { L } from '../utils/logs.js';
import { loadJSON, saveJSON, PATHS } from '../utils/storageClient.js';
// cogs/challenge.js — Challenge another linked player to a duel.
// - Restricted to Battlefield channel
// - Requires both players to be linked (has token). Warn otherwise.
// - Shows a paginated dropdown of linked users (excluding self)
// - On selection, DMs the challenged player with Accept / Deny buttons
//   • Deny  → both players informed of denial
//   • Accept → both players receive personal duel links (role-coded) with tokens & api
//
// Backend contract (optional, but used if present):
//   POST  {INTERNAL_BACKEND_URL}/duel/start
//     body: { initiatorId, partnerId, apiBase, duelUiBase }
//     returns: { ok, sessionId, urlInitiator?, urlPartner? }
//   POST  {INTERNAL_BACKEND_URL}/duel/:session/decision
//     body: { token, accept: boolean }
//
// If backend URLs aren’t returned, we construct:
//   {DUEL_UI_URL}?mode=duel&session=<id>&role=<challenger|opponent>&token=<...>&api=<...>&ts=...
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

/* ───────────────────────────── Config & helpers ───────────────────────────── */

const DEFAULT_BATTLEFIELD_CHANNEL_ID = '1367986446232719484';
const BATTLEFIELD_CHANNEL_ID =
  process.env.BATTLEFIELD_CHANNEL_ID || DEFAULT_BATTLEFIELD_CHANNEL_ID;

// Detect Railway to prefer 127.0.0.1 for internal calls
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

// Public backend URL (for the browser UIs)
const PUBLIC_BACKEND_URL = pick(
  ['DUEL_BACKEND_URL', 'BACKEND_URL'],
  ['duel_backend_base_url'],
  IS_RAILWAY ? `https://example.invalid` : `http://localhost:${PORT}`
);

// Internal backend URL (for the bot → server calls)
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

// Whether to always add &api=<public-backend> to UI links
const PASS_API_QUERY = String(process.env.PASS_API_QUERY ?? cfg.pass_api_query ?? 'true')
  .toLowerCase() === 'true';

// Optional BOT API key for secure backend calls (like trade)
const BOT_API_KEY = process.env.BOT_API_KEY || '';

// Linked profiles file
const linkedDecksPath = path.resolve('PATHS.linkedDecks');

async function await _loadJSONSafe(PATHS.linkedDecks) {
  try { return JSON.parse(await loadJSON(PATHS.linkedDecks)); } catch { return fb; }
}
async function await _saveJSONSafe(PATHS.linkedDecks, \1, client) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await saveJSON(PATHS.linkedDecks));
}
function randomToken(len = 24) {
  return crypto.randomBytes(Math.ceil((len * 3) / 4)).toString('base64url').slice(0, len);
}
function isTokenValid(t) {
  return typeof t === 'string' && /^[A-Za-z0-9_-]{12,128}$/.test(t);
}
function nowIso() { return new Date().toISOString(); }

/** Ensure invoker has a token (only if already linked). Returns token or null if not linked. */
async function ensureTokenIfLinked(userId, userName) {
  const linked = await await _loadJSONSafe(PATHS.linkedDecks);
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
  if (changed) await await _saveJSONSafe(PATHS.linkedDecks, \1, client);
  return linked[userId].token;
}

/* ───────────────────────────── Command ───────────────────────────── */

export default async function registerChallenge(bot) {
  const data = new SlashCommandBuilder()
    .setName('challenge')
    .setDescription('Challenge another linked player to a duel.')
    .setDMPermission(false);

  bot.slashData.push(data.toJSON());

  bot.commands.set('challenge', {
    data,
    \1
      if (!requireSupporter(interaction.member)) {
        return interaction.reply({ ephemeral: true, content: "❌ You need the Supporter or Elite Collector role to use this command. Join on Ko-fi to unlock full access." });
      }

      // Channel restriction
      if (String(interaction.channelId) !== String(BATTLEFIELD_CHANNEL_ID)) {
        return interaction.reply({
          content: `⚠️ This command can only be used in <#${BATTLEFIELD_CHANNEL_ID}>.`,
          flags: MessageFlags.Ephemeral
        });
      }

      const invokerId = interaction.user.id;
      const invokerName = interaction.user.username;

      // Must be linked first (do not auto-link here)
      const linked = await await _loadJSONSafe(PATHS.linkedDecks);
      const myProfile = linked[invokerId];
      if (!myProfile) {
        return interaction.reply({
          content: '❌ You are not linked yet. Please run **/linkdeck** in **#manage-cards** before using Duel Bot commands.',
          flags: MessageFlags.Ephemeral
        });
      }

      // Ensure token for invoker
      const myToken = await ensureTokenIfLinked(invokerId, invokerName);
      if (!myToken) {
        return interaction.reply({
          content: '❌ You are not linked yet. Please run **/linkdeck** in **#manage-cards**.',
          flags: MessageFlags.Ephemeral
        });
      }

      // Build list of other linked users
      const entries = Object.entries(linked)
        .filter(([uid, prof]) => uid !== invokerId && isTokenValid(prof?.token));

      if (!entries.length) {
        return interaction.reply({
          content: '⚠️ No other linked users available to challenge.',
          flags: MessageFlags.Ephemeral
        });
      }

      const pageSize = 25;
      let page = 0;
      const pages = Math.ceil(entries.length / pageSize);

      const makePage = (p) => {
        const slice = entries.slice(p * pageSize, (p + 1) * pageSize);
        const row = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`challenge_select_${p}`)
            .setPlaceholder('Select a player to challenge')
            .addOptions(slice.map(([id, data]) => ({
              label: data.discordName || id,
              value: id
            })))
        );
        const nav = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('prev').setStyle(ButtonStyle.Secondary).setLabel('⏮ Prev').setDisabled(p === 0),
          new ButtonBuilder().setCustomId('next').setStyle(ButtonStyle.Secondary).setLabel('Next ⏭').setDisabled(p === pages - 1),
        );
        const text = `Page ${p + 1} of ${pages}`;
        return { row, nav, text };
      };

      const first = makePage(page);
      const msg = await interaction.reply({
        content: `⚔️ Choose a player to **challenge**\n${first.text}`,
        components: [first.row, first.nav],
        flags: MessageFlags.Ephemeral,
        fetchReply: true
      });

      const btnCollector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 60_000
      });

      btnCollector.on('collect', async i => {
        if (i.user.id !== invokerId) {
          return i.reply({ content: '⚠️ Not your menu.', flags: MessageFlags.Ephemeral });
        }
        if (i.customId === 'prev') page = Math.max(0, page - 1);
        if (i.customId === 'next') page = Math.min(pages - 1, page + 1);
        const built = makePage(page);
        await i.update({
          content: `⚔️ Choose a player to **challenge**\n${built.text}`,
          components: [built.row, built.nav]
        });
      });

      const ddCollector = msg.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 60_000
      });

      ddCollector.on('collect', async i => {
        if (i.user.id !== invokerId) {
          return i.reply({ content: '⚠️ Not your menu.', flags: MessageFlags.Ephemeral });
        }
        await i.deferUpdate();

        const opponentId = i.values[0];
        const oppProfile = linked[opponentId];
        if (!oppProfile?.token) {
          return interaction.editReply({
            content: '⚠️ That player is not fully linked yet.',
            components: []
          });
        }

        // Attempt to create a duel session via backend (preferred)
        let sessionId = '';
        let urlChallenger = '';
        let urlOpponent = '';

        const body = {
          initiatorId: invokerId,
          partnerId: opponentId,
          apiBase: PUBLIC_BACKEND_URL,
          duelUiBase: DUEL_UI_URL
        };

        try {
          const res = await fetch(`${INTERNAL_BACKEND_URL}/duel/start`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(BOT_API_KEY ? { 'X-Bot-Key': BOT_API_KEY } : {})
            },
            body: JSON.stringify(body)
          });
          const json = await res.json().catch(() => ({}));
          if (res.ok && json?.sessionId) {
            sessionId = String(json.sessionId);
            urlChallenger = json.urlInitiator || '';
            urlOpponent   = json.urlPartner   || '';
          } else {
            // Fallback to local construction if backend didn’t return urls
            sessionId = json.sessionId || crypto.randomBytes(10).toString('base64url');
          }
        } catch (e) {
          // Backend not available; fall back to constructed URLs
          sessionId = crypto.randomBytes(10).toString('base64url');
        }

        // If backend didn’t supply links, construct robust UI URLs with tokens
        const qpBase = new URLSearchParams();
        qpBase.set('mode', 'duel');
        qpBase.set('session', sessionId);
        if (PASS_API_QUERY) qpBase.set('api', PUBLIC_BACKEND_URL);
        const imgBase =
          cfg.image_base || cfg.IMAGE_BASE || 'https://madv313.github.io/Card-Collection-UI/images/cards';
        if (imgBase) qpBase.set('imgbase', imgBase);

        if (!urlChallenger) {
          const p = new URLSearchParams(qpBase);
          p.set('role', 'challenger');
          p.set('token', myToken);
          p.set('ts', String(Date.now()));
          urlChallenger = `${DUEL_UI_URL}?${p.toString()}`;
        }
        if (!urlOpponent) {
          const p = new URLSearchParams(qpBase);
          p.set('role', 'opponent');
          p.set('token', oppProfile.token);
          p.set('ts', String(Date.now() + 1));
          urlOpponent = `${DUEL_UI_URL}?${p.toString()}`;
        }

        // DM the opponent with Accept / Deny
        let dm;
        try {
          const oppUser = await bot.users.fetch(opponentId);
          const embed = new EmbedBuilder()
            .setTitle('⚔️ Duel Challenge')
            .setDescription(
              [
                `You have been challenged by <@${invokerId}>!`,
                '',
                'Do you accept the duel?',
                '',
                '_If accepted, both of you will receive personal links to join the duel._'
              ].join('\n')
            )
            .setColor(0xffcc00);

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`challenge_accept_${sessionId}`).setStyle(ButtonStyle.Success).setLabel('✅ Accept'),
            new ButtonBuilder().setCustomId(`challenge_deny_${sessionId}`).setStyle(ButtonStyle.Danger).setLabel('❌ Deny')
          );

          dm = await oppUser.send({ embeds: [embed], components: [row] });
        } catch (e) {
          // Couldn’t DM the opponent
          await interaction.editReply({
            content: `⚠️ Could not DM <@${opponentId}>. They may have DMs disabled. Try again later.`,
            components: []
          });
          try { btnCollector.stop(); } catch {}
          try { ddCollector.stop(); } catch {}
          return;
        }

        // Notify challenger we sent the request
        await interaction.editReply({
          content:
            `✅ Challenge sent to <@${opponentId}>.\n` +
            `They’ll receive a DM to accept or deny. Session: \`${sessionId}\``,
          components: []
        });

        // Set up a component collector on the DM
        const dmCollector = dm.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: 5 * 60_000 // 5 minutes
        });

        dmCollector.on('collect', async btnInt => {
          if (btnInt.user.id !== opponentId) {
            return btnInt.reply({ content: '⚠️ Only the challenged player can respond to this.', ephemeral: true });
          }

          const isAccept = btnInt.customId === `challenge_accept_${sessionId}`;
          const isDeny   = btnInt.customId === `challenge_deny_${sessionId}`;

          // Optionally inform backend of decision (ignore errors)
          try {
            await fetch(`${INTERNAL_BACKEND_URL}/duel/${encodeURIComponent(sessionId)}/decision`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...(BOT_API_KEY ? { 'X-Bot-Key': BOT_API_KEY } : {}) },
              body: JSON.stringify({ token: oppProfile.token, accept: isAccept })
            }).catch(() => {});
          } catch {}

          if (isDeny) {
            // Inform both players
            try {
              await btnInt.update({
                content: '❌ You **denied** the duel.',
                components: []
              });
            } catch {}
            try {
              const u1 = await bot.users.fetch(invokerId);
              await u1.send(`❌ Your duel challenge to <@${opponentId}> was **denied**.`);
            } catch {}
            try {
              const u2 = await bot.users.fetch(opponentId);
              await u2.send(`❌ You **denied** the duel from <@${invokerId}>.`);
            } catch {}
            try { dmCollector.stop(); } catch {}
            return;
          }

          if (isAccept) {
            // Send both players their role-specific links
            try {
              await btnInt.update({
                content: '✅ You **accepted** the duel. Check your link below:',
                components: []
              });
              await btnInt.followUp({
                content: `🎮 Your duel link (Opponent role): ${urlOpponent}`,
                ephemeral: false
              });
            } catch {}

            try {
              const u1 = await bot.users.fetch(invokerId);
              await u1.send(`🎮 Your duel link (Challenger role): ${urlChallenger}`);
            } catch {}

            // Optional: nudge both with status URL if you expose one
            try {
              const statusUrl = `${PUBLIC_BACKEND_URL}/duel/status`;
              const u1 = await bot.users.fetch(invokerId);
              await u1.send(`ℹ️ Duel status: ${statusUrl}`);
              const u2 = await bot.users.fetch(opponentId);
              await u2.send(`ℹ️ Duel status: ${statusUrl}`);
            } catch {}

            try { dmCollector.stop(); } catch {}
            return;
          }
        });

        dmCollector.on('end', async (_c, reason) => {
          if (reason === 'time') {
            try { await dm.edit({ content: '⌛ Challenge expired without a response.', components: [] }); } catch {}
            try {
              const u1 = await bot.users.fetch(invokerId);
              await u1.send(`⌛ Your duel challenge to <@${opponentId}> **expired**.`);
            } catch {}
          }
        });

        try { btnCollector.stop(); } catch {}
        try { ddCollector.stop(); } catch {}
      });

      const endAll = async () => {
        try {
          await interaction.editReply({
            content: '⏰ Challenge selection expired. Run **/challenge** again to restart.',
            components: []
          });
        } catch {}
      };
      btnCollector.on('end', (_c, r) => { if (r === 'time') endAll(); });
      ddCollector.on('end', (_c, r) => { if (r === 'time') endAll(); });
    }
  });
}
