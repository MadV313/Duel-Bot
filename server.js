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
    console.log(`🧹 Clearing existing GUILD commands for ${guildId}...`);
    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: [] }
    );
    await new Promise(r => setTimeout(r, 1000));
    
    console.log(`🔁 Syncing ${bot.slashData.length} GUILD slash commands...`);
    console.time('⏱️ Slash Sync Duration');
    
    const putGuild = () =>
      rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: bot.slashData }
      );
    
    // simple retry once if first attempt is slow/flaky
    let result;
    try {
      result = await Promise.race([
        putGuild(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('⏳ Guild command sync timeout after 60s')), 60000)
        )
      ]);
    } catch (e) {
      console.warn('⚠️ First guild sync attempt failed, retrying once...', e.message);
      result = await putGuild();
    }
    
    console.timeEnd('⏱️ Slash Sync Duration');
    console.log(`✅ Guild slash commands registered. (${result.length} total)`);

    await bot.login(token);
    bot.once(Events.ClientReady, () => {
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
app.use(cors({
  origin: [
    /localhost:5173$/,                      // local UI
    /duel-ui-production\.up\.railway\.app$/ // hosted UI
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(helmet());
app.use(express.json());

// Rate limiting (keep your existing)
app.use('/duel', apiLimiter);
app.use('/packReveal', apiLimiter);
app.use('/user', apiLimiter);

// ✅ Routes (single import of duel.js is already at the top)
import statusRoutes from './routes/status.js';
import duelStartRoutes from './routes/duelStart.js';
import summaryRoutes from './routes/duelSummary.js';
import liveRoutes from './routes/duelLive.js';
import userStatsRoutes from './routes/userStats.js';
import cardRoutes from './routes/packReveal.js';
import collectionRoute from './routes/collection.js';
import revealRoute from './routes/reveal.js';

// Mount routes
app.use('/duel', duelRoutes);             // /duel/*
app.use('/bot', botPracticeAlias);        // /bot/practice (alias to practice)
app.use('/duel/live', liveRoutes);        // /duel/live/*
app.use('/duel', duelStartRoutes);        // /duel/* (start endpoints)
app.use('/summary', summaryRoutes);       // /summary/*
app.use('/user', userStatsRoutes);        // /user/*
app.use('/packReveal', cardRoutes);       // /packReveal/*
app.use('/collection', collectionRoute);  // /collection/*
app.use('/reveal', revealRoute);          // /reveal/*
app.use('/public', express.static('public'));

// Route table log (after mounts)
function printRoutes(app) {
  const list = [];
  app._router.stack.forEach(layer => {
    if (layer.route && layer.route.path) {
      const methods = Object.keys(layer.route.methods).join(',').toUpperCase();
      list.push({ path: layer.route.path, methods, base: '' });
    } else if (layer.name === 'router' && layer.handle.stack) {
      layer.handle.stack.forEach(sub => {
        if (sub.route) {
          const methods = Object.keys(sub.route.methods).join(',').toUpperCase();
          list.push({ path: sub.route.path, methods, base: layer.regexp?.source || '' });
        }
      });
    }
  });
  console.log('🧭 Mounted Routes:', list);
}
printRoutes(app);

// Health root
app.get('/', (_req, res) => res.send('🌐 Duel Bot Backend is live.'));
app.use((req, res) => res.status(404).json({ error: '🚫 Endpoint not found' }));
app.use((err, req, res, next) => {
  console.error('🔥 Server Error:', err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`🚀 Duel Bot Backend running on port ${PORT}`);
});
