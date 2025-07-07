
// bot.js

import { Client, GatewayIntentBits, Collection } from 'discord.js';
import { config as dotenvConfig } from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import { config } from './utils/config.js';

dotenvConfig(); // ✅ Load .env

const tokenEnvKey = config.token_env || 'DISCORD_TOKEN';
const token = process.env[tokenEnvKey];
const clientId = config.client_id;

if (!token || !clientId) {
  console.error(`❌ Missing DISCORD_TOKEN or client_id. Check environment and config.js.`);
  process.exit(1);
}

// 🔁 Create the bot instance
import { Client as CogClient } from 'discord.js';
const client = new CogClient({
  intents: [GatewayIntentBits.Guilds]
});

// 🧠 Cog registry
client.commands = new Collection();
client.slashData = [];

const cogsDir = path.resolve('./cogs');
const cogFiles = await fs.readdir(cogsDir);

// 🔄 Load all cog modules from /cogs
for (const file of cogFiles) {
  if (!file.endsWith('.js')) continue;

  const cogPath = path.join(cogsDir, file);
  const cogURL = pathToFileURL(cogPath).href;

  try {
    const { default: cog } = await import(cogURL);
    if (typeof cog === 'function') {
      await cog(client); // ✅ Initialize Cog with client
      console.log(`✅ Cog loaded: ${file}`);
    } else {
      console.warn(`⚠️ Skipped invalid Cog: ${file}`);
    }
  } catch (err) {
    console.error(`❌ Failed to load cog ${file}:`, err);
  }
}

// 🚀 Register all slash commands
import { REST, Routes } from 'discord.js';
const rest = new REST({ version: '10' }).setToken(token);

try {
  console.log(`🔁 Syncing ${client.slashData.length} slash commands...`);
  const guildId = process.env.GUILD_ID;
  if (!guildId) {
    console.error('❌ Missing GUILD_ID in Railway environment variables.');
    process.exit(1);
  }

  // 🧹 Clear old broken commands (optional but helpful)
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });

  // 📤 Upload fresh working ones
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: client.slashData });
  console.log('✅ Slash commands registered.');
} catch (err) {
  console.error('❌ Failed to register slash commands:', err);
}

// 🤖 Bot online event
client.once('ready', () => {
  console.log(`🚀 Bot is online as ${client.user.tag}`);
});

// 🎮 Slash Command Handler
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
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

// 🧼 Graceful shutdown
process.on('SIGINT', () => {
  console.log('🛑 Bot shutting down...');
  client.destroy();
  process.exit(0);
});

await client.login(token);
