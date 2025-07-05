// registerCommands.js

import { REST, Routes } from 'discord.js';

const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const TOKEN = process.env.DISCORD_TOKEN;

if (!CLIENT_ID || !GUILD_ID || !TOKEN) {
  console.error('❌ Missing required environment variables (CLIENT_ID, GUILD_ID, DISCORD_TOKEN).');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(TOKEN);

// ✅ Imports — Confirm these match your actual command files
import linkDeckCommand from './cogs/linkdeck.js'

const commands = [
  linkdeckCommand
];

const formatted = commands.filter(cmd => cmd?.data).map(cmd => cmd.data.toJSON());

export default async function registerCommands() {
  try {
    console.log('🧹 Clearing existing guild commands...');
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: [] });

    console.log('📤 Registering new commands...');
    formatted.forEach(cmd => console.log(`- /${cmd.name}`));

    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: formatted });

    console.log('✅ All commands registered to your guild.');
  } catch (err) {
    console.error('❌ Command registration failed:', err);
  }
}
