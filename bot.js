// bot.js

import { Client, GatewayIntentBits, Events, Collection } from 'discord.js';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';

config(); // Load DISCORD_TOKEN from .env or Replit secrets

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// Store commands in a Collection
client.commands = new Collection();

// Dynamically read all command files from the /commands folder
const commandsPath = path.join(process.cwd(), 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = await import(`./commands/${file}`);
  if (command.default?.data && command.default?.execute) {
    client.commands.set(command.default.data.name, command.default);
  }
}

client.once(Events.ClientReady, () => {
  console.log(`✅ Bot is online as ${client.user.tag}`);
});

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
    interaction.reply({
      content: '⚠️ There was an error executing this command.',
      ephemeral: true
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
