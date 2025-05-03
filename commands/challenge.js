export default {
  data: new SlashCommandBuilder()
    .setName('challenge')
    .setDescription('Challenge another player to a duel')
    .addUserOption(option =>
      option.setName('opponent')
        .setDescription('Select the player to challenge')
        .setRequired(true)
    ),

  name: 'challenge',
  description: 'Challenge another player to a duel',

  async execute(interaction) {
    // Restrict to #battlefield channel
    if (!isAllowedChannel(interaction.channelId, ['battlefield'])) {
      return interaction.reply({
        content: 'This command can only be used in #battlefield.',
        ephemeral: true
      });
    }

    const challengerId = interaction.user.id;
    const opponent = interaction.options.getUser('opponent');
    const opponentId = opponent.id;

    try {
      const response = await fetch('https://duel-bot-backend-production.up.railway.app/duel/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player1Id: challengerId, player2Id: opponentId }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Unknown error');
      }

      return interaction.reply({
        content: `Duel initialized! [Click here to duel](https://madv313.github.io/Duel-UI/index.html?player1=${challengerId}&player2=${opponentId})`,
        ephemeral: true
      });
    } catch (err) {
      console.error('Challenge failed:', err);
      return interaction.reply({
        content: 'Failed to start duel. Make sure both players have linked decks.',
        ephemeral: true
      });
    }
  }
};
