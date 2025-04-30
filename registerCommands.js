// registerCommands.js

import { REST, Routes } from 'discord.js';
import { config } from 'dotenv';
import practiceCommand from './commands/practice.js';
import linkDeckCommand from './commands/linkdeck.js';

config(); // Load .env for local, Railway vars in production

const commands = [
  {
    name: practiceCommand.name,
    description: practiceCommand.description,
  },
  {
    name: linkDeckCommand.name,
    description: linkDeckCommand.description,
  },
];

const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

(async () => {
  try {
    console.log('Registering slash commands...');

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );

    console.log('✅ Successfully registered commands.');
  } catch (error) {
    console.error('❌ Failed to register commands:', error);
  }
})();
