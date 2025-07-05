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
import acceptCommand from './cogs/accept.js';
import buyCardCommand from './cogs/buycard.js';
import challengeCommand from './cogs/challenge.js';
import clearCommand from './cogs/clear.js';
import coinCommand from './cogs/coin.js';
import denyCommand from './cogs/deny.js';
import discardCommand from './cogs/discard.js';
import forfeitCommand from './cogs/forfeit.js';
import giveCardCommand from './cogs/givecard.js';
import leaveCommand from './cogs/leave.js';
import linkDeckCommand from './cogs/linkdeck.js';
import practiceCommand from './cogs/practice.js';
import rulesCommand from './cogs/rules.js';
import saveCommand from './cogs/save.js';
import sellCardCommand from './cogs/sellcard.js';
import takeCardCommand from './cogs/takecard.js';
import victoryCommand from './cogs/victory.js';
import viewDeckCommand from './cogs/viewdeck.js';
import viewLogCommand from './cogs/viewlog.js';
import watchCommand from './cogs/watch.js';

const commands = [
  acceptCommand,
  buyCardCommand,
  challengeCommand,
  clearCommand,
  coinCommand,
  denyCommand,
  discardCommand,
  forfeitCommand,
  giveCardCommand,
  leaveCommand,
  linkDeckCommand,
  practiceCommand,
  rulesCommand,
  saveCommand,
  sellCardCommand,
  takeCardCommand,
  victoryCommand,
  viewDeckCommand,
  viewLogCommand,
  watchCommand
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
