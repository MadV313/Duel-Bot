// registerCommands.js

import { REST, Routes } from 'discord.js';
import { config } from 'dotenv';
import practiceCommand from './commands/practice.js';

config(); // Loads .env file

const commands = [
  practiceCommand.data.toJSON(),
  // Add more commands as you go
];

const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

(async () => {
  try {
    console.log('Refreshing application (/) commands...');

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands },
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();
