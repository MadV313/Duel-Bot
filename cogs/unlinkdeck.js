// cogs/unlinkdeck.js
// Admin-only: unlink a user's TCG profile and purge related data.
// Now also clears the authoritative daily trade usage scanned by routes/trade.js
// by editing the remote-persisted files via storageClient:
//   • data/trades.json (remove/expire today's sessions initiated by the user)
//   • data/trade_limits.json (sync / cleanup legacy counters)
//
// (alongside existing PATHS.* public/data purges)

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
const FALLBACK_ADMIN_CHAN   = '1368023977519222895';
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
async function tryDeleteLocalRevealFiles(userId, token) {
  const files = [
    path.join(LOCAL_REVEALS_DIR, `reveal_${userId}.json`),
    token ? path.join(LOCAL_REVEALS_DIR, `reveal_${token}.json`) : null,
  ].filter(Boolean);
  for (const fp of files) { try { await fs.promises.unlink(fp); } catch {} }
}

/* Date helpers used for trade reset logic */
function todayStr() { return new Date().toISOString().slice(0,10); }
function dayOf(iso) { try { return new Date(iso).toISOString().slice(0,10); } catch { return todayStr(); } }

/* Purge TODAY's trade initiations from the authoritative remote store.
   This is the one the backend routes/trade.js scans to enforce the 3/day rule. */
async function purgeTodaysTradeStartsFromAuthoritativeStore(userId, alsoDeleteLegacy = true) {
  const TRADES_PATH = 'data/trades.json';
  const LIMITS_PATH = 'data/trade_limits.json';
  const day = todayStr();

  // 1) Remove (or expire) today's sessions where this user is the initiator
  let trades = {};
  try { trades = await loadJSON(TRADES_PATH); } catch { trades = {}; }

  let changed = false;
  // Remove ONLY today's non-expired sessions initiated by this user
  for (const [sid, s] of Object.entries(trades || {})) {
    if (!s) continue;
    if (String(s?.initiator?.userId) !== String(userId)) continue;
    if (dayOf(s.createdAt) !== day) continue;
    if (s.status === 'expired') continue;

    // Either delete or mark expired; deleting keeps the file lean.
    delete trades[sid];
    changed = true;
  }

  if (changed) {
    await saveJSON(TRADES_PATH, trades);
  }

  // 2) Legacy counter file: sync or remove today's bucket for this user
  if (alsoDeleteLegacy) {
    try {
      const limits = await loadJSON(LIMITS_PATH).catch(() => ({}));
      if (limits?.[userId]?.[day] != null) {
        delete limits[userId][day];
        if (!Object.keys(limits[userId]).length) delete limits[userId];
        await saveJSON(LIMITS_PATH, limits);
      }
    } catch {}
  }
}

/* Reset daily sell counters (profile) + nuke rate/limit stores */
async function resetSellCountersEverywhere({ userId, token }) {
  // 1) Linked profile counters
  try {
    const linked = await loadJSON(PATHS.linkedDecks).catch(() => ({}));
    const prof = linked[userId];
    if (prof) {
      prof.sellCountToday = 0;
      prof.sellCountDate  = '1970-01-01';
      if (prof.token) prof.token = `UNLINKED_${Date.now()}`; // invalidate old token references
      linked[userId] = prof;
      await saveJSON(PATHS.linkedDecks, linked);
    }
  } catch {}

  // 2) Common public/data stores (safe if missing)
  const candidateStores = [
    'tradeLimits',
    'sellStatus',
    'rateLimits',
    'sellDaily',
    'sellCounters',
  ].map(k => PATHS?.[k]).filter(Boolean);

  for (const storePath of candidateStores) {
    try {
      const store = await loadJSON(storePath).catch(() => ({}));
      let changed = false;
      if (purgeFromObject(store, userId)) changed = true;
      if (token && purgeFromObject(store, token)) changed = true;
      if (changed) await saveJSON(storePath, store);
    } catch {}
  }

  // 3) Authoritative trade usage (remote data/*) — handled via storageClient, not FS
  await purgeTodaysTradeStartsFromAuthoritativeStore(userId, /*alsoDeleteLegacy*/ true);
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
      const inAdminRole = hasAnyAdminRole(interaction.member);
      if (!inAdminRole) {
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

        // 🔄 Reset counters/limits in public/data and the authoritative backend data/*
        await resetSellCountersEverywhere({ userId, token });

        // 1) Remove from linked_decks (public/data)
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

        // 4) Remove from trade_limits (public/data view copy)
        try {
          const limits = await loadJSON(PATHS.tradeLimits).catch(() => ({}));
          let changed = false;
          if (purgeFromObject(limits, userId)) changed = true;
          if (token && purgeFromObject(limits, token)) changed = true;
          if (changed) await saveJSON(PATHS.tradeLimits, limits);
        } catch {}

        // 5) Purge any trades involving this user (public/data mirror, if present)
        try {
          const trades = await loadJSON(PATHS.trades).catch(() => ({}));
          if (purgeSessionsMap(trades, userId)) {
            await saveJSON(PATHS.trades, trades);
          }
        } catch {}

        // 6) Purge any duel sessions involving this user
        try {
          const duels = await loadJSON(PATHS.duelSessions).catch(() => ({}));
          if (purgeSessionsMap(duels, userId)) {
            await saveJSON(PATHS.duelSessions, duels);
          }
        } catch {}

        // 7) Best-effort cleanup of local reveal files (if they exist)
        try { await tryDeleteLocalRevealFiles(userId, token); } catch {}

        await interaction.editReply({
          content: `✅ Successfully unlinked **${display}**, reset **today’s trade usage** (authoritative store), synced legacy trade limits, reset sell counters, and purged associated data.`,
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
