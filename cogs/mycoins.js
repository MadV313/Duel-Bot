// cogs/mycoins.js — Shows the invoker's current coin balance in an ephemeral embed.
// - Confined to #manage-cards channel (warns if used elsewhere)
// - Auto-uses/mints the player's token from linked_decks.json
// - Warns if the player is not yet linked (asks to run /linkdeck)
// - ALSO accepts optional `token` to pass/persist a specific player token (not displayed)
// - Replies with a minimal balance readout
//
// Config keys used (ENV CONFIG_JSON or config.json fallback):
//   manage_cards_channel_id
//
// Files used:
//   ./data/linked_decks.json

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import {
  SlashCommandBuilder,
  EmbedBuilder
} from 'discord.js';

/* ---------------- paths ---------------- */
const linkedDecksPath = path.resolve('./data/linked_decks.json');

/* ---------------- config helpers ---------------- */
function loadConfig() {
  try {
    const raw = process.env.CONFIG_JSON;
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn(`[mycoins] CONFIG_JSON parse error: ${e?.message}`);
  }
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return JSON.parse(require('fs').readFileSync('config.json', 'utf-8')) || {};
  } catch {
    return {};
  }
}

/* ---------------- small utils ---------------- */
async function readJson(file, fallback = {}) {
  try {
    const raw = await fs.readFile(file, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}
function randomToken(len = 24) {
  return crypto.randomBytes(Math.ceil((len * 3) / 4)).toString('base64url').slice(0, len);
}
function isTokenValid(t) {
  return typeof t === 'string' && /^[A-Za-z0-9_-]{12,128}$/.test(t);
}

/* ---------------- command registration ---------------- */
export default async function registerMyCoins(client) {
  const CONFIG = loadConfig();

  const MANAGE_CARDS_CHANNEL_ID =
    String(CONFIG.manage_cards_channel_id || CONFIG.manage_cards || CONFIG['manage-cards'] || '1367977677658656868');

  const commandData = new SlashCommandBuilder()
    .setName('mycoins')
    .setDescription('Check your current coin balance.')
    .addStringOption(opt =>
      opt
        .setName('token')
        .setDescription('(Optional) Provide a specific player token to use/persist')
        .setRequired(false)
    );

  client.slashData.push(commandData.toJSON());

  client.commands.set('mycoins', {
    data: commandData,
    async execute(interaction) {
      // Channel guard
      if (interaction.channelId !== MANAGE_CARDS_CHANNEL_ID) {
        return interaction.reply({
          content: '💰 Please use this command in the **#manage-cards** channel.',
          ephemeral: true
        });
      }

      const userId = interaction.user.id;
      const username = interaction.user.username;
      const providedToken = interaction.options.getString('token');

      // Load player data
      const linked = await readJson(linkedDecksPath, {});
      const playerProfile = linked[userId];

      // If player is not yet linked, show warning
      if (!playerProfile) {
        const warn = new EmbedBuilder()
          .setTitle('⚠️ Player Not Linked')
          .setDescription(
            [
              'You are not yet linked to the Duel Bot system.',
              '',
              'Please run the command **`/linkdeck`** in the **#manage-cards** channel before using any Duel Bot commands.',
              '',
              'Once linked, you’ll be able to build decks, earn coins, and participate in duels.'
            ].join('\n')
          )
          .setColor(0xff9900);
        return interaction.reply({ embeds: [warn], ephemeral: true });
      }

      // Refresh Discord name
      if (playerProfile.discordName !== username) {
        playerProfile.discordName = username;
      }

      // Token logic
      if (isTokenValid(providedToken)) {
        playerProfile.token = providedToken.trim();
      } else if (!isTokenValid(playerProfile.token)) {
        playerProfile.token = randomToken(24);
      }

      await writeJson(linkedDecksPath, linked);

      const balance = Number(playerProfile.coins || 0);

      const embed = new EmbedBuilder()
        .setTitle('💰 My Coins')
        .setDescription(`Your current coin balance is:\n\n**${balance}** coin${balance === 1 ? '' : 's'}.`)
        .setColor(0x00cc66);

      return interaction.reply({
        embeds: [embed],
        ephemeral: true
      });
    }
  });
}
