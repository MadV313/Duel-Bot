// bot.js

import { Client, Collection, GatewayIntentBits, Events } from 'discord.js';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';

config(); // Load DISCORD_TOKEN from .env or Replit secrets

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// Store commands in a collection for easy access
client.commands = new Collection();
const commandsPath = path.resolve('./commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// Load each command module into the collection
for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = await import(`file://${filePath}`);
  if (command.default?.data && command.default?.execute) {
    client.commands.set(command.default.data.name, command.default);
  } else {
    console.warn(`[WARN] Command at ${filePath} is missing "data" or "execute".`);
  }
}

client.once(Events.ClientReady, () => {
  console.log(`✅ Bot is online as ${client.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`❌ Error executing /${interaction.commandName}:`, err);
    await interaction.reply({ content: 'There was an error executing that command.', ephemeral: true });
  }
});

client.login(process.env.DISCORD_TOKEN);
