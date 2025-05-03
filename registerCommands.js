// registerCommands.js

import { REST, Routes } from 'discord.js';
import { config } from 'dotenv';

// Load environment variables (DISCORD_TOKEN, CLIENT_ID, etc.)
config();

// Import ALL command modules
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

// OPTIONAL: Add build/save/takecard/clear if implemented
// import buildCommand from './commands/build.js';
// import saveCommand from './commands/save.js';
// import clearCommand from './commands/clear.js';
// import takeCardCommand from './commands/takecard.js';

// Define all commands to register
const commands = [
  practiceCommand.data.toJSON(),
  linkDeckCommand.data.toJSON(),
  challengeCommand.data.toJSON(),
  watchCommand.data.toJSON(),
  leaveCommand.data.toJSON(),
  buyCardCommand.data.toJSON(),
  sellCardCommand.data.toJSON(),
  giveCardCommand.data.toJSON(),
  viewDeckCommand.data.toJSON(),
  discardCommand.data.toJSON(),
  coinCommand.data.toJSON(),
  viewLogCommand.data.toJSON(),
  // buildCommand.data.toJSON(),
  // saveCommand.data.toJSON(),
  // clearCommand.data.toJSON(),
  // takeCardCommand.data.toJSON()
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Registering slash commands...');

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );

    console.log('✅ Successfully registered all commands.');
  } catch (error) {
    console.error('❌ Failed to register commands:', error);
  }
})();
