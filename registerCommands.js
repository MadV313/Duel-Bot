import { REST, Routes } from 'discord.js';
import { config } from 'dotenv';
config(); // Load BOT_TOKEN and CLIENT_ID from Railway or local .env

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

// Optional admin commands
// import buildCommand from './commands/build.js';
// import saveCommand from './commands/save.js';
// import clearCommand from './commands/clear.js';
// import takeCardCommand from './commands/takecard.js';

const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

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
  // buildCommand,
  // saveCommand,
  // clearCommand,
  // takeCardCommand
];

(async () => {
  try {
    console.log('Clearing old guild commands...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, GUILD_ID),
      { body: [] }
    );
    console.log('Old commands cleared.');

    console.log('Registering fresh commands for SV13...');
    const formatted = commands.map(cmd => ({
      name: cmd.name,
      description: cmd.description
    }));

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
