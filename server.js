// server.js

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path, { dirname } from 'path';
import {
  Client, GatewayIntentBits, Events, Collection,
  REST, Routes, SlashCommandBuilder
} from 'discord.js';
import { fileURLToPath, pathToFileURL } from 'url';
import { config as dotenvConfig } from 'dotenv';
import duelRoutes, { botAlias as botPracticeAlias } from './routes/duel.js';

// Optional routes used elsewhere in your repo
import duelStartRoutes from './routes/duelStart.js';
import summaryRoutes from './routes/duelSummary.js';
import liveRoutes from './routes/duelLive.js';
import userStatsRoutes from './routes/userStats.js';
import cardRoutes from './routes/packReveal.js';
import collectionRoute from './routes/collection.js';
import revealRoute from './routes/reveal.js';

// 🔐 NEW: token-aware routes (/me/:token/collection, /me/:token/stats)
import meTokenRouter from './routes/meToken.js';

dotenvConfig();

/* ──────────────────────────────────────────────────────────
 * Paths / App
 * ────────────────────────────────────────────────────────── */
const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const app  = express();
const PORT = process.env.PORT || 3000;
app.set('trust proxy', 1);

// Boot banner so we can see exactly what’s running
try {
  console.log('BOOT env:', {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    PWD: process.cwd(),
    FILES: fs.readdirSync('.')
  });
} catch {}

/* ──────────────────────────────────────────────────────────
 * Discord client
 * ────────────────────────────────────────────────────────── */
const token   = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId  = process.env.GUILD_ID;
const SAFE_MODE = process.env.SAFE_MODE === 'true';

console.log('🔍 ENV CHECK:', { token: !!token, clientId, guildId, SAFE_MODE });

if (!token || !clientId || !guildId) {
  console.error('❌ Missing required env: DISCORD_TOKEN, CLIENT_ID, or GUILD_ID');
  process.exit(1);
}

const bot = new Client({ intents: [GatewayIntentBits.Guilds] });
bot.commands = new Collection();
bot.slashData = [];

const cogsDir = path.resolve('./cogs');

const loadCommands = async () => {
  const cogFiles = await fsPromises.readdir(cogsDir);
  for (const file of cogFiles) {
    if (!file.endsWith('.js')) continue;
    const cogPath = path.join(cogsDir, file);
    const cogURL  = pathToFileURL(cogPath).href;
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

// Slash registration + login
(async () => {
  try {
    console.log('🟡 Loading cogs...');
    if (SAFE_MODE) {
      console.log('🧪 SAFE MODE: Only loading /ping command.');
      bot.slashData = [
        new SlashCommandBuilder().setName('ping').setDescription('Test if bot is alive').toJSON()
      ];
    } else {
      await loadCommands();
    }

    const rest = new REST({ version: '10' }).setToken(token);

    console.log(`🧹 Clearing existing GUILD commands for ${guildId}...`);
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
    await new Promise(r => setTimeout(r, 1000));

    console.log(`🔁 Syncing ${bot.slashData.length} GUILD slash commands...`);
    console.time('⏱️ Slash Sync Duration');

    const putGuild = () => rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: bot.slashData }
    );

    let result;
    try {
      result = await Promise.race([
        putGuild(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('⏳ Guild command sync timeout after 60s')), 60000))
      ]);
    } catch (e) {
      console.warn('⚠️ First guild sync attempt failed, retrying once...', e.message);
      result = await putGuild();
    }

    console.timeEnd('⏱️ Slash Sync Duration');
    console.log(`✅ Guild slash commands registered. (${result.length} total)`);

    await bot.login(token);
    bot.once(Events.ClientReady, () => console.log(`🤖 Bot is online as ${bot.user.tag}`));
  } catch (err) {
    console.error('❌ Bot startup failed:', err);
  }
})();

// Interaction handler
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
    await interaction[replyMethod]({ content: '⚠️ An error occurred while executing the command.', ephemeral: true });
  }
});

process.on('SIGINT', () => { console.log('🛑 Bot shutting down...'); bot.destroy(); process.exit(0); });
process.on('unhandledRejection', r => console.error('⚠️ UnhandledRejection:', r));
process.on('uncaughtException', e => console.error('⚠️ UncaughtException:', e));

/* ──────────────────────────────────────────────────────────
 * Express middleware
 * ────────────────────────────────────────────────────────── */
app.use(cors({
  origin: [
    /localhost:5173$/,
    /duel-ui-production\.up\.railway\.app$/,
    /madv313\.github\.io$/ // ✅ allow Card-Collection-UI hosted on GitHub Pages
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(helmet());
app.use(express.json());

// Rate limiter (define before use)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,   // v6
  limit: 100, // v7 (ignored on v6)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '🚫 Too many requests. Please try again later.' }
});

/* ──────────────────────────────────────────────────────────
 * Health + route inventory
 * ────────────────────────────────────────────────────────── */
app.get('/health', (_req, res) => res.type('text/plain').send('ok'));
app.get('/_routes', (_req, res) => {
  const list = [];
  app._router?.stack?.forEach(layer => {
    if (layer.route?.path) {
      list.push({ base: '', path: layer.route.path, methods: Object.keys(layer.route.methods) });
    } else if (layer.name === 'router' && layer.handle?.stack) {
      const base = String(layer.regexp);
      layer.handle.stack.forEach(s => {
        if (s.route?.path) list.push({ base, path: s.route.path, methods: Object.keys(s.route.methods) });
      });
    }
  });
  res.json(list);
});

/* ──────────────────────────────────────────────────────────
 * Routes
 * ────────────────────────────────────────────────────────── */
app.use('/duel', apiLimiter);
app.use('/packReveal', apiLimiter);
app.use('/user', apiLimiter);

// Core feature routes
app.use('/duel', duelRoutes);              // /duel/practice, /duel/turn, /duel/status, /duel/state
app.use('/bot', botPracticeAlias);         // /bot/practice, /bot/status
app.use('/duel/live', liveRoutes);
app.use('/duel', duelStartRoutes);
app.use('/summary', summaryRoutes);
app.use('/user', userStatsRoutes);
app.use('/packReveal', cardRoutes);
app.use('/collection', collectionRoute);
app.use('/reveal', revealRoute);

// 🔐 NEW: token-aware endpoints mounted at root
//  - GET /me/:token/collection
//  - GET /me/:token/stats
//  - GET /userStatsToken?token=...
app.use('/', meTokenRouter);

app.use('/public', express.static('public'));

// Route table log after mounts
(function printRoutes(appRef) {
  const list = [];
  appRef._router?.stack?.forEach(layer => {
    if (layer.route?.path) {
      const methods = Object.keys(layer.route.methods).join(',').toUpperCase();
      list.push({ path: layer.route.path, methods, base: '' });
    } else if (layer.name === 'router' && layer.handle?.stack) {
      const base = layer.regexp?.source || '';
      layer.handle.stack.forEach(sub => {
        if (sub.route) {
          const methods = Object.keys(sub.route.methods).join(',').toUpperCase();
          list.push({ path: sub.route.path, methods, base });
        }
      });
    }
  });
  console.log('🧭 Mounted Routes:', list);
})(app);

/* ──────────────────────────────────────────────────────────
 * Fallbacks + listen
 * ────────────────────────────────────────────────────────── */
app.get('/', (_req, res) => res.send('🌐 Duel Bot Backend is live.'));
app.use((req, res) => res.status(404).json({ error: '🚫 Endpoint not found' }));
app.use((err, _req, res, _next) => {
  console.error('🔥 Server Error:', err.stack || err);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Duel Bot Backend running on port ${PORT}`);
});
