// registerCommands.js
import { REST, Routes } from 'discord.js';
import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import { Client, Collection } from 'discord.js';

const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const TOKEN = process.env.DISCORD_TOKEN;

if (!CLIENT_ID || !GUILD_ID || !TOKEN) {
  console.error('❌ Missing environment variables (CLIENT_ID, GUILD_ID, DISCORD_TOKEN)');
  process.exit(1);
}

const client = new Client({ intents: [] }); // No intents needed for registration
client.commands = new Collection();
client.slashData = [];

const cogsDir = path.resolve('./cogs');
const cogFiles = await fs.readdir(cogsDir);

for (const file of cogFiles) {
  if (!file.endsWith('.js')) continue;

  const cogPath = path.join(cogsDir, file);
  const cogURL = pathToFileURL(cogPath).href;

  try {
    const { default: cog } = await import(cogURL);
    if (typeof cog === 'function') {
      await cog(client); // ✅ Pass client to register commands
      console.log(`✅ Cog registered: ${file}`);
    }
  } catch (err) {
    console.error(`❌ Failed to load cog ${file}:`, err);
  }
}

const rest = new REST({ version: '10' }).setToken(TOKEN);
const commands = client.slashData.map(cmd => cmd);

try {
  console.log('🧹 Clearing existing guild commands...');
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: [] });

  console.log('📤 Registering new commands...');
  commands.forEach(cmd => console.log(`- /${cmd.name}`));

  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });

  console.log('✅ All cog-based commands registered to guild.');
} catch (err) {
  console.error('❌ Command registration failed:', err);
}

// ✅ Export for Railway compatibility
export default async function () {}
