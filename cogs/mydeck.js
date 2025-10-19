
async function _loadJSONSafe(name){
  try { return await loadJSON(name); }
  catch(e){ L.storage(`load fail ${name}: ${e.message}`); throw e; }
}
async function _saveJSONSafe(name, data, client){
  try { await saveJSON(name, data); }
  catch(e){ await adminAlert(client, process.env.PAYOUTS_CHANNEL_ID, `${name} save failed: ${e.message}`); throw e; }
}

import { adminAlert } from '../utils/adminAlert.js';
import { L } from '../utils/logs.js';
import { loadJSON, saveJSON, PATHS } from '../utils/storageClient.js';
// cogs/mydeck.js — Sends the invoker to their personal Deck Builder UI.
// - Confined to #manage-cards channel (warns if used elsewhere)
// - Auto-uses/mints the player's token from linked_decks.json (no extra field)
// - Passes the player's token in the URL
// - Replies with an ephemeral embed containing the personalized link + instructions
//
// Config keys used (ENV CONFIG_JSON or config.json fallback):
//   manage_cards_channel_id
//   deck_builder_ui / ui_urls.deck_builder_ui / frontend_url / ui_base / UI_BASE
//   api_base / API_BASE
//
// Files used:
//   PATHS.linkedDecks

import crypto from 'crypto';
import {
  SlashCommandBuilder,
  EmbedBuilder
} from 'discord.js';

/* ---------------- paths ---------------- */
const linkedDecksPath = path.resolve('PATHS.linkedDecks');

/* ---------------- config helpers ---------------- */
function loadConfig() {
  try {
    const raw = process.env.CONFIG_JSON;
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn(`[mydeck] CONFIG_JSON parse error: ${e?.message}`);
  }
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return JSON.parse(require('fs').readFileSync('config.json', 'utf-8')) || {};
  } catch {
    return {};
  }
}

function resolveBaseUrl(s) {
  return (s || '').toString().trim().replace(/\/+$/, '');
}

function resolveDeckBuilderBase(cfg) {
  // Prefer dedicated Deck Builder UI, then general UI bases as fallback
  return resolveBaseUrl(
    cfg.deck_builder_ui ||
    cfg.ui_urls?.deck_builder_ui ||
    cfg.frontend_url ||
    cfg.ui_base ||
    cfg.UI_BASE ||
    ''
  );
}

/* ---------------- small utils ---------------- */
async function await _loadJSONSafe(PATHS.linkedDecks) {
  try {
    const raw = await loadJSON(PATHS.linkedDecks);
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
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

/* ---------------- command registration ---------------- */
export default async function registerMyDeck(client) {
  const CONFIG = loadConfig();

  const MANAGE_CARDS_CHANNEL_ID =
    String(CONFIG.manage_cards_channel_id || CONFIG.manage_cards || CONFIG['manage-cards'] || '1367977677658656868');

  const DECK_BUILDER_BASE = resolveDeckBuilderBase(CONFIG) || 'https://madv313.github.io/Deck-Builder-UI';
  const API_BASE = resolveBaseUrl(CONFIG.api_base || CONFIG.API_BASE || process.env.API_BASE || '');

  const commandData = new SlashCommandBuilder()
    .setName('mydeck')
    .setDescription('Open your personal Deck Builder UI.');

  client.slashData.push(commandData.toJSON());

  client.commands.set('mydeck', {
    data: commandData,
    async execute(interaction) {
      // Channel guard
      if (interaction.channelId !== MANAGE_CARDS_CHANNEL_ID) {
        return interaction.reply({
          content: '🧩 Please use this command in the **#manage-cards** channel.',
          ephemeral: true
        });
      }

      const userId = interaction.user.id;
      const username = interaction.user.username;

      // Load profile; warn if not linked (do NOT auto-create here)
      const linked = await await _loadJSONSafe(PATHS.linkedDecks);
      const profile = linked[userId];

      if (!profile) {
        const warn = new EmbedBuilder()
          .setTitle('⚠️ Player Not Linked')
          .setDescription(
            [
              'You are not yet linked to the Duel Bot system.',
              '',
              'Please run **`/linkdeck`** in the **#manage-cards** channel before using Duel Bot commands.',
              '',
              'Once linked, you’ll be able to build decks, earn coins, and participate in duels.'
            ].join('\n')
          )
          .setColor(0xff9900);
        return interaction.reply({ embeds: [warn], ephemeral: true });
      }

      // Keep display name fresh
      if (profile.discordName !== username) {
        profile.discordName = username;
      }

      // Ensure token
      if (!isTokenValid(profile.token)) {
        profile.token = randomToken(24);
      }

      await await _saveJSONSafe(PATHS.linkedDecks, \1, client);

      const token = profile.token;
      const ts = Date.now();
      const apiQP = API_BASE ? `&api=${encodeURIComponent(API_BASE)}` : '';

      // Personalized Deck Builder URL
      const deckUrl = `${DECK_BUILDER_BASE}/?token=${encodeURIComponent(token)}${apiQP}&ts=${ts}`;

      const embed = new EmbedBuilder()
        .setTitle('🧩 Deck Builder')
        .setDescription(
          [
            'Open your personal Deck Builder using the link above.',
            '',
            '**How to use the Deck Builder UI:**',
            'Once you’ve arrived at your Deck Builder UI, please select between **20–40 cards maximum** to complete your deck.',
            'No more than **5 duplicates** are allowed per deck.',
            'Simply **click a card** from your collection along with the amount you’d like to add to start building your deck.',
            'Once satisfied, press the **Save Deck** button — this will lock in your deck build for future duels.',
            'To view your current deck build, press the **View My Deck** button.',
            'To start a new build, press the **Wipe Deck** button.',
            '',
            'Only **one deck build** is allowed currently (deck expansions will come in the future).',
            '',
            '_Tip: Decks must be 20–40 cards to be duel-eligible._'
          ].join('\n')
        )
        .setURL(deckUrl)
        .setColor(0x00ccff);

      return interaction.reply({
        content: `🔗 **Open your Deck Builder:** ${deckUrl}`,
        embeds: [embed],
        ephemeral: true
      });
    }
  });
}
