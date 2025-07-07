// server.js

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import path from 'path';
import { Client, GatewayIntentBits, Events, Collection } from 'discord.js';
import { readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Start Discord Bot
const bot = new Client({ intents: [GatewayIntentBits.Guilds] });
bot.commands = new Collection();
bot.slashData = [];

const flagPath = './.commands_registered';

// ✅ Load and register commands
const loadCommands = async () => {
  const cogPath = path.resolve('./cogs');
  const files = readdirSync(cogPath).filter(f => f.endsWith('.js'));

  for (const file of files) {
    try {
      const commandModule = await import(`./cogs/${file}`);
      if (typeof commandModule.default === 'function') {
        await commandModule.default(bot);
        console.log(`✅ Cog registered: ${file}`);
      } else {
        console.warn(`⚠️ Skipped ${file}: No default export.`);
      }
    } catch (err) {
      console.error(`❌ Failed to register cog ${file}:`, err);
    }
  }
};

(async () => {
  try {
    console.log('🟡 Loading cog commands...');
    await loadCommands();

    const { REST, Routes } = await import('discord.js');
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    if (!fs.existsSync(flagPath)) {
      console.log('🔁 Registering slash commands...');
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: bot.slashData }
      );
      fs.writeFileSync(flagPath, 'done');
      console.log(`✅ ${bot.slashData.length} commands registered.`);
    } else {
      console.log('ℹ️ Commands already registered — skipping.');
    }

    await bot.login(process.env.DISCORD_TOKEN);
    console.log('🤖 Discord bot logged in.');
    console.log('📦 Registered commands:', bot.slashData.map(cmd => cmd.name).join(', '));
  } catch (err) {
    console.error('❌ Fatal error during bot startup:', err);
  }
})();

// ✅ Listen for Interaction Commands
bot.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const command = bot.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`❌ Error executing /${interaction.commandName}:`, err);
    if (!interaction.replied) {
      await interaction.reply({
        content: '⚠️ There was an error executing this command.',
        ephemeral: true
      });
    }
  }
});

// ✅ Middleware
app.use(cors());
app.use(helmet());
app.use(express.json());

// ✅ API Rate Limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: '🚫 Too many requests. Please try again later.'
});
app.use('/duel', apiLimiter);
app.use('/packReveal', apiLimiter);
app.use('/user', apiLimiter);

// ✅ Routes
import duelRoutes from './routes/duel.js';
import statusRoutes from './routes/status.js';
import duelStartRoutes from './routes/duelStart.js';
import summaryRoutes from './routes/duelSummary.js';
import liveRoutes from './routes/duelLive.js';
import userStatsRoutes from './routes/userStats.js';
import cardRoutes from './routes/packReveal.js';
import collectionRoute from './routes/collection.js';

app.use('/bot', duelRoutes);
app.use('/duel', duelStartRoutes);
app.use('/duel/live', liveRoutes);
app.use('/summary', summaryRoutes);
app.use('/user', userStatsRoutes);
app.use('/packReveal', cardRoutes);
app.use('/collection', collectionRoute);
app.use('/', statusRoutes);

// ✅ Default Route
app.get('/', (req, res) => {
  res.send('🌐 Duel Bot Backend is live.');
});

// ✅ Error Handling
app.use((req, res, next) => {
  res.status(404).json({ error: '🚫 Endpoint not found' });
});

app.use((err, req, res, next) => {
  console.error('🔥 Server Error:', err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

// ✅ Start Express Server
app.listen(PORT, () => {
  console.log(`🚀 Duel Bot Backend running on port ${PORT}`);
});
