import { REST, Routes } from 'discord.js';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';

import { REST, Routes } from 'discord.js';
import { config } from 'dotenv';
config(); // Load .env or Replit secrets

const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = '1166441420643639348';
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// Explicit command imports
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

// Convert to JSON
const commands = [
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

const formatted = commands.map(cmd =>
  cmd.data ? cmd.data.toJSON() : { name: cmd.name, description: cmd.description }
);

(async () => {
  try {
    console.log('Wiping ALL commands...');
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: [] });
    console.log('✅ All commands wiped successfully.');

    console.log('Registering new commands...');
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: formatted });
    console.log(`✅ ${formatted.length} commands registered to SV13.`);
  } catch (error) {
    console.error('❌ Command registration failed:', error);
  }
})();
