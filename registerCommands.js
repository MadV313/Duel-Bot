// registerCommands.js

import { REST, Routes } from 'discord.js';
import { config as dotenvConfig } from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';

dotenvConfig(); // ✅ Load .env file if present

const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const TOKEN = process.env.DISCORD_TOKEN;

if (!CLIENT_ID || !GUILD_ID || !TOKEN) {
  console.error('❌ Missing required environment variables (CLIENT_ID, GUILD_ID, DISCORD_TOKEN).');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(TOKEN);

// 🔁 Load and run all cog functions
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
      const dummyClient = {
        slashData: [],
        commands: new Map()
      };

      await cog.default(dummyClient); // Simulate bot cog registration

      for (const cmd of dummyClient.slashData) {
        commandData.push(cmd);
      }
    } else {
      console.warn(`⚠️ Skipped invalid cog: ${file}`);
    }
  } catch (err) {
    console.error(`❌ Failed to load cog ${file}:`, err);
  }
}

// 🚀 Register all commands to the guild
try {
  console.log('🧹 Clearing existing guild commands...');
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: [] });

  console.log('📤 Registering new commands...');
  commandData.forEach(cmd => console.log(`- /${cmd.name}`));

  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
    body: commandData
  });
