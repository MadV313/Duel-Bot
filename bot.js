// bot.js

import { Client, GatewayIntentBits, Events, Collection, REST, Routes } from 'discord.js';
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

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.commands = new Collection();

// 🔁 Load all command files from ./commands
const commandsDir = path.resolve('./commands');
const commandFiles = await fs.readdir(commandsDir);

const commandData = [];

for (const file of commandFiles) {
  if (!file.endsWith('.js')) continue;

  const filePath = path.join(commandsDir, file);
  const commandUrl = pathToFileURL(filePath).href;

  try {
    const command = await import(commandUrl);
    if (command.default?.data && command.default?.execute) {
      const name = command.default.data.name;
      if (client.commands.has(name)) {
        console.warn(`⚠️ Duplicate command detected: /${name}`);
      }
      client.commands.set(name, command.default);
      commandData.push(command.default.data.toJSON());
      console.log(`✅ Loaded command: /${name}`);

      // 🧪 DEBUG: Confirm /linkdeck is registered
      if (name === 'linkdeck') {
        console.log('🧷 Confirmed /linkdeck registered with execute =', typeof command.default.execute);
      }

    } else {
      console.warn(`⚠️ Invalid command in ${file}`);
    }
  } catch (err) {
    console.error(`❌ Failed to load command ${file}:`, err);
  }
}

// 🚀 Refresh global commands on startup
const rest = new REST({ version: '10' }).setToken(token);

try {
  console.log(`🔁 Syncing ${commandData.length} global slash commands...`);
  await rest.put(Routes.applicationCommands(clientId), { body: commandData });
  console.log('✅ Global slash commands refreshed.');
} catch (err) {
  console.error('❌ Failed to refresh global commands:', err);
}

// ✅ Bot Ready
client.once(Events.ClientReady, () => {
  console.log(`🚀 Bot is online as ${client.user.tag}`);
});

// ✅ Handle Slash Command Interactions
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) {
    console.warn(`⚠️ Unknown command: /${interaction.commandName}`);
    return interaction.reply({ content: '❌ Unknown command.', ephemeral: true });
  }

  // Log user + channel + command
  const user = interaction.user;
  const channelId = interaction.channelId;
  console.log(`📥 ${user.username} (${user.id}) ran /${interaction.commandName} in channel ${channelId}`);

  // 🧪 DEBUG: Confirm /linkdeck matched and about to execute
  if (interaction.commandName === 'linkdeck') {
    console.log('🧪 /linkdeck command matched and about to execute...');
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`❌ Error executing /${interaction.commandName}:`, error);
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
