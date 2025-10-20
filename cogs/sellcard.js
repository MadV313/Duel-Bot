// cogs/sellcard.js
// /sellcard — Sell cards from your collection for coins.
//
// - Confined to #manage-cards
// - Requires Supporter/Elite role and a linked profile
// - Validates card id & quantity
// - Uses rarity-based prices (CONFIG_JSON or config.json; sane defaults)
// - Updates wallet.json and mirrors coins into linkedDecks
// - Enforces a daily sell limit (default 5 cards/day)

import fs from 'fs';
import path from 'path';
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { loadJSON, saveJSON, PATHS } from '../utils/storageClient.js';
import { requireSupporter } from '../utils/roleGuard.js';

/* ───────────────────────── Config helpers ───────────────────────── */
function loadConfig() {
  try { if (process.env.CONFIG_JSON) return JSON.parse(process.env.CONFIG_JSON); }
  catch (e) { console.warn('[sellcard] CONFIG_JSON parse error:', e?.message); }
  try { if (fs.existsSync('config.json')) return JSON.parse(fs.readFileSync('config.json', 'utf-8')) || {}; }
  catch {}
  return {};
}
const trim = s => String(s || '').trim().replace(/\/+$/, '');

/* ───────────────────────── Defaults ───────────────────────── */
const DEFAULT_MANAGE_CARDS_CHANNEL_ID = '1367977677658656868';
const CORE_PATH = path.resolve('./logic/CoreMasterReference.json');

const DEFAULT_SELL = { common: 0.5, uncommon: 0.5, rare: 0.5, legendary: 1 };
const DEFAULT_DAILY_LIMIT = 5; // total cards/day

/* ───────────────────────── Core rarity map ───────────────────────── */
function loadCoreRarityMap() {
  try {
    const raw = fs.readFileSync(CORE_PATH, 'utf-8');
    const arr = JSON.parse(raw);
    const map = {};
    for (const c of arr) {
      const id = String(c.card_id ?? '').padStart(3, '0');
      if (id && id !== '000' && c.rarity) map[id] = String(c.rarity);
    }
    return map;
  } catch (e) {
    console.error('[sellcard] Failed to load CoreMasterReference:', e?.message || e);
    return {};
  }
}
const rarityMap = loadCoreRarityMap();

/* ───────────────────────── Small helpers ───────────────────────── */
const todayUTC = () => new Date().toISOString().slice(0, 10);
const to3 = v => String(v).padStart(3, '0');

/* ───────────────────────── Command ───────────────────────── */
export default async function registerSellCard(client) {
  const CFG = loadConfig();

  const MANAGE_CARDS_CHANNEL_ID =
    String(CFG.manage_cards_channel_id || CFG.manage_cards || CFG['manage-cards'] || DEFAULT_MANAGE_CARDS_CHANNEL_ID);

  const sellValues = {
    common:    Number(CFG?.coin_system?.card_sell_values?.common    ?? DEFAULT_SELL.common),
    uncommon:  Number(CFG?.coin_system?.card_sell_values?.uncommon  ?? DEFAULT_SELL.uncommon),
    rare:      Number(CFG?.coin_system?.card_sell_values?.rare      ?? DEFAULT_SELL.rare),
    legendary: Number(CFG?.coin_system?.card_sell_values?.legendary ?? DEFAULT_SELL.legendary),
  };

  const DAILY_LIMIT = Number(
    CFG?.trade_system?.sell_limit_per_day ??
    CFG?.coin_system?.sell_limit_per_day ??
    DEFAULT_DAILY_LIMIT
  );

  const command = new SlashCommandBuilder()
    .setName('sellcard')
    .setDescription('Sell cards from your collection for coins (daily limit applies).')
    .addStringOption(o =>
      o.setName('card_id')
        .setDescription('Card # (001–127)')
        .setRequired(true))
    .addIntegerOption(o =>
      o.setName('qty')
        .setDescription('Quantity to sell (1–50)')
        .setRequired(true))
    .setDMPermission(false);

  client.slashData.push(command.toJSON());

  client.commands.set('sellcard', {
    data: command,
    async execute(interaction) {
      // Role gate
      if (!requireSupporter(interaction.member)) {
        return interaction.reply({
          ephemeral: true,
          content: '❌ You need the **Supporter** or **Elite Collector** role to use this command. Join on Ko-fi to unlock full access.'
        });
      }

      // Channel gate
      if (interaction.channelId !== MANAGE_CARDS_CHANNEL_ID) {
        return interaction.reply({
          content: `🧾 Please use this command in <#${MANAGE_CARDS_CHANNEL_ID}>.`,
          ephemeral: true
        });
      }

      const userId = interaction.user.id;
      const userName = interaction.user.username;

      const rawId = interaction.options.getString('card_id', true);
      const id = to3(rawId);
      const qty = interaction.options.getInteger('qty', true);

      if (!/^\d{3}$/.test(id)) {
        return interaction.reply({ content: '❌ Invalid card id. Use a 3-digit id like `045`.', ephemeral: true });
      }
      const n = Number(id);
      if (n < 1 || n > 127) {
        return interaction.reply({ content: '❌ Card id must be between 001 and 127.', ephemeral: true });
      }
      if (!Number.isInteger(qty) || qty < 1 || qty > 50) {
        return interaction.reply({ content: '❌ Quantity must be between 1 and 50.', ephemeral: true });
      }

      // Load stores from Persistent Data
      let linked = {};
      let wallet = {};
      try { linked = await loadJSON(PATHS.linkedDecks); } catch { linked = {}; }
      try { wallet = await loadJSON(PATHS.wallet); } catch { wallet = {}; }

      const profile = linked[userId];
      if (!profile) {
        return interaction.reply({
          content: '❌ You are not linked yet. Run **/linkdeck** in **#manage-cards** first.',
          ephemeral: true
        });
      }

      // Keep name fresh & shapes sane
      if (profile.discordName !== userName) profile.discordName = userName;
      profile.collection = profile.collection || {};

      // Daily limit (UTC day counter)
      const today = todayUTC();
      const usedToday = Number(profile.sellCountToday || 0);
      const lastDay = profile.sellCountDate || '';
      const effectiveUsed = (lastDay === today) ? usedToday : 0;

      if (effectiveUsed + qty > DAILY_LIMIT) {
        const remain = Math.max(0, DAILY_LIMIT - effectiveUsed);
        return interaction.reply({
          content:
            `⛔ Daily sell limit reached. You may sell **${remain}** more card` +
            `${remain === 1 ? '' : 's'} today (limit: ${DAILY_LIMIT}).`,
          ephemeral: true
        });
      }

      const owned = Number(profile.collection[id] || 0);
      if (owned < qty) {
        return interaction.reply({
          content: `❌ You only own **${owned}** of #${id}.`,
          ephemeral: true
        });
      }

      const rarity = (rarityMap[id] || 'Common').toLowerCase();
      const perCard = Number(sellValues[rarity] ?? DEFAULT_SELL.common);
      const coinsGained = Math.round(perCard * qty * 100) / 100;

      // Apply sale
      profile.collection[id] = owned - qty;
      if (profile.collection[id] <= 0) delete profile.collection[id];

      profile.sellCountDate = today;
      profile.sellCountToday = effectiveUsed + qty;

      const currentWallet = Number(wallet[userId] ?? profile.coins ?? 0);
      const newBalance = Math.round((currentWallet + coinsGained) * 100) / 100;

      wallet[userId] = newBalance;
      profile.coins = newBalance;
      profile.coinsUpdatedAt = new Date().toISOString();

      // Persist
      linked[userId] = profile;
      try {
        await saveJSON(PATHS.linkedDecks, linked);
        await saveJSON(PATHS.wallet, wallet);
      } catch (e) {
        console.error('[sellcard] Persist failed:', e?.message || e);
        return interaction.reply({
          content: '⚠️ Failed to save your sale. Please try again later.',
          ephemeral: true
        });
      }

      const niceRarity = rarity.charAt(0).toUpperCase() + rarity.slice(1);
      const embed = new EmbedBuilder()
        .setTitle('🪙 Card Sold')
        .setDescription(
          [
            `Sold **${qty}×** card **#${id}** (${niceRarity}).`,
            '',
            `**Coins gained:** ${coinsGained}`,
            `**New balance:** ${newBalance}`,
          ].join('\n')
        )
        .setFooter({ text: `Daily limit: ${profile.sellCountToday}/${DAILY_LIMIT} (resets 00:00 UTC)` })
        .setColor(0x00cc66);

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  });
}
