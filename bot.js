// bot.js

import { Client, GatewayIntentBits, Events, Collection } from 'discord.js';
import { config as dotenvConfig } from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import { config } from './utils/config.js';

dotenvConfig(); // Load .env variables

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.commands = new Collection();

const commandsDir = path.resolve('./commands');
const commandFiles = await fs.readdir(commandsDir);

console.log(`🔍 Scanning ${commandFiles.length} command files in ${commandsDir}...`);

for (const file of commandFiles) {
  if (!file.endsWith('.js')) continue;

  const filePath = path.join(commandsDir, file);
  const commandUrl = pathToFileURL(filePath).href;

  try {
    const command = await import(commandUrl);
    if (command.default?.data?.name && typeof command.default.execute === 'function') {
      const name = command.default.data.name;
      if (client.commands.has(name)) {
        console.warn(`⚠️ Duplicate command detected: /${name}`);
      }
      client.commands.set(name, command.default);
      console.log(`✅ Loaded command: /${name}`);
    } else {
      console.warn(`⚠️ Invalid command structure in ${file} — missing name or execute()`);
    }
  } catch (err) {
    console.error(`❌ Failed to load command ${file}:`, err);
  }
}

console.log(`📦 Total registered commands: ${client.commands.size}`);

// ✅ Bot Ready Event
client.once(Events.ClientReady, () => {
  console.log(`🚀 Bot is online as ${client.user.tag}`);
});

// ✅ Command Interaction Handler
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, user, channelId } = interaction;
  const command = client.commands.get(commandName);

  console.log(`📥 ${user.username}#${user.discriminator} (${user.id}) attempted /${commandName} in channel ${channelId}`);

  if (!command) {
    console.warn(`⚠️ Command "/${commandName}" not found in client.commands.`);
    return interaction.reply({
      content: `❌ Command "/${commandName}" not recognized.`,
      ephemeral: true
    });
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`❌ Error executing /${commandName}:`, error);
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({
        content: '⚠️ There was an error executing this command.',
        ephemeral: true
      });
    } else {
      await interaction.reply({
        content: '⚠️ There was an error executing this command.',
        ephemeral: true
      });
    }
  }
});

// 🛡️ Secure token loading
const tokenEnvKey = config.token_env || 'DISCORD_TOKEN';
const token = process.env[tokenEnvKey];

if (!token) {
  console.error(`❌ No bot token found in environment variable: ${tokenEnvKey}`);
  process.exit(1);
}

console.log('🔑 Logging in to Discord...');
await client.login(token);

// 🧼 Graceful shutdown
process.on('SIGINT', () => {
  console.log('🛑 Bot shutting down...');
  client.destroy();
  process.exit(0);
});
