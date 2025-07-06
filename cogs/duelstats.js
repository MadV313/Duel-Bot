// cogs/duelstats.js — Personal Duel Stats Viewer (public use)

import fs from 'fs/promises';
import path from 'path';
import {
  SlashCommandBuilder,
  EmbedBuilder
} from 'discord.js';

const linkedDecksPath = path.resolve('./data/linked_decks.json');
const coinBankPath = path.resolve('./data/coin_bank.json');
const playerDataPath = path.resolve('./data/player_data.json');

const ALLOWED_CHANNELS = [
  '1367977677658656868', // #manage-cards
  '1367986446232719484', // #battlefield
  '1368023977519222895'  // #admin-tools
];

export default async function registerDuelStats(client) {
  const commandData = new SlashCommandBuilder()
    .setName('duelstats')
    .setDescription('View your own SV13 TCG duel statistics and profile.');

  client.slashData.push(commandData.toJSON());

  client.commands.set('duelstats', {
    data: commandData,
    async execute(interaction) {
      const userId = interaction.user.id;
      const userTag = interaction.user.tag;
      const channelId = interaction.channelId;
      const timestamp = new Date().toISOString();

      console.log(`[${timestamp}] 📊 /duelstats triggered by ${userTag} (${userId}) in ${channelId}`);

      if (!ALLOWED_CHANNELS.includes(channelId)) {
        console.warn(`[${timestamp}] ❌ /duelstats used in wrong channel by ${userTag}`);
        return interaction.reply({
          content: '❌ This command must be used in an SV13 TCG channel: #manage-cards, #battlefield, or #admin-tools.',
          ephemeral: true
        });
      }

      let profile = {};
      try {
        const data = JSON.parse(await fs.readFile(linkedDecksPath, 'utf-8'));
        profile = data[userId];

        if (!profile || !profile.collection || !profile.deck) {
          return interaction.reply({
            content: '⚠️ You are not linked yet. Please run `/linkdeck` in the #manage-cards channel to get started.',
            ephemeral: true
          });
        }
      } catch {
        return interaction.reply({
          content: '⚠️ Unable to load your profile. Make sure you’ve used `/linkdeck` in #manage-cards.',
          ephemeral: true
        });
      }

      let coin = 0;
      let wins = 0;
      let losses = 0;

      try {
        const coinData = JSON.parse(await fs.readFile(coinBankPath, 'utf-8'));
        coin = coinData[userId] ?? 0;
      } catch {}

      try {
        const statsData = JSON.parse(await fs.readFile(playerDataPath, 'utf-8'));
        if (statsData[userId]) {
          wins = statsData[userId].wins ?? 0;
          losses = statsData[userId].losses ?? 0;
        }
      } catch {}

      const ownedIds = Object.keys(profile.collection || {});
      const uniqueUnlocked = ownedIds.filter(id => {
        const parsed = parseInt(id, 10);
        return parsed >= 1 && parsed <= 127;
      }).length;

      const embed = new EmbedBuilder()
        .setTitle(`<:ID:1391239596112613376> Your SV13 Duel Stats`)
        .addFields(
          { name: '🂠 Deck Size', value: `${profile.deck.length}`, inline: true },
          { name: '🀢🀣🀦🀤 Collection Size', value: `${Object.values(profile.collection).reduce((a, b) => a + b, 0)}`, inline: true },
          { name: '🀢ᯓ★ Cards Unlocked', value: `${uniqueUnlocked} / 127`, inline: true },
          { name: '⛃ Coins', value: `${coin}`, inline: true },
          { name: '╰── ──╮ Wins / Losses', value: `${wins} / ${losses}`, inline: true }
        )
        .addFields({
          name: '🌐 View Full Stats Online',
          value: `[Click to open your Player Stats UI](https://madv313.github.io/Player-Stats-UI/?id=${userId})`,
          inline: false
        })
        .setFooter({ text: `Linked to: ${interaction.user.username}` });

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  });
}
