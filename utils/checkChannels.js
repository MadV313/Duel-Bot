export default function checkChannel(interaction, allowedChannelIds) {
  if (!allowedChannelIds.includes(interaction.channelId)) {
    interaction.reply({
      content: `You can only use this command in designated channels.`,
      ephemeral: true
    });
    return false;
  }
  return true;
}
