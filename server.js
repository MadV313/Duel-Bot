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

// 🔐 Token-aware routes (/me/:token/collection, /me/:token/stats, POST /me/:token/sell)
import meTokenRouter from './routes/meToken.js';

// 🔄 Trade routes
import createTradeRouter from './routes/trade.js';

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
const token     = process.env.DISCORD_TOKEN;
const envClient = process.env.CLIENT_ID;  // may be undefined; we’ll fallback to client.application.id after login
const guildId   = process.env.GUILD_ID;
const SAFE_MODE = process.env.SAFE_MODE === 'true';
const SYNC_SCOPE = (process.env.SYNC_SCOPE || 'guild').toLowerCase(); // 'guild' (default) or 'global'
const LAST_RESORT_GLOBAL = String(process.env.LAST_RESORT_GLOBAL || 'false').toLowerCase() === 'true';
const DEBUG_KEY = process.env.X_BOT_KEY || process.env.BOT_KEY || process.env.ADMIN_KEY || ''; // for /debug endpoints

console.log('🔍 ENV CHECK:', { hasToken: !!token, clientId: envClient, guildId, SAFE_MODE, SYNC_SCOPE, LAST_RESORT_GLOBAL });

if (!token || !guildId) {
  console.error('❌ Missing required env: DISCORD_TOKEN or GUILD_ID');
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

/** Build a human-readable list of the command names we’re syncing. */
function summarizeSlashData(slashData) {
  try {
    return slashData.map(c => c?.name).filter(Boolean);
  } catch {
    return [];
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** Robust command sync with fallbacks; exposed as bot.syncCommands() and used on boot + /resync. */
async function doSyncCommands({ token, clientId, guildId, slashData, scope = 'guild' }) {
  const rest = new REST({ version: '10' }).setToken(token);
  const names = summarizeSlashData(slashData);
  const upper = scope.toUpperCase();
  console.log(`🔁 Syncing ${slashData.length} ${upper} slash commands...`);
  console.log('   →', names.join(', ') || '(none)');

  const routeBulk = scope === 'global'
    ? Routes.applicationCommands(clientId)
    : Routes.applicationGuildCommands(clientId, guildId);

  console.time('⏱️ Slash Sync Duration');

  // 1) Try bulk overwrite (fast path) with 60s cap
  try {
    const result = await Promise.race([
      rest.put(routeBulk, { body: slashData }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('⏳ bulk PUT timeout after 60s')), 60000))
    ]);
    if (Array.isArray(result)) {
      console.timeEnd('⏱️ Slash Sync Duration');
      console.log(`✅ ${upper} bulk overwrite OK (${result.length})`);
      return { ok: true, total: result.length, mode: 'bulk' };
    }
  } catch (e) {
    console.warn(`⚠️ ${upper} bulk overwrite failed:`, e?.message || e);
    console.timeEnd('⏱️ Slash Sync Duration');
  }

  // 2) Fallback: sequential upsert (POST each) with verbose counters
  console.log(`🛟 Falling back to sequential ${upper} upserts...`);
  const routePost = scope === 'global'
    ? Routes.applicationCommands(clientId)
    : Routes.applicationGuildCommands(clientId, guildId);

  let created = 0, failed = 0;
  for (const cmd of slashData) {
    try {
      const res = await rest.post(routePost, { body: cmd });
      created += res?.id ? 1 : 0;
      console.log(`  • upserted /${res?.name || cmd?.name} (${res?.id || 'no id'})`);
      await sleep(300);
    } catch (e) {
      failed++;
      const apiPayload = e?.rawError || e?.response?.data || e?.data || null;
      console.error(`  ✖ upsert failed for /${cmd?.name}:`, e?.status || '', e?.message || e);
      if (apiPayload) console.error('    ↳ payload:', JSON.stringify(apiPayload, null, 2));
    }
  }
  console.log(`🧮 Sequential result: created=${created}, failed=${failed}, total=${slashData.length}`);

  if (created > 0) {
    return { ok: true, total: created, failed, mode: 'sequential' };
  }

  // 3) Last-resort GLOBAL registration (optional)
  if (scope === 'guild' && LAST_RESORT_GLOBAL) {
    try {
      console.warn('🧯 Last-resort: registering as GLOBAL so commands eventually appear…');
      const res = await rest.put(Routes.applicationCommands(clientId), { body: slashData });
      console.log(`✅ GLOBAL fallback registered (${res?.length ?? 0})`);
      return { ok: true, total: res?.length ?? 0, mode: 'global-fallback' };
    } catch (e) {
      console.error('💀 GLOBAL last-resort registration failed:', e?.message || e);
    }
  }

  return { ok: false, error: 'All registration strategies failed' };
}

// Make it callable by cogs (/resync) and by debug endpoint
bot.syncCommands = async () => {
  const clientId = envClient || bot.application?.id;
  if (!clientId) throw new Error('No CLIENT_ID and client.application.id not available.');
  return doSyncCommands({
    token,
    clientId,
    guildId,
    slashData: bot.slashData,
    scope: SYNC_SCOPE
  });
};

// Utility: list what DISCORD currently has (guild + global)
async function listDiscordCommands(scope, clientId) {
  const rest = new REST({ version: '10' }).setToken(token);
  if (scope === 'guild') {
    const arr = await rest.get(Routes.applicationGuildCommands(clientId, guildId));
    return arr.map(c => ({ id: c.id, name: c.name, type: c.type, dm_permission: c.dm_permission, default_member_permissions: c.default_member_permissions }));
  }
  const arr = await rest.get(Routes.applicationCommands(clientId));
  return arr.map(c => ({ id: c.id, name: c.name, type: c.type }));
}

/* ──────────────────────────────────────────────────────────
 * Boot sequence
 * ────────────────────────────────────────────────────────── */
(async () => {
  try {
    console.log('🟡 Loading cogs...');
    if (SAFE_MODE) {
      console.log('🧪 SAFE MODE: Only loading /ping command.');
      bot.slashData = [
        new SlashCommandBuilder().setName('ping').setDescription('Test if bot is alive').toJSON()
      ];
      bot.commands.set('ping', {
        data: { name: 'ping' },
        async execute(i) { await i.reply({ content: 'Pong!', ephemeral: true }); }
      });
    } else {
      await loadCommands();
    }

    // Login first so we can fall back to client.application.id safely
    await bot.login(token);

    bot.once(Events.ClientReady, async () => {
      console.log(`🤖 Bot is online as ${bot.user.tag}`);
      const clientId = envClient || bot.application?.id;
      if (!clientId) {
        console.error('❌ clientId not available; cannot sync commands.');
        return;
      }
      const res = await bot.syncCommands();
      console.log('[boot] Slash sync result:', res);
    });
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
    await command.execute(interaction, bot);
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
    /madv313\.github\.io$/ // ✅ allow Card-Collection-UI & Pack-Reveal-UI on GitHub Pages
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  // 🔑 include X-Bot-Key for /trade/start
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Bot-Key'],
}));
app.use(helmet());
app.use(express.json({ limit: '256kb' }));

// Rate limiter (define before use)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '🚫 Too many requests. Please try again later.' }
});

/* ──────────────────────────────────────────────────────────
 * Health + route inventory + debug
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

// Shows what *we* are trying to register
app.get('/_slash', (_req, res) => {
  res.json({ count: bot.slashData.length, names: summarizeSlashData(bot.slashData) });
});

// 🔧 Debug: query DISCORD for what commands exist right now (guild + global)
app.get('/debug/discord-commands', async (req, res) => {
  try {
    if (DEBUG_KEY && req.headers['x-bot-key'] !== DEBUG_KEY) return res.status(403).json({ error: 'forbidden' });
    const clientId = envClient || bot.application?.id;
    const guild = await listDiscordCommands('guild', clientId);
    const global = await listDiscordCommands('global', clientId);
    res.json({ guildId, guild_count: guild.length, guild, global_count: global.length, global });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// 🔧 Debug: force a resync via HTTP (use X-Bot-Key)
app.post('/debug/resync', async (req, res) => {
  try {
    if (DEBUG_KEY && req.headers['x-bot-key'] !== DEBUG_KEY) return res.status(403).json({ error: 'forbidden' });
    const out = await bot.syncCommands();
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/* ──────────────────────────────────────────────────────────
 * Routes
 * ────────────────────────────────────────────────────────── */
app.use('/duel', apiLimiter);
app.use('/packReveal', apiLimiter);
app.use('/user', apiLimiter);
app.use('/collection', apiLimiter);
app.use('/reveal', apiLimiter);
// 🔐 token-aware
app.use('/me', apiLimiter);
app.use('/userStatsToken', apiLimiter);
// 🔄 trade
app.use('/trade', apiLimiter);

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

// 🔐 Token-aware endpoints mounted at root
app.use('/', meTokenRouter);

// 🔄 Trade endpoints mounted at root (need the live Discord client for DMs)
app.use('/', createTradeRouter(bot));

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
