import { REST, Routes } from 'discord.js';
import { config } from 'dotenv';
config(); // Load DISCORD_TOKEN and CLIENT_ID from Replit secrets or local .env

// SV13 Server ID
const GUILD_ID = '1166441420643639348';

// Import all command modules
import practiceCommand from './commands/practice.js';
import linkDeckCommand from './commands/linkdeck.js';
import challengeCommand from './commands/challenge.js';
import watchCommand from './commands/watch.js';
import leaveCommand from './commands/leave.js';
import buyCardCommand from './commands/buycard.js';
import sellCardCommand from './commands/sellcard.js';
import giveCardCommand from './commands/givecard.js';
import viewDeckCommand from './commands/viewdeck.js';
import discardCommand from './commands/discard.js';
import coinCommand from './commands/coin.js';
import viewLogCommand from './commands/viewlog.js';
import clearCommand from './commands/clear.js';
import takeCardCommand from './commands/takecard.js';

// Use DISCORD_TOKEN now (not BOT_TOKEN)
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

const commandModules = [
  practiceCommand,
  linkDeckCommand,
  challengeCommand,
  watchCommand,
  leaveCommand,
  buyCardCommand,
  sellCardCommand,
  giveCardCommand,
  viewDeckCommand,
  discardCommand,
  coinCommand,
  viewLogCommand,
  clearCommand,
  takeCardCommand
];

// Debug: Log which commands are valid or broken
commandModules.forEach((cmd, index) => {
  if (!cmd || !cmd.data || !cmd.data.name) {
    console.warn(`⚠️ Command at index ${index} is invalid or missing .data:`, cmd);
  } else {
    console.log(`✅ Loaded command: /${cmd.data.name}`);
  }
});

// Filter and format valid commands
const formatted = commandModules
  .filter(cmd => cmd && cmd.data && typeof cmd.data.toJSON === 'function')
  .map(cmd => cmd.data.toJSON());

(async () => {
  try {
    console.log('Wiping ALL commands...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, GUILD_ID),
      { body: [] }
    );
    console.log('✅ All commands wiped successfully.');

    console.log('Registering fresh commands for SV13...');
    formatted.forEach(cmd => console.log(`- /${cmd.name}`));

    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, GUILD_ID),
      { body: formatted }
    );

    console.log('✅ All commands registered cleanly to SV13.');
  } catch (error) {
    console.error('❌ Command registration failed:', error);
  }
})();
