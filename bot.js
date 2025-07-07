import { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, Collection } from 'discord.js';
import { config as dotenvConfig } from 'dotenv';
dotenvConfig();

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId || !guildId) {
  console.error('❌ Missing env vars.');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

const pingCommand = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Replies with Pong!');
client.commands.set('ping', {
  data: pingCommand,
  async execute(interaction) {
    await interaction.reply('🏓 Pong!');
  }
});

// 🚀 Slash register (isolated test)
const rest = new REST({ version: '10' }).setToken(token);
try {
  console.log('📤 Registering minimal /ping command...');
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
    body: [pingCommand.toJSON()]
  });
  console.log('✅ Minimal command registered.');
} catch (err) {
  console.error('❌ Slash registration failed:', err);
  process.exit(1);
}

client.once('ready', () => {
  console.log(`🟢 Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (command) await command.execute(interaction);
});

await client.login(token);
