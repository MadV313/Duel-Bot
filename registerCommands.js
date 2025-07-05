import { REST, Routes } from 'discord.js';
import { config as dotenvConfig } from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';

dotenvConfig();

const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const TOKEN = process.env.DISCORD_TOKEN;

if (!CLIENT_ID || !GUILD_ID || !TOKEN) {
  console.error('❌ Missing required env vars (CLIENT_ID, GUILD_ID, DISCORD_TOKEN)');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(TOKEN);

const cogsDir = path.resolve('./cogs');
const cogFiles = await fs.readdir(cogsDir);

const commandData = [];

for (const file of cogFiles) {
  if (!file.endsWith('.js')) continue;

  const cogPath = path.join(cogsDir, file);
  const cogURL = pathToFileURL(cogPath).href;

  try {
    const cog = await import(cogURL);
    if (typeof cog.default === 'function') {
      const dummyClient = { slashData: [], commands: new Map() };
      await cog.default(dummyClient); // Call the cog function manually
      commandData.push(...dummyClient.slashData);
    }
  } catch (err) {
    console.error(`❌ Failed to load cog ${file}:`, err);
  }
}

try {
  console.log('🧹 Clearing existing guild commands...');
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: [] });

  console.log('📤 Registering new commands...');
  commandData.forEach(cmd => console.log(`- /${cmd.name}`));

  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commandData });

  console.log('✅ All commands registered to your guild.');
} catch (err) {
  console.error('❌ Command registration failed:', err);
}
