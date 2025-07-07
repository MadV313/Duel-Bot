// registerCommands.js

import { REST, Routes } from 'discord.js';
import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';

/**
 * Dynamically loads all cog files and registers their slash commands.
 * Populates client.commands and client.slashData.
 */
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

  // Register commands to Discord (guild-level only)
  if (process.env.CLIENT_ID && process.env.GUILD_ID && process.env.DISCORD_TOKEN) {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    const commands = client.slashData;

    try {
      console.log('📤 Registering commands to guild...');
      commands.forEach(cmd => {
        const name = cmd.name || '[Unnamed]';
        console.log(`- /${name}`);
      });

      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commands }
      );

      console.log(`✅ Registered ${commands.length} command(s) to guild.`);
    } catch (err) {
      console.error('❌ Failed to register commands to Discord:', err);
    }
  } else {
    console.warn('⚠️ Missing ENV vars: CLIENT_ID, GUILD_ID, or DISCORD_TOKEN.');
  }
}

// ✅ Dummy default export for compatibility (e.g. in Railway)
export default async function () {}
