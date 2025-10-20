// cogs/mycoin.js
// /mycoin — show your current coin balance and a tokenized link to your Collection UI.
// - Requires player to be linked (prompts to /linkdeck if not)
// - Ensures/mints a per-user token if missing and persists it
// - Builds a link with ?token=... and optional &api=..., plus &ts= cache-buster
// - Uses unified coin bank (data/coin_bank.json) as source of truth, mirrors to linked_decks

import fs from 'fs';
import crypto from 'crypto';
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { loadJSON, saveJSON, PATHS } from '../utils/storageClient.js';

// -------- helpers --------
const trimBase = (u = '') => String(u).trim().replace(/\/+$/, '');
const randomToken = (len = 24) =>
  crypto.randomBytes(Math.ceil((len * 3) / 4)).toString('base64url').slice(0, len);

function loadConfig() {
  try {
    if (process.env.CONFIG_JSON) return JSON.parse(process.env.CONFIG_JSON);
  } catch (e) {
    console.warn(`[mycoin] CONFIG_JSON parse error: ${e?.message}`);
  }
  try {
    if (fs.existsSync('config.json')) {
      return JSON.parse(fs.readFileSync('config.json', 'utf-8')) || {};
    }
  } catch {}
  return {};
}

function buildCollectionUrl(cfg, token) {
  const base =
    cfg.collection_ui ||
    cfg.ui_urls?.card_collection_ui ||
    'https://madv313.github.io/Card-Collection-UI';
  const API_BASE = trimBase(cfg.api_base || cfg.API_BASE || process.env.API_BASE || '');
  const ts = Date.now();

  const qp = new URLSearchParams();
  qp.set('token', token);
  if (API_BASE) qp.set('api', API_BASE);
  qp.set('ts', String(ts));

  return `${trimBase(base)}/index.html?${qp.toString()}`;
}

// Unified coin bank file (authoritative). Fallback if PATHS.coinBank missing.
const COIN_BANK_FILE = (PATHS && PATHS.coinBank) ? PATHS.coinBank : 'data/coin_bank.json';

// -------- command --------
export default async function registerMyCoin(client) {
  const commandData = new SlashCommandBuilder()
    .setName('mycoin')
    .setDescription('Show your coin balance and a personal link to your Collection.')
    .setDMPermission(false);

  client.slashData.push(commandData.toJSON());

  client.commands.set('mycoin', {
    data: commandData,
    async execute(interaction) {
      const userId = interaction.user.id;
      const userName = interaction.user.username;
      const CFG = loadConfig();

      // Load linked profiles and unified coin bank
      let linked = {};
      let bank = {};
      try { linked = await loadJSON(PATHS.linkedDecks); } catch { linked = {}; }
      try { bank   = await loadJSON(COIN_BANK_FILE); } catch { bank = {}; }

      const profile = linked[userId];

      // Must be linked first
      if (!profile) {
        return interaction.reply({
          content:
            '❌ You are not linked yet.\n' +
            'Please run **/linkdeck** in **#manage-cards** to create your profile.',
          ephemeral: true,
        });
      }

      // Keep display name fresh
      if (profile.discordName !== userName) {
        profile.discordName = userName;
      }

      // Ensure token
      if (typeof profile.token !== 'string' || profile.token.length < 12) {
        profile.token = randomToken(24);
        try { await saveJSON(PATHS.linkedDecks, { ...linked, [userId]: profile }); }
        catch (e) { console.warn('[mycoin] failed to persist token mint:', e?.message || e); }
      }

      // Use bank as source of truth, fallback to profile.coins if absent
      const coins = Number(bank[userId] ?? profile.coins ?? 0) || 0;

      // Mirror back into linked profile for consistency with UIs that read linked_decks
      if (profile.coins !== coins) {
        profile.coins = coins;
        profile.coinsUpdatedAt = new Date().toISOString();
        try { await saveJSON(PATHS.linkedDecks, { ...linked, [userId]: profile }); } catch {}
      }

      const collectionUrl = buildCollectionUrl(CFG, profile.token);

      const embed = new EmbedBuilder()
        .setTitle('🪙 Your Coin Balance')
        .addFields(
          { name: 'Player', value: userName, inline: true },
          { name: 'Coins', value: `${coins}`, inline: true },
        )
        .setDescription('Open your collection with your personal tokenized link below.')
        .setURL(collectionUrl)
        .setColor(0x00ccff);

      return interaction.reply({
        content: `🔗 **Open Collection:** ${collectionUrl}`,
        embeds: [embed],
        ephemeral: true,
      });
    },
  });
}
