// cogs/mycoins.js — Shows the invoker's current coin balance in an ephemeral embed.
// - Confined to #manage-cards channel (warns if used elsewhere)
// - Warns if the player is not yet linked (asks to run /linkdeck)
// - Replies with a minimal balance readout
//
// Config keys used (ENV CONFIG_JSON or config.json fallback):
//   manage_cards_channel_id
//
// Files used:
//   ./data/linked_decks.json

import fs from 'fs/promises';
import path from 'path';
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

/** Format coins with up to 2 decimals, trimming trailing zeros (supports 0.5, 1, 2.5, etc.) */
function formatCoins(n) {
  const s = Number(n).toFixed(2);
  return s.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

/* ---------------- command registration ---------------- */
export default async function registerMyCoins(client) {
  const CONFIG = loadConfig();

  const MANAGE_CARDS_CHANNEL_ID =
    String(CONFIG.manage_cards_channel_id || CONFIG.manage_cards || CONFIG['manage-cards'] || '1367977677658656868');

  const commandData = new SlashCommandBuilder()
    .setName('mycoins')
    .setDescription('Check your current coin balance.');

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

      // Load player data
      const linked = await readJson(linkedDecksPath, {});
      let playerProfile = linked[userId];

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

      // Ensure coins prop exists and is numeric
      if (typeof playerProfile.coins !== 'number' || Number.isNaN(playerProfile.coins)) {
        playerProfile.coins = 0;
      }

      // Refresh Discord name if changed
      let changed = false;
      if (playerProfile.discordName !== username) {
        playerProfile.discordName = username;
        changed = true;
      }

      // Persist any fixes (e.g., missing coins field or name refresh)
      if (changed) {
        linked[userId] = playerProfile;
        await writeJson(linkedDecksPath, linked);
      }

      const balance = Number(playerProfile.coins || 0);
      const pretty = formatCoins(balance);

      const embed = new EmbedBuilder()
        .setTitle('💰 My Coins')
        .setDescription(`Your current coin balance is:\n\n**${pretty}** coin${balance === 1 ? '' : 's'}.`)
        .setColor(0x00cc66);

      return interaction.reply({
        embeds: [embed],
        ephemeral: true
      });
    }
  });
}
