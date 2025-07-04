// registerCommands.js

import { REST, Routes } from 'discord.js';

// Environment Variables
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const TOKEN = process.env.DISCORD_TOKEN;

// Validation
if (!CLIENT_ID || !GUILD_ID || !TOKEN) {
  console.error('❌ Missing required environment variables (CLIENT_ID, GUILD_ID, DISCORD_TOKEN).');
  process.exit(1);
}

// REST client
const rest = new REST({ version: '10' }).setToken(TOKEN);

// ✅ Alphabetically import all commands (add new ones here)
import acceptCommand from './commands/accept.js';
import buyCardCommand from './commands/buycard.js';
import challengeCommand from './commands/challenge.js';
import clearCommand from './commands/clear.js';
import coinCommand from './commands/coin.js';
import denyCommand from './commands/deny.js';
import discardCommand from './commands/discard.js';
import forfeitCommand from './commands/forfeit.js';
import giveCardCommand from './commands/givecard.js';
import leaveCommand from './commands/leave.js';
import linkDeckCommand from './commands/linkdeck.js';
import practiceCommand from './commands/practice.js';
import rulesCommand from './commands/rules.js';
import saveCommand from './commands/save.js';
import sellCardCommand from './commands/sellcard.js';
import takeCardCommand from './commands/takecard.js';
import victoryCommand from './commands/victory.js';
import viewDeckCommand from './commands/viewdeck.js';
import viewLogCommand from './commands/viewlog.js';
import watchCommand from './commands/watch.js';

// 🧩 Add future imports here (e.g., tradeCommand, leaderboardCommand)
// import tradeCommand from './commands/trade.js';
// import leaderboardCommand from './commands/leaderboard.js';

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
  // Add additional commands here when imported
];

// Format commands before registration
const formatted = commands
  .filter(cmd => cmd?.data)
  .map(cmd => cmd.data.toJSON());

// Command Registration Function
export default async function registerCommands() {
  try {
    console.log('📤 Registering new commands...');
    formatted.forEach(cmd => console.log(`- /${cmd.name}`));

    // For development/test servers (instant sync)
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: formatted
    });

    // 🌐 Global rollout (takes ~1 hour to propagate)
    // await rest.put(Routes.applicationCommands(CLIENT_ID), { body: formatted });

    console.log('✅ All commands registered to SV13.');
  } catch (err) {
    console.error('❌ Command registration failed:', err);
  }
}
