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

// 🧰 Persistent storage client (health check & optional debug endpoint)
import { loadJSON, saveJSON, PATHS } from './utils/storageClient.js';

dotenvConfig();

/* ──────────────────────────────────────────────────────────
 * ✨ NEW: socket.io chat imports
 * ────────────────────────────────────────────────────────── */
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import chatHistoryRoutes from './routes/chatHistory.js';
import {
  joinRoom, leaveRoom, appendMessage,
  getHistory, getPresence, setTyping
} from './logic/chatRegistry.js';

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

// 🔁 Shared place to stash trade webhook payloads (so other modules can read them)
bot.tradeSessionCache = bot.tradeSessionCache || new Map();
global.tradeSessionCache = bot.tradeSessionCache; // optional alias if other files use global

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
        console.log(`[cmd] registered from ${file}:`, (lastCmd?.data?.name ?? lastCmd?.name ?? '❌ missing'), '-', (lastCmd?.data?.description ?? lastCmd?.description ?? '(no desc)'));
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

/** Sanitize a SlashCommand JSON for the target scope. */
function sanitizeCommandForScope(cmd, scope) {
  const c = JSON.parse(JSON.stringify(cmd)); // deep clone plain object

  // Discord limits: name 1–32, desc 1–100 (we’ll trim description if needed)
  if (typeof c.description === 'string' && c.description.length > 100) {
    console.warn(`✂️ Trimming overlong description for /${c.name} from ${c.description.length} → 100 chars`);
    c.description = c.description.slice(0, 100);
  }

  // Guild commands cannot include dm_permission
  if (scope === 'guild' && 'dm_permission' in c) {
    delete c.dm_permission;
  }

  return c;
}

/** Robust command sync with fallbacks; exposed as bot.syncCommands() and used on boot + /resync. */
async function doSyncCommands({ token, clientId, guildId, slashData, scope = 'guild' }) {
  const rest = new REST({ version: '10' }).setToken(token);
  const names = summarizeSlashData(slashData);
  const upper = scope.toUpperCase();
  console.log(`🔁 Syncing ${slashData.length} ${upper} slash commands...`);
  console.log('   →', names.join(', ') || '(none)');

  // Sanitize per-scope to avoid invalid form body
  const body = slashData.map(cmd => sanitizeCommandForScope(cmd, scope));

  const routeBulk = scope === 'global'
    ? Routes.applicationCommands(clientId)
    : Routes.applicationGuildCommands(clientId, guildId);

  console.time('⏱️ Slash Sync Duration');

  // 1) Try bulk overwrite (fast path) with 60s cap
  try {
    const result = await Promise.race([
      rest.put(routeBulk, { body }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('⏳ bulk PUT timeout after 60s')), 60000))
    ]);
    if (Array.isArray(result)) {
      console.timeEnd('⏱️ Slash Sync Duration');
      console.log(`✅ ${upper} bulk overwrite OK (${result.length})`);
      return { ok: true, total: result.length, mode: 'bulk' };
    }
  } catch (e) {
    console.warn(`⚠️ ${upper} bulk overwrite failed:`, e?.message || e);
    const apiPayload = e?.rawError || e?.response?.data || e?.data || null;
    if (apiPayload) console.warn('   ↳ payload:', JSON.stringify(apiPayload, null, 2));
    console.timeEnd('⏱️ Slash Sync Duration');
  }

  // 2) Fallback: sequential upserts...
  console.log(`🛟 Falling back to sequential ${upper} upserts...`);
  const routePost = scope === 'global'
    ? Routes.applicationCommands(clientId)
    : Routes.applicationGuildCommands(clientId, guildId);

  let created = 0, failed = 0;
  for (const cmd of body) {
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
  console.log(`🧮 Sequential result: created=${created}, failed=${failed}, total=${body.length}`);

  if (created > 0) {
    return { ok: true, total: created, failed, mode: 'sequential' };
  }

  // 3) Last-resort GLOBAL registration (optional)
  if (scope === 'guild' && LAST_RESORT_GLOBAL) {
    try {
      console.warn('🧯 Last-resort: registering as GLOBAL so commands eventually appear…');
      const res = await rest.put(Routes.applicationCommands(clientId), { body });
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

    // 🔎 Persistent storage health check (non-fatal)
    try {
      const testRead = await loadJSON(PATHS.linkedDecks).catch(() => ({}));
      const health = { ok: true, at: new Date().toISOString(), hasLinkedDecks: !!testRead && typeof testRead === 'object' };
      const stats = await loadJSON(PATHS.duelStats).catch(() => ({}));
      stats.lastStorageHealth = health;
      await saveJSON(PATHS.duelStats, stats);
      console.log('🗄️ [storage] health OK:', health);
    } catch (e) {
      console.warn('⚠️ [storage] health check failed:', e?.message || e);
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
const corsOrigins = [
  'https://madv313.github.io',
  /localhost:5173$/,
  /duel-ui-production\.up\.railway\.app$/,
  /duel-bot-production\.up\.railway\.app$/,
];

const corsOptions = {
  origin: corsOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Bot-Key',
    // ▼ added for Duel UI preflight
    'X-Player-Token',
    'X-Match-Id',
    'X-Mode',
    'X-App-Client',
    'X-Requested-With',
    // ✅ needed for spectator polling with ETags
    'Cache-Control',
    'If-None-Match',
  ],
  // expose ETag so the browser can reuse it on the next poll
  exposedHeaders: ['X-Match-Id', 'ETag'],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // handle preflight globally
app.use(helmet());
app.use(express.json({ limit: '256kb' }));

// Base limiter (used via wrappers below)
const baseLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '🚫 Too many requests. Please try again later.' }
});

// 🔕 NEW: Exempt spectator-safe GETs from the limiter (prevents 429s on /state polls)
function isSpectatorStatePath(req) {
  const u = req.originalUrl || req.url || '';
  const isGet = req.method === 'GET';
  return isGet && (
    /\/duel\/state(\?|$)/.test(u) ||
    /\/duel\/current(\?|$)/.test(u)
  );
}
const apiLimiterExceptState = (req, res, next) => {
  if (isSpectatorStatePath(req)) return next();
  return baseLimiter(req, res, next);
};

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

// Our local view of commands we’re trying to register
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

// 🧪 Storage status (non-sensitive; OK for basic diagnostics)
app.get('/_storage', async (_req, res) => {
  try {
    const linked = await loadJSON(PATHS.linkedDecks).catch(() => ({}));
    const stats  = await loadJSON(PATHS.duelStats).catch(() => ({}));
    res.json({
      ok: true,
      keys: Object.keys(PATHS),
      linked_keys: Object.keys(linked).length,
      lastStorageHealth: stats.lastStorageHealth || null
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

/* ──────────────────────────────────────────────────────────
 * Routes
 * ────────────────────────────────────────────────────────── */

// Apply limiter on both legacy and API-prefixed paths (but exempt spectator-safe GETs)
app.use('/duel', apiLimiterExceptState);
app.use('/packReveal', baseLimiter);
app.use('/user', baseLimiter);
app.use('/collection', baseLimiter);
app.use('/reveal', baseLimiter);
app.use('/me', baseLimiter);
app.use('/userStatsToken', baseLimiter);
app.use('/trade', baseLimiter);

// 🔔 Also protect API namespace (with spectator exemption)
app.use('/api', apiLimiterExceptState);

// Core feature routes (legacy mounts kept for backward compatibility)
app.use('/duel', duelRoutes);
app.use('/bot', botPracticeAlias);
app.use('/duel/live', liveRoutes);
app.use('/duel', duelStartRoutes);
app.use('/summary', summaryRoutes);
app.use('/user', userStatsRoutes);
app.use('/packReveal', cardRoutes);
app.use('/collection', collectionRoute);
app.use('/reveal', revealRoute);

// ✅ API-prefixed mounts so Spectator UI can call /api/duel/current
app.use('/api/duel', duelRoutes);          // /api/duel/status, /practice, /turn, /state
app.use('/api/duel', liveRoutes);          // /api/duel/current
app.use('/api/duelstart', duelStartRoutes);// /api/duelstart/start
app.use('/api/bot', botPracticeAlias);     // /api/bot/status, /practice

// Token-aware endpoints mounted at root
app.use('/', meTokenRouter);

// Trade endpoints mounted at root (need the live Discord client for DMs)
app.use('/', createTradeRouter(bot));

/* ✨ NEW: optional REST history for spectator chat */
app.use('/chat', chatHistoryRoutes);

/* ✨ NEW: Spectator presence REST (handy for UI/debug) */
app.get('/api/spectators/:session', (req, res) => {
  try {
    const session = String(req.params.session || '').trim();
    const { count = 0, users = [] } = getPresence(session) || {};
    res.set('Cache-Control', 'no-store');
    res.json({ session, count, users });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

/* ──────────────────────────────────────────────────────────
 * Optional webhook: /trade/notify (uses same Express app; no second listener)
 * ────────────────────────────────────────────────────────── */
app.post('/trade/notify', express.json(), async (req, res) => {
  try {
    const SECRET = process.env.TRADE_WEBHOOK_SECRET || '';
    const json = req.body || {};
    if (!SECRET) return res.status(501).json({ error: 'webhook not configured' });
    if (json.secret !== SECRET) return res.status(401).json({ error: 'Unauthorized' });

    const {
      sessionId, initiatorId, partnerId,
      initiatorName, partnerName,
      initiatorPicks = [], partnerPicks = []
    } = json;

    // Stash for downstream handlers (e.g., /tradecard button handler)
    bot.tradeSessionCache.set(sessionId, { initiatorId, partnerId, initiatorPicks, partnerPicks });

    console.log('[trade/notify] stored session', sessionId, {
      initiatorId, partnerId,
      inCount: initiatorPicks?.length || 0,
      outCount: partnerPicks?.length || 0
    });

    // If another module registered a handler, let it react
    if (typeof global.onTradeNotify === 'function') {
      try { await global.onTradeNotify(bot, json); } catch {}
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

/* ──────────────────────────────────────────────────────────
 * Duel-UI compatibility shims
 * ────────────────────────────────────────────────────────── */

// Heartbeat the UI pings on boot
app.get('/duel/state', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, mode: 'compat', ts: Date.now() });
});

// Some UI builds post to /bot/turn; redirect to the canonical /duel/turn
app.post('/bot/turn', (req, res) => {
  res.redirect(307, '/duel/turn');
});

app.options('/bot/turn', cors());

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
 * ✨ NEW: socket.io spectator chat namespace
 * ────────────────────────────────────────────────────────── */

// Create HTTP server so Socket.IO can share the same port
const httpServer = createServer(app);

// Mirror CORS origins for websockets
const io = new SocketIOServer(httpServer, {
  cors: { origin: corsOrigins, methods: ['GET','POST'] }
});

// Namespace for spectator chat
const chatNs = io.of('/spectator-chat');

chatNs.on('connection', (socket) => {
  let roomId = null;
  let userId = socket.id;
  let name = 'Spectator';

  socket.on('join_room', (payload = {}) => {
    roomId = (payload.roomId || '').toString();
    userId = (payload.userId || socket.id).toString();
    name   = (payload.name || 'Spectator').toString().slice(0, 32);

    if (!roomId) { socket.emit('error', { error: 'roomId required' }); return; }
    socket.join(roomId);
    joinRoom(roomId, userId, name);

    // send history + presence to the joiner
    socket.emit('history', { roomId, messages: getHistory(roomId) });
    // broadcast presence to room
    chatNs.to(roomId).emit('presence', { roomId, ...getPresence(roomId) });
  });

  socket.on('typing', (isTyping) => {
    if (!roomId) return;
    const typingUsers = setTyping(roomId, userId, !!isTyping);
    chatNs.to(roomId).emit('typing', { roomId, users: typingUsers });
  });

  socket.on('chat_message', (textRaw) => {
    if (!roomId) return;
    const text = String(textRaw || '').replace(/[<>]/g, '').trim();
    if (!text) return;
    if (text.length > 500) return; // cap

    const msg = { id: `${Date.now()}_${Math.random().toString(36).slice(2,8)}`, roomId, userId, name, text, ts: Date.now() };
    appendMessage(roomId, msg);
    chatNs.to(roomId).emit('message', msg);
  });

  socket.on('disconnect', () => {
    if (roomId) {
      leaveRoom(roomId, userId);
      chatNs.to(roomId).emit('presence', { roomId, ...getPresence(roomId) });
    }
  });
});

/* ──────────────────────────────────────────────────────────
 * Fallbacks + listen
 * ────────────────────────────────────────────────────────── */
app.get('/' , (_req, res) => res.send('🌐 Duel Bot Backend is live.'));
app.use((req, res) => res.status(404).json({ error: '🚫 Endpoint not found' }));
app.use((err, _req, res, _next) => {
  console.error('🔥 Server Error:', err.stack || err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// NOTE: replaced app.listen with httpServer.listen so websockets work
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Duel Bot Backend running on port ${PORT} (ws enabled)`);
});
