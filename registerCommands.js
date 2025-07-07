// registerCommands.js

import { REST, Routes } from 'discord.js';
import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';

export async function registerWithClient(client) {
  client.commands = new Map();
  client.slashData = [];

  const cogsDir = path.resolve('./cogs');
  let cogFiles = [];

  try {
    cogFiles = await fs.readdir(cogsDir);
  } catch (err) {
    console.error('❌ Could not read cogs directory:', err);
    return;
  }

  for (const file of cogFiles) {
    if (!file.endsWith('.js')) continue;

    const cogPath = path.join(cogsDir, file);
    const cogURL = pathToFileURL(cogPath).href;

    try {
      const { default: cog } = await import(cogURL);
      if (typeof cog === 'function') {
        await cog(client);
        console.log(`✅ Cog loaded: ${file}`);
      } else {
        console.warn(`⚠️ Skipped ${file}: No default export or invalid handler`);
      }
    } catch (err) {
      console.error(`❌ Failed to load cog ${file}:`, err);
    }
  }

  const { CLIENT_ID, GUILD_ID, DISCORD_TOKEN } = process.env;

  if (CLIENT_ID && GUILD_ID && DISCORD_TOKEN) {
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    const commands = client.slashData.map((cmd, i) => {
      try {
        if (!cmd || typeof cmd !== 'object' || !cmd.name) {
          console.warn(`⚠️ Skipping malformed command [index ${i}]:`, cmd);
          return null;
        }
        const converted = cmd.toJSON ? cmd.toJSON() : cmd;
        console.log(`📦 Preparing /${converted.name}`);
        return converted;
      } catch (err) {
        console.error(`❌ Error serializing command [index ${i}]:`, err);
        return null;
      }
    }).filter(Boolean);

    try {
      console.log('📤 Registering slash commands to guild:', GUILD_ID);
      if (!commands.length) {
        console.warn('⚠️ No valid commands found to register.');
        return;
      }

      // Optional: clear old commands first
      console.log('🧼 Clearing old commands...');
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: [] });
      await new Promise(r => setTimeout(r, 1000)); // wait 1s to prevent flood

      console.log(`🚀 Sending ${commands.length} command(s) to Discord...`);
      const response = await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
        { body: commands }
      );

      console.log(`✅ Discord acknowledged ${Array.isArray(response) ? response.length : '?'} command(s).`);
    } catch (err) {
      console.error('❌ Slash command registration failed:', err?.message || err);
      if (err?.stack) console.error(err.stack);
    }
  } else {
    console.warn('⚠️ Missing ENV vars: CLIENT_ID, GUILD_ID, or DISCORD_TOKEN.');
    console.log('🔧 CLIENT_ID:', CLIENT_ID);
    console.log('🔧 GUILD_ID:', GUILD_ID);
    console.log('🔧 DISCORD_TOKEN length:', DISCORD_TOKEN?.length || 0);
  }
}

// ✅ Dummy export for Railway compatibility
export default async function () {}
