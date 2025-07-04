// bot.js

import { Client, GatewayIntentBits, Events, Collection } from 'discord.js';
import { config as dotenvConfig } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import config from './config.json' assert { type: 'json' };

dotenvConfig(); // ✅ Load .env variables

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.commands = new Collection();

// 🔁 Load all command files from ./commands
const commandsDir = path.resolve('./commands');
const commandFiles = fs.readdirSync(commandsDir).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
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
      console.log(`✅ Loaded command: /${name}`);
    } else {
      console.warn(`⚠️ Invalid command structure in ${file}`);
    }
  } catch (err) {
    console.error(`❌ Failed to load command ${file}:`, err);
  }
}

// ✅ Ready Event
client.once(Events.ClientReady, () => {
  console.log(`🚀 Bot is online as ${client.user.tag}`);
});

// ✅ Command Interaction Handler
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);

  if (!command) {
    return interaction.reply({
      content: '❌ Command not recognized.',
      ephemeral: true
    });
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`❌ Error executing /${interaction.commandName}:`, error);
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

await client.login(token);

// 🧼 Graceful shutdown
process.on('SIGINT', () => {
  console.log('🛑 Bot shutting down...');
  client.destroy();
  process.exit(0);
});
