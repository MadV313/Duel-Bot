// server.js

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import {
  Client, GatewayIntentBits, Events, Collection,
  REST, Routes, SlashCommandBuilder
} from 'discord.js';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname } from 'path';
import { config as dotenvConfig } from 'dotenv';
import duelRoutes, { botAlias as botPracticeAlias } from './routes/duel.js';

dotenvConfig();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;
const SAFE_MODE = process.env.SAFE_MODE === 'true';

console.log('🔍 ENV CHECK:', { token: !!token, clientId, guildId, SAFE_MODE });

if (!token || !clientId || !guildId) {
  console.error(`❌ Missing required env: DISCORD_TOKEN, CLIENT_ID, or GUILD_ID`);
  process.exit(1);
}

// ✅ Create bot
const bot = new Client({ intents: [GatewayIntentBits.Guilds] });
bot.commands = new Collection();
bot.slashData = [];

const cogsDir = path.resolve('./cogs');

const loadCommands = async () => {
  const cogFiles = await fsPromises.readdir(cogsDir);
  for (const file of cogFiles) {
    if (!file.endsWith('.js')) continue;
    const cogPath = path.join(cogsDir, file);
    const cogURL = pathToFileURL(cogPath).href;

    try {
      const { default: cog } = await import(cogURL);
      if (typeof cog === 'function') {
        await cog(bot);
        const lastCmd = bot.slashData.at(-1);
        console.log(`📋 Command registered from ${file}:`, lastCmd?.name || '❌ missing', '-', lastCmd?.description || '(no desc)');
      } else {
        console.warn(`⚠️ Skipped ${file}: Invalid export`);
      }
    } catch (err) {
      console.error(`❌ Failed to load cog ${file}:`, err);
    }
  }
};

// 🔁 Main Init
(async () => {
  try {
    console.log('🟡 Loading cogs...');
    if (SAFE_MODE) {
      console.log('🧪 SAFE MODE: Only loading /ping command.');
      bot.slashData = [
        new SlashCommandBuilder()
          .setName('ping')
          .setDescription('Test if bot is alive')
          .toJSON()
      ];
    } else {
      await loadCommands();
    }

    const rest = new REST({ version: '10' }).setToken(token);

    // 🔄 GLOBAL COMMANDS instead of guild
    console.log('🧹 Clearing existing global commands...');
    await rest.put(Routes.applicationCommands(clientId), { body: [] });
    await new Promise(r => setTimeout(r, 2000));

    console.log(`🔁 Syncing ${bot.slashData.length} slash commands globally...`);
    console.time('⏱️ Slash Sync Duration');

    const abortAfter = (ms) =>
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`⏳ Slash command sync timeout after ${ms}ms`)), ms)
      );

    const result = await Promise.race([
      rest.put(Routes.applicationCommands(clientId), {
        body: bot.slashData
      }),
      abortAfter(15000)
    ]);

    console.timeEnd('⏱️ Slash Sync Duration');
    console.log(`✅ Global slash commands registered. (${result.length} total)`);

    await bot.login(token);
    bot.once('ready', () => {
      console.log(`🤖 Bot is online as ${bot.user.tag}`);
    });
  } catch (err) {
    console.error('❌ Bot startup failed:', err);
  }
})();

// 🔄 Handle interactions
bot.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const command = bot.commands.get(interaction.commandName);
  if (!command) {
    console.warn(`⚠️ Unknown command: /${interaction.commandName}`);
    return interaction.reply({ content: '❌ Unknown command.', ephemeral: true });
  }

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`❌ Error executing /${interaction.commandName}:`, err);
    const replyMethod = interaction.deferred || interaction.replied ? 'followUp' : 'reply';
    await interaction[replyMethod]({
      content: '⚠️ An error occurred while executing the command.',
      ephemeral: true,
    });
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('🛑 Bot shutting down...');
  bot.destroy();
  process.exit(0);
});

// ✅ Express Middleware
app.use(cors());
app.use(helmet());
app.use(express.json());

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: '🚫 Too many requests. Please try again later.'
});
app.use('/duel', apiLimiter);
app.use('/packReveal', apiLimiter);
app.use('/user', apiLimiter);
app.use('/duel', duelRoutes);
app.use('/bot', botPracticeAlias);

// ✅ API Routes
import duelRoutes from './routes/duel.js';
import statusRoutes from './routes/status.js';
import duelStartRoutes from './routes/duelStart.js';
import summaryRoutes from './routes/duelSummary.js';
import liveRoutes from './routes/duelLive.js';
import userStatsRoutes from './routes/userStats.js';
import cardRoutes from './routes/packReveal.js';
import collectionRoute from './routes/collection.js';
import revealRoute from './routes/reveal.js'; // ✅ New route

app.use('/bot', duelRoutes);
app.use('/duel', duelStartRoutes);
app.use('/duel/live', liveRoutes);
app.use('/summary', summaryRoutes);
app.use('/user', userStatsRoutes);
app.use('/packReveal', cardRoutes);
app.use('/collection', collectionRoute);
app.use('/reveal', revealRoute); // ✅ Mount reveal route
app.use('/public', express.static('public')); // ✅ Serve static JSON files

// Fallback + Error
app.get('/', (req, res) => res.send('🌐 Duel Bot Backend is live.'));
app.use((req, res) => res.status(404).json({ error: '🚫 Endpoint not found' }));
app.use((err, req, res, next) => {
  console.error('🔥 Server Error:', err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`🚀 Duel Bot Backend running on port ${PORT}`);
});
