// cogs/resync.js — Admin-only: force a slash-command resync
// - Channel restricted to #admin-tools (ID below)
// - Requires Administrator permission
// - Scope option: 'guild' (default, immediate) or 'global' (Discord cache delay)
// - Uses client.slashData (the same array you push all command JSON into on startup)

import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder
} from 'discord.js';

const ADMIN_CHANNEL_ID = '1368023977519222895';   // SV13 admin tools channel
const DEFAULT_SCOPE = 'guild';                     // 'guild' | 'global'

export default async function registerResync(client) {
  const data = new SlashCommandBuilder()
    .setName('resync')
    .setDescription('Admin: Force a slash-command resync.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(opt =>
      opt
        .setName('scope')
        .setDescription('Where to resync commands')
        .addChoices(
          { name: 'Guild (this server, fast)', value: 'guild' },
          { name: 'Global (all servers, slow to propagate)', value: 'global' },
        )
        .setRequired(false)
    );

  client.slashData.push(data.toJSON());

  client.commands.set('resync', {
    data,
    async execute(interaction) {
      // Channel guard
      if (String(interaction.channelId) !== ADMIN_CHANNEL_ID) {
        return interaction.reply({
          content: `❌ This command must be used in <#${ADMIN_CHANNEL_ID}>.`,
          ephemeral: true
        });
      }

      // Admin permission guard (extra safety — command already requires Administrator)
      const member = interaction.member;
      if (!member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '🚫 Administrator permission required.', ephemeral: true });
      }

      const scope = interaction.options.getString('scope') || DEFAULT_SCOPE;

      // Defer ephemeral
      try {
        await interaction.deferReply({ ephemeral: true });
      } catch {
        // ignore if already replied by Discord race
      }

      const startedAt = Date.now();
      let resultNote = '';
      let count = 0;

      try {
        if (scope === 'global') {
          // Global set (can take a while to show up everywhere)
          const cmds = await interaction.client.application?.commands.set(client.slashData);
          count = (cmds?.size ?? cmds?.length ?? 0);
          resultNote = 'Global application commands have been updated. Note: global propagation can take several minutes.';
        } else {
          // Guild-only set (fast) — affects just the invoking guild
          const guild = interaction.guild;
          if (!guild) {
            throw new Error('Not in a guild context — cannot sync guild commands.');
          }
          const cmds = await guild.commands.set(client.slashData);
          count = (cmds?.size ?? cmds?.length ?? 0);
          resultNote = `Guild commands updated for **${guild.name}**.`;
        }
      } catch (e) {
        const msg = `❌ Resync failed: ${e?.message || String(e)}`;
        try {
          return await interaction.editReply({ content: msg });
        } catch {
          return;
        }
      }

      const ms = Date.now() - startedAt;

      const embed = new EmbedBuilder()
        .setTitle('🔁 Slash Commands Resynced')
        .setDescription(resultNote)
        .addFields(
          { name: 'Scope', value: scope, inline: true },
          { name: 'Commands', value: String(count), inline: true },
          { name: 'Elapsed', value: `${ms}ms`, inline: true }
        )
        .setColor(0x22c55e);

      // Helpful hints if they were seeing “application did not respond”
      const footer = (scope === 'global')
        ? 'Tip: Global command changes can take a while to appear. Use /resync scope:guild for immediate testing.'
        : 'If you still see “application did not respond”, check bot logs for runtime errors in the command handlers.';
      embed.setFooter({ text: footer });

      try {
        await interaction.editReply({ embeds: [embed] });
      } catch {
        // swallow
      }
    }
  });
}
