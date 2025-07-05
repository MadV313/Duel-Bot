// registerCommands.js
import { REST, Routes } from 'discord.js';
import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';

/**
 * Dynamically registers all cogs and their commands to the Discord client.
 * This is called from server.js to populate client.commands and client.slashData.
 */
export async function registerWithClient(client) {
  client.commands = new Map();
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
        await cog(client); // ✅ Register the cog and its commands
        console.log(`✅ Cog registered: ${file}`);
      }
    } catch (err) {
      console.error(`❌ Failed to load cog ${file}:`, err);
    }
  }

  // Optional: Only re-register if needed (use from server.js)
  if (process.env.CLIENT_ID && process.env.GUILD_ID && process.env.DISCORD_TOKEN) {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    const commands = client.slashData.map(cmd => cmd);

    try {
      console.log('🧹 Clearing existing guild commands...');
      await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: [] });

      console.log('📤 Registering new commands...');
      commands.forEach(cmd => console.log(`- /${cmd.name}`));

      await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), {
        body: commands
      });

      console.log('✅ All cog-based commands registered to guild.');
    } catch (err) {
      console.error('❌ Command registration failed:', err);
    }
  }
}

// ✅ Dummy export to satisfy default import in server.js (for Railway)
export default async function () {}
