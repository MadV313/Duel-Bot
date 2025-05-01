// registerCommands.js

import { REST, Routes } from 'discord.js';
import { config } from 'dotenv';

// Import all command files
import practiceCommand from './commands/practice.js';
import linkDeckCommand from './commands/linkdeck.js';
import challengeCommand from './commands/challenge.js';
import watchCommand from './commands/watch.js';
import leaveCommand from './commands/leave.js';
import buyCardCommand from './commands/buycard.js';
import sellCardCommand from './commands/sellcard.js';
import giveCardCommand from './commands/givecard.js';

config(); // Load environment variables

const commands = [
  practiceCommand.data.toJSON(),
  linkDeckCommand.data.toJSON(),
  challengeCommand.data.toJSON(),
  watchCommand.data.toJSON(),
  leaveCommand.data.toJSON(),
  buyCardCommand.data.toJSON(),
  sellCardCommand.data.toJSON(),
  giveCardCommand.data.toJSON()
];

const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

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
