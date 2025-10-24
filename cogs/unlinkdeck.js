// cogs/unlinkdeck.js
// Admin-only: unlink a user's TCG profile and purge related data.
// - Admin channel + admin role gated
// - Paginated dropdown UI (25 per page)
// - Purges: linked_decks, wallet, player_data, trade_limits, trades (sessions with user), duel_sessions (sessions with user)
// - Best-effort cleanup of pack reveal artifacts
// - Also resets daily sell counters AND daily trade limits/sessions.
//
// Config resolution order: ENV.CONFIG_JSON → config.json → defaults
// Config / ENV keys used:
//   admin_role_ids[], admin_payout_channel_id (or fallback ADMIN_ROLE_ID/ADMIN_CHANNEL_ID in code)
//   reveals_dir (optional local FS fallback for reveal_*.json)

import fs from 'fs';
import path from 'path';
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
} from 'discord.js';
import { loadJSON, saveJSON, PATHS } from '../utils/storageClient.js';

/* ───────────────────────── Config helpers ───────────────────────── */
function loadConfig() {
  try { if (process.env.CONFIG_JSON) return JSON.parse(process.env.CONFIG_JSON); }
  catch (e) { console.warn('[unlinkdeck] CONFIG_JSON parse error:', e?.message); }
  try { if (fs.existsSync('config.json')) return JSON.parse(fs.readFileSync('config.json', 'utf-8')) || {}; }
  catch {}
  return {};
}
const CFG = loadConfig();
const FALLBACK_ADMIN_ROLE   = '1173049392371085392';
the const FALLBACK_ADMIN_CHAN   = '1368023977519222895';
const ADMIN_ROLE_IDS        = Array.isArray(CFG.admin_role_ids) && CFG.admin_role_ids.length ? CFG.admin_role_ids : [FALLBACK_ADMIN_ROLE];
const ADMIN_CHANNEL_ID      = String(CFG.admin_payout_channel_id || FALLBACK_ADMIN_CHAN);
const LOCAL_REVEALS_DIR     = String(CFG.reveals_dir || './public/data').replace(/\/+$/, ''); // FS fallback

/* ───────────────────────── Small helpers ───────────────────────── */
function hasAnyAdminRole(member) {
  const cache = member?.roles?.cache;
  if (!cache) return false;
  return ADMIN_ROLE_IDS.some(rid => cache.has(rid));
}

function purgeFromObject(obj, key) {
  if (!obj || typeof obj !== 'object') return false;
  if (Object.prototype.hasOwnProperty.call(obj, key)) {
    delete obj[key];
    return true;
  }
  return false;
}

// Old generic session purge (kept for backwards compat)
function purgeSessionsMap(obj, userId) {
  if (!obj || typeof obj !== 'object') return false;
  let changed = false;
  for (const [sid, sess] of Object.entries(obj)) {
    const players = Array.isArray(sess?.players) ? sess.players : [];
    const matchPlayers = players.some(p => String(p?.userId || p?.id) === String(userId));
    const aMatch = String(sess?.aId || sess?.challenger?.userId || sess?.challenger?.id || '') === String(userId);
    const bMatch = String(sess?.bId || sess?.opponent?.userId   || sess?.opponent?.id   || '') === String(userId);
    if (matchPlayers || aMatch || bMatch) {
      delete obj[sid];
      changed = true;
    }
  }
  return changed;
}

// NEW: Purge sessions matching the *trade router* shape ({ initiator.userId, partner.userId })
function purgeTradeSessionsForUser(tradesObj, userId) {
  if (!tradesObj || typeof tradesObj !== 'object') return false;
  let changed = false;
  for (const [sid, sess] of Object.entries(tradesObj)) {
    const ini = String(sess?.initiator?.userId || '');
    const par = String(sess?.partner?.userId || '');
    if (ini === String(userId) || par === String(userId)) {
      delete tradesObj[sid];
      changed = true;
    }
  }
  return changed;
}

async function tryDeleteLocalRevealFiles(userId, token) {
  // Only best-effort local delete (not critical in Persistent Data mode)
  const files = [
    path.join(LOCAL_REVEALS_DIR, `reveal_${userId}.json`),
    token ? path.join(LOCAL_REVEALS_DIR, `reveal_${token}.json`) : null,
  ].filter(Boolean);

  for (const fp of files) {
    try { await fs.promises.unlink(fp); }
    catch { /* ignore */ }
  }
}

async function resetSellCountersEverywhere({ userId, token }) {
  // 1) Reset in linked_decks profile fields (sellCountDate/Today), and drop token (best-effort).
  try {
    const linked = await loadJSON(PATHS.linkedDecks).catch(() => ({}));
    const prof = linked[userId];
    if (prof) {
      prof.sellCountToday = 0;
      prof.sellCountDate  = '1970-01-01';      // ensures "not today" for any local checks
      if (prof.token) prof.token = `UNLINKED_${Date.now()}`;
      linked[userId] = prof;
      await saveJSON(PATHS.linkedDecks, linked);
    }
  } catch { /* ignore */ }

  // 2) Clean backend-side limit stores we know about:
  const candidateStores = [
    'tradeLimits',
    'sellStatus',     // optional (safe if missing)
    'rateLimits',     // optional
    'sellDaily',      // optional
    'sellCounters',   // optional
  ].map(k => PATHS?.[k]).filter(Boolean);

  for (const storePath of candidateStores) {
    try {
      const store = await loadJSON(storePath).catch(() => ({}));
      let changed = false;
      if (purgeFromObject(store, userId)) changed = true;
      if (token && purgeFromObject(store, token)) changed = true;
      if (changed) await saveJSON(storePath, store);
    } catch { /* ignore */ }
  }
}

// NEW: Reset daily TRADE usage as well
async function resetTradeCountersEverywhere({ userId, token }) {
  // a) Remove user (and token) from trade_limits.json completely
  try {
    const limits = await loadJSON(PATHS.tradeLimits).catch(() => ({}));
    let changed = false;
    if (purgeFromObject(limits, userId)) changed = true;
    if (token && purgeFromObject(limits, token)) changed = true;
    if (changed) await saveJSON(PATHS.tradeLimits, limits);
  } catch { /* ignore */ }

  // b) Purge all trade sessions (TRADES_FILE) that involve this user, including today's
  try {
    const trades = await loadJSON(PATHS.trades).catch(() => ({}));
    // Support BOTH new (initiator/partner) and legacy shapes
    const changedNew = purgeTradeSessionsForUser(trades, userId);
    const changedOld = purgeSessionsMap(trades, userId);
    if (changedNew || changedOld) {
      await saveJSON(PATHS.trades, trades);
    }
  } catch { /* ignore */ }
}

/* ───────────────────────── Command ───────────────────────── */
export default async function registerUnlinkDeck(client) {
  const data = new SlashCommandBuilder()
    .setName('unlinkdeck')
    .setDescription('Admin only: Unlink a user’s card profile and purge associated data.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

  client.slashData.push(data.toJSON());

  client.commands.set('unlinkdeck', {
    data,
    async execute(interaction) {
      // Role & channel guard
      if (!hasAnyAdminRole(interaction.member)) {
        return interaction.reply({ content: '🚫 You do not have permission to use this command.', ephemeral: true });
      }
      if (String(interaction.channelId) !== String(ADMIN_CHANNEL_ID)) {
        return interaction.reply({
          content: '❌ This command MUST be used in the SV13 TCG admin tools channel.',
          ephemeral: true
        });
      }

      // Load linked profiles
      let linked = {};
      try { linked = await loadJSON(PATHS.linkedDecks); } catch { linked = {}; }

      const entries = Object.entries(linked);
      if (!entries.length) {
        return interaction.reply({ content: '⚠️ No linked users found.', ephemeral: true });
      }

      // Pagination
      const pageSize = 25;
      let page = 0;
      const pages = Math.ceil(entries.length / pageSize);

      const makePage = (p) => {
        const slice = entries.slice(p * pageSize, (p + 1) * pageSize);
        const options = slice.map(([id, prof]) => ({
          label: prof?.discordName || id,
          value: id,
        }));

        const dropdown = new StringSelectMenuBuilder()
          .setCustomId(`unlinkdeck_select_${p}`)
          .setPlaceholder('🔻 Choose a user to unlink')
          .addOptions(options);

        const rowSelect = new ActionRowBuilder().addComponents(dropdown);
        const rowNav = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('prev').setStyle(ButtonStyle.Secondary).setLabel('⏮ Prev').setDisabled(p === 0),
          new ButtonBuilder().setCustomId('next').setStyle(ButtonStyle.Secondary).setLabel('Next ⏭').setDisabled(p === pages - 1),
        );

        const embed = new EmbedBuilder()
          .setTitle('📋 Select a user to unlink')
          .setDescription(`Page ${p + 1} of ${pages} — ${entries.length} total users`)
          .setColor(0xcc3300);

        return { embed, rowSelect, rowNav };
      };

      const first = makePage(page);
      const msg = await interaction.reply({
        embeds: [first.embed],
        components: [first.rowSelect, first.rowNav],
        ephemeral: true,
        fetchReply: true
      });

      const btnCollector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 60_000
      });

      btnCollector.on('collect', async i => {
        if (i.user.id !== interaction.user.id) {
          return i.reply({ content: '⚠️ You cannot interact with this menu.', ephemeral: true });
        }
        if (i.customId === 'prev') page = Math.max(0, page - 1);
        if (i.customId === 'next') page = Math.min(pages - 1, page + 1);
        const built = makePage(page);
        await i.update({ embeds: [built.embed], components: [built.rowSelect, built.rowNav] });
      });

      const ddCollector = msg.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 60_000
      });

      ddCollector.on('collect', async i => {
        if (i.user.id !== interaction.user.id) {
          return i.reply({ content: '⚠️ You cannot interact with this menu.', ephemeral: true });
        }
        await i.deferUpdate();

        const userId = i.values[0];
        // Re-read latest snapshot (reduce race)
        let linkedNow = {};
        try { linkedNow = await loadJSON(PATHS.linkedDecks); } catch { linkedNow = {}; }
        const prof = linkedNow[userId];
        const display = prof?.discordName || userId;
        const token   = prof?.token || '';

        // Reset daily SELL counters & any related limit stores
        await resetSellCountersEverywhere({ userId, token });

        // Reset daily TRADE counters & purge trade sessions (new & old shapes)
        await resetTradeCountersEverywhere({ userId, token });

        // 1) Remove from linked_decks
        const removed = purgeFromObject(linkedNow, userId);
        if (removed) {
          try { await saveJSON(PATHS.linkedDecks, linkedNow); } catch {}
        }

        // 2) Remove from wallet
        try {
          const wallet = await loadJSON(PATHS.wallet).catch(() => ({}));
          if (purgeFromObject(wallet, userId)) {
            await saveJSON(PATHS.wallet, wallet);
          }
        } catch {}

        // 3) Remove from player_data
        try {
          const playerData = await loadJSON(PATHS.playerData).catch(() => ({}));
          if (purgeFromObject(playerData, userId)) {
            await saveJSON(PATHS.playerData, playerData);
          }
        } catch {}

        // (Trade limits already cleared in resetTradeCountersEverywhere)

        // 5) Purge any *legacy* duel sessions involving this user
        try {
          const duels = await loadJSON(PATHS.duelSessions).catch(() => ({}));
          if (purgeSessionsMap(duels, userId)) {
            await saveJSON(PATHS.duelSessions, duels);
          }
        } catch {}

        // 6) Best-effort cleanup of local reveal files (if they exist)
        try { await tryDeleteLocalRevealFiles(userId, token); } catch {}

        await interaction.editReply({
          content: `✅ Successfully unlinked **${display}**, reset sell *and* trade daily counters, and purged associated data.`,
          embeds: [],
          components: []
        });

        try { btnCollector.stop(); } catch {}
        try { ddCollector.stop(); } catch {}
      });

      const endAll = async () => {
        try {
          await interaction.editReply({
            content: '⏰ No selection made. Command cancelled.',
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
