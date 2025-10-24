// cogs/unlinkdeck.js
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

export default async function registerUnlinkDeck(client) {
  const CFG = loadConfig();
  const FALLBACK_ADMIN_ROLE = '1173049392371085392';
  const FALLBACK_ADMIN_CHAN = '1368023977519222895';
  const ADMIN_ROLE_IDS = Array.isArray(CFG.admin_role_ids) && CFG.admin_role_ids.length
    ? CFG.admin_role_ids
    : [FALLBACK_ADMIN_ROLE];
  const ADMIN_CHANNEL_ID = String(CFG.admin_payout_channel_id || FALLBACK_ADMIN_CHAN);
  const LOCAL_REVEALS_DIR = String(CFG.reveals_dir || './public/data').replace(/\/+$/, '');

  /* ───────────────────────── Small helpers ───────────────────────── */
  const hasAnyAdminRole = (member) =>
    Array.isArray(ADMIN_ROLE_IDS) && member?.roles?.cache
      ? ADMIN_ROLE_IDS.some(rid => member.roles.cache.has(rid))
      : false;

  const purgeFromObject = (obj, key) => {
    if (!obj || typeof obj !== 'object') return false;
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      delete obj[key];
      return true;
    }
    return false;
  };

  const purgeSessionsMap = (obj, userId) => {
    if (!obj || typeof obj !== 'object') return false;
    let changed = false;
    for (const [sid, sess] of Object.entries(obj)) {
      const players = Array.isArray(sess?.players) ? sess.players : [];
      const matchPlayers = players.some(p => String(p?.userId || p?.id) === String(userId));
      const aMatch = String(sess?.aId || sess?.challenger?.userId || sess?.challenger?.id || '') === String(userId);
      const bMatch = String(sess?.bId || sess?.opponent?.userId || sess?.opponent?.id || '') === String(userId);
      if (matchPlayers || aMatch || bMatch) {
        delete obj[sid];
        changed = true;
      }
    }
    return changed;
  };

  const tryDeleteLocalRevealFiles = async (userId, token) => {
    const files = [
      path.join(LOCAL_REVEALS_DIR, `reveal_${userId}.json`),
      token ? path.join(LOCAL_REVEALS_DIR, `reveal_${token}.json`) : null,
    ].filter(Boolean);
    for (const fp of files) {
      try { await fs.promises.unlink(fp); } catch {}
    }
  };

  const resetSellCountersEverywhere = async ({ userId, token }) => {
    try {
      const linked = await loadJSON(PATHS.linkedDecks).catch(() => ({}));
      const prof = linked[userId];
      if (prof) {
        prof.sellCountToday = 0;
        prof.sellCountDate = '1970-01-01';
        if (prof.token) prof.token = `UNLINKED_${Date.now()}`;
        linked[userId] = prof;
        await saveJSON(PATHS.linkedDecks, linked);
      }
    } catch {}

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
  };

  /* ───────────────────────── Slash Command ───────────────────────── */
  const data = new SlashCommandBuilder()
    .setName('unlinkdeck')
    .setDescription('Admin only: Unlink a user’s card profile and purge associated data.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

  client.slashData.push(data.toJSON());

  client.commands.set('unlinkdeck', {
    data,
    async execute(interaction) {
      if (!hasAnyAdminRole(interaction.member))
        return interaction.reply({ content: '🚫 You do not have permission to use this command.', ephemeral: true });
      if (String(interaction.channelId) !== String(ADMIN_CHANNEL_ID))
        return interaction.reply({
          content: '❌ This command MUST be used in the SV13 TCG admin tools channel.',
          ephemeral: true
        });

      let linked = {};
      try { linked = await loadJSON(PATHS.linkedDecks); } catch {}

      const entries = Object.entries(linked);
      if (!entries.length)
        return interaction.reply({ content: '⚠️ No linked users found.', ephemeral: true });

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
        if (i.user.id !== interaction.user.id)
          return i.reply({ content: '⚠️ You cannot interact with this menu.', ephemeral: true });
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
        if (i.user.id !== interaction.user.id)
          return i.reply({ content: '⚠️ You cannot interact with this menu.', ephemeral: true });
        await i.deferUpdate();

        const userId = i.values[0];
        let linkedNow = {};
        try { linkedNow = await loadJSON(PATHS.linkedDecks); } catch {}
        const prof = linkedNow[userId];
        const display = prof?.discordName || userId;
        const token = prof?.token || '';

        // 🔄 Reset sell counters + trade limits
        await resetSellCountersEverywhere({ userId, token });

        // Purge all related data
        const remove = async (storePath) => {
          try {
            const store = await loadJSON(storePath).catch(() => ({}));
            if (purgeFromObject(store, userId) || (token && purgeFromObject(store, token)))
              await saveJSON(storePath, store);
          } catch {}
        };

        await remove(PATHS.linkedDecks);
        await remove(PATHS.wallet);
        await remove(PATHS.playerData);
        await remove(PATHS.tradeLimits);
        await remove(PATHS.trades);
        await remove(PATHS.duelSessions);
        await tryDeleteLocalRevealFiles(userId, token);

        await interaction.editReply({
          content: `✅ Successfully unlinked **${display}**, reset trade & sell limits, and purged associated data.`,
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
