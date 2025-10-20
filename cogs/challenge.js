// cogs/challenge.js
// Challenge another linked player to a duel.
// - Channel-locked (Battlefield)
// - Role-gated (Supporter/Elite)
// - Paged select menu of linked users (excludes self)
// - DMs opponent with Accept / Deny
// - Uses backend /duel/start and /duel/:session/decision if present; falls back to constructed URLs

import fs from 'fs/promises';
import fsSync from 'fs';
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
} from 'discord.js';

import { requireSupporter } from '../utils/roleGuard.js';
import { adminAlert } from '../utils/adminAlert.js';
import { L } from '../utils/logs.js';
import { loadJSON, saveJSON, PATHS } from '../utils/storageClient.js';

/* ───────────────────────────── Config & helpers ───────────────────────────── */

const DEFAULT_BATTLEFIELD_CHANNEL_ID = '1367986446232719484';
const BATTLEFIELD_CHANNEL_ID =
  process.env.BATTLEFIELD_CHANNEL_ID || DEFAULT_BATTLEFIELD_CHANNEL_ID;

// Railway heuristic to prefer 127.0.0.1 for internal calls
const IS_RAILWAY =
  !!process.env.RAILWAY_ENVIRONMENT ||
  !!process.env.RAILWAY_STATIC_URL ||
  !!process.env.RAILWAY_PROJECT_ID;

const PORT = process.env.PORT || '8080';

// Optional config.json (nice to have; safe if missing)
let cfg = {};
try {
  if (fsSync.existsSync('config.json')) {
    cfg = JSON.parse(fsSync.readFileSync('config.json', 'utf-8'));
  }
} catch (_) {}

const trim = (v) => String(v || '').trim().replace(/\/+$/, '');
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

// Public backend URL (for UIs to call)
const PUBLIC_BACKEND_URL = pick(
  ['DUEL_BACKEND_URL', 'BACKEND_URL', 'API_BASE'],
  ['duel_backend_base_url', 'api_base'],
  IS_RAILWAY ? 'https://example.invalid' : `http://localhost:${PORT}`
);

// Internal backend URL (for bot→server calls)
const INTERNAL_BACKEND_URL = pick(
  ['INTERNAL_BACKEND_URL'],
  [],
  IS_RAILWAY ? `http://127.0.0.1:${PORT}` : `http://localhost:${PORT}`
);

// Duel UI (public)
const DUEL_UI_URL = pick(
  ['DUEL_UI_URL', 'DUEL_UI'],
  ['duel_ui', 'duel_ui_url', 'ui_urls?.duel_ui'],
  'https://madv313.github.io/Duel-UI'
);

// Whether to always add &api=<public-backend> to UI links
const PASS_API_QUERY = String(
  process.env.PASS_API_QUERY ?? cfg.pass_api_query ?? 'true'
)
  .toLowerCase()
  .includes('true');

// Optional BOT API key for secure backend calls
const BOT_API_KEY =
  process.env.BOT_API_KEY ||
  process.env.X_BOT_KEY ||
  process.env.ADMIN_KEY ||
  '';

/* ───────────────────────────── Storage helpers ───────────────────────────── */

async function _loadLinkedDecksSafe() {
  try {
    return await loadJSON(PATHS.linkedDecks); // storageClient already returns parsed JSON
  } catch (e) {
    L.storage(`load fail ${PATHS.linkedDecks}: ${e.message}`);
    throw e;
  }
}

async function _saveLinkedDecksSafe(data, client) {
  try {
    await saveJSON(PATHS.linkedDecks, data);
  } catch (e) {
    await adminAlert(
      client,
      process.env.ADMIN_PAYOUT_CHANNEL_ID || process.env.ADMIN_PAYOUT_CHANNEL,
      `${PATHS.linkedDecks} save failed: ${e.message}`
    );
    throw e;
  }
}

function randomToken(len = 24) {
  return crypto.randomBytes(Math.ceil((len * 3) / 4)).toString('base64url').slice(0, len);
}
function isTokenValid(t) {
  return typeof t === 'string' && /^[A-Za-z0-9_-]{12,128}$/.test(t);
}

/** Ensure invoker has a token (only if already linked). Returns token or null if not linked. */
async function ensureTokenIfLinked(userId, userName, client) {
  const linked = await _loadLinkedDecksSafe();
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
    await _saveLinkedDecksSafe(linked, client);
  }
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
    async execute(interaction) {
      // Role gate
      if (!requireSupporter(interaction.member)) {
        return interaction.reply({
          ephemeral: true,
          content:
            '❌ You need the **Supporter** or **Elite Collector** role to use this command. Join on Ko-fi to unlock full access.',
        });
      }

      // Channel restriction
      if (String(interaction.channelId) !== String(BATTLEFIELD_CHANNEL_ID)) {
        return interaction.reply({
          ephemeral: true,
          content: `⚠️ This command can only be used in <#${BATTLEFIELD_CHANNEL_ID}>.`,
        });
      }

      const invokerId = interaction.user.id;
      const invokerName = interaction.user.username;

      // Must be linked first (no auto-link here)
      const linked = await _loadLinkedDecksSafe();
      const myProfile = linked[invokerId];
      if (!myProfile) {
        return interaction.reply({
          ephemeral: true,
          content:
            '❌ You are not linked yet. Please run **/linkdeck** in **#manage-cards** before using Duel Bot commands.',
        });
      }

      // Ensure token for invoker
      const myToken = await ensureTokenIfLinked(invokerId, invokerName, interaction.client);
      if (!myToken) {
        return interaction.reply({
          ephemeral: true,
          content:
            '❌ You are not linked yet. Please run **/linkdeck** in **#manage-cards**.',
        });
      }

      // Build list of other linked users
      const entries = Object.entries(linked).filter(
        ([uid, prof]) => uid !== invokerId && isTokenValid(prof?.token)
      );

      if (!entries.length) {
        return interaction.reply({
          ephemeral: true,
          content: '⚠️ No other linked users available to challenge.',
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
            .addOptions(
              slice.map(([id, data]) => ({
                label: data.discordName || id,
                value: id,
              }))
            )
        );
        const nav = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('prev')
            .setStyle(ButtonStyle.Secondary)
            .setLabel('⏮ Prev')
            .setDisabled(p === 0),
          new ButtonBuilder()
            .setCustomId('next')
            .setStyle(ButtonStyle.Secondary)
            .setLabel('Next ⏭')
            .setDisabled(p === pages - 1)
        );
        const text = `Page ${p + 1} of ${pages}`;
        return { row, nav, text };
      };

      const first = makePage(page);
      const msg = await interaction.reply({
        content: `⚔️ Choose a player to **challenge**\n${first.text}`,
        components: [first.row, first.nav],
        ephemeral: true,
        fetchReply: true,
      });

      const btnCollector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 60_000,
      });

      btnCollector.on('collect', async (i) => {
        if (i.user.id !== invokerId) {
          return i.reply({ content: '⚠️ Not your menu.', ephemeral: true });
        }
        if (i.customId === 'prev') page = Math.max(0, page - 1);
        if (i.customId === 'next') page = Math.min(pages - 1, page + 1);
        const built = makePage(page);
        await i.update({
          content: `⚔️ Choose a player to **challenge**\n${built.text}`,
          components: [built.row, built.nav],
        });
      });

      const ddCollector = msg.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 60_000,
      });

      ddCollector.on('collect', async (i) => {
        if (i.user.id !== invokerId) {
          return i.reply({ content: '⚠️ Not your menu.', ephemeral: true });
        }
        await i.deferUpdate();

        const opponentId = i.values[0];
        const oppProfile = linked[opponentId];
        if (!oppProfile?.token) {
          return interaction.editReply({
            content: '⚠️ That player is not fully linked yet.',
            components: [],
          });
        }

        // Try to create a duel session via backend (preferred)
        let sessionId = '';
        let urlChallenger = '';
        let urlOpponent = '';

        const body = {
          initiatorId: invokerId,
          partnerId: opponentId,
          apiBase: PUBLIC_BACKEND_URL,
          duelUiBase: DUEL_UI_URL,
        };

        try {
          const res = await fetch(`${INTERNAL_BACKEND_URL}/duel/start`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(BOT_API_KEY ? { 'X-Bot-Key': BOT_API_KEY } : {}),
            },
            body: JSON.stringify(body),
          });
          const json = await res.json().catch(() => ({}));
          if (res.ok && json?.sessionId) {
            sessionId = String(json.sessionId);
            urlChallenger = json.urlInitiator || '';
            urlOpponent = json.urlPartner || '';
          } else {
            // Fallback if backend didn’t produce a link
            sessionId =
              json.sessionId || crypto.randomBytes(10).toString('base64url');
          }
        } catch {
          // Backend unreachable → fallback
          sessionId = crypto.randomBytes(10).toString('base64url');
        }

        // Construct URLs if backend didn’t supply them
        const qpBase = new URLSearchParams();
        qpBase.set('mode', 'duel');
        qpBase.set('session', sessionId);
        if (PASS_API_QUERY) qpBase.set('api', PUBLIC_BACKEND_URL);
        const imgBase =
          cfg.image_base ||
          cfg.IMAGE_BASE ||
          'https://madv313.github.io/Card-Collection-UI/images/cards';
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
                '_If accepted, both of you will receive personal links to join the duel._',
              ].join('\n')
            )
            .setColor(0xffcc00);

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`challenge_accept_${sessionId}`)
              .setStyle(ButtonStyle.Success)
              .setLabel('✅ Accept'),
            new ButtonBuilder()
              .setCustomId(`challenge_deny_${sessionId}`)
              .setStyle(ButtonStyle.Danger)
              .setLabel('❌ Deny')
          );

          dm = await oppUser.send({ embeds: [embed], components: [row] });
        } catch (e) {
          await interaction.editReply({
            content: `⚠️ Could not DM <@${opponentId}>. They may have DMs disabled. Try again later.`,
            components: [],
          });
          try {
            btnCollector.stop();
          } catch {}
          try {
            ddCollector.stop();
          } catch {}
          return;
        }

        // Notify challenger we sent the request
        await interaction.editReply({
          content:
            `✅ Challenge sent to <@${opponentId}>.\n` +
            `They’ll receive a DM to accept or deny. Session: \`${sessionId}\``,
          components: [],
        });

        // DM button collector
        const dmCollector = dm.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: 5 * 60_000, // 5 minutes
        });

        dmCollector.on('collect', async (btnInt) => {
          if (btnInt.user.id !== opponentId) {
            return btnInt.reply({
              content: '⚠️ Only the challenged player can respond to this.',
              ephemeral: true,
            });
          }

          const isAccept =
            btnInt.customId === `challenge_accept_${sessionId}`;
          const isDeny = btnInt.customId === `challenge_deny_${sessionId}`;

          // Best-effort: inform backend of decision
          try {
            await fetch(
              `${INTERNAL_BACKEND_URL}/duel/${encodeURIComponent(
                sessionId
              )}/decision`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(BOT_API_KEY ? { 'X-Bot-Key': BOT_API_KEY } : {}),
                },
                body: JSON.stringify({ token: oppProfile.token, accept: isAccept }),
              }
            ).catch(() => {});
          } catch {}

          if (isDeny) {
            // Inform both
            try {
              await btnInt.update({
                content: '❌ You **denied** the duel.',
                components: [],
              });
            } catch {}
            try {
              const u1 = await bot.users.fetch(invokerId);
              await u1.send(
                `❌ Your duel challenge to <@${opponentId}> was **denied**.`
              );
            } catch {}
            try {
              const u2 = await bot.users.fetch(opponentId);
              await u2.send(
                `❌ You **denied** the duel from <@${invokerId}>.`
              );
            } catch {}
            try {
              dmCollector.stop();
            } catch {}
            return;
          }

          if (isAccept) {
            // Send both role-specific links
            try {
              await btnInt.update({
                content:
                  '✅ You **accepted** the duel. Check your link below:',
                components: [],
              });
              await btnInt.followUp({
                content: `🎮 Your duel link (Opponent role): ${urlOpponent}`,
              });
            } catch {}

            try {
              const u1 = await bot.users.fetch(invokerId);
              await u1.send(
                `🎮 Your duel link (Challenger role): ${urlChallenger}`
              );
            } catch {}

            // Optional status nudge
            try {
              const statusUrl = `${PUBLIC_BACKEND_URL}/duel/status`;
              const u1 = await bot.users.fetch(invokerId);
              await u1.send(`ℹ️ Duel status: ${statusUrl}`);
              const u2 = await bot.users.fetch(opponentId);
              await u2.send(`ℹ️ Duel status: ${statusUrl}`);
            } catch {}

            try {
              dmCollector.stop();
            } catch {}
            return;
          }
        });

        dmCollector.on('end', async (_c, reason) => {
          if (reason === 'time') {
            try {
              await dm.edit({
                content: '⌛ Challenge expired without a response.',
                components: [],
              });
            } catch {}
            try {
              const u1 = await bot.users.fetch(invokerId);
              await u1.send(
                `⌛ Your duel challenge to <@${opponentId}> **expired**.`
              );
            } catch {}
          }
        });

        try {
          btnCollector.stop();
        } catch {}
        try {
          ddCollector.stop();
        } catch {}
      });

      const endAll = async () => {
        try {
          await interaction.editReply({
            content:
              '⏰ Challenge selection expired. Run **/challenge** again to restart.',
            components: [],
          });
        } catch {}
      };
      btnCollector.on('end', (_c, r) => {
        if (r === 'time') endAll();
      });
      ddCollector.on('end', (_c, r) => {
        if (r === 'time') endAll();
      });
    },
  });
}
