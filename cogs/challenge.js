import { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } from 'discord.js';
import { config } from '../utils/config.js';
import { requireSupporter } from '../utils/roleGuard.js';
import { ensureLinkedToken, PlayerLinks } from '../utils/playerLinks.js';
import { getPlayerProfileByUserId } from '../utils/deckUtils.js';
import { createChallengeSession, decideChallenge, expireChallenge, getSession, listSessions, mutateSession, challengeDeadline } from '../logic/duelSessions.js';

const SECOND = 1000;
const HOUR = 3600 * SECOND;
const pendingText = s => `⚔️ **SV13 TCG challenge**\n<@${s.player1.userId}> challenged <@${s.player2.userId}>.\n**Status:** Awaiting response\n**Expires:** <t:${Math.floor(challengeDeadline(s) / SECOND)}:F> (<t:${Math.floor(challengeDeadline(s) / SECOND)}:R>)\n**Time limit:** 24 hours`; // Discord updates relative time client-side.
const buttons = id => [new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(`challenge_accept_${id}`).setLabel('Accept').setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId(`challenge_deny_${id}`).setLabel('Deny').setStyle(ButtonStyle.Danger)
)];
const errorText = e => String(e?.message || e).slice(0, 400);

async function dm(client, id, body) {
  try { return await (await client.users.fetch(id)).send(body); }
  catch (e) { console.warn(`[challenge] DM failed for ${id}: ${errorText(e)}`); return null; }
}
async function editOriginal(client, userId, messageId, body) {
  if (!messageId) return;
  try { const channel = await (await client.users.fetch(userId)).createDM(); await (await channel.messages.fetch(messageId)).edit(body); }
  catch (e) { console.warn(`[challenge] Could not update challenge message: ${errorText(e)}`); }
}
async function syncMessages(client, session) {
  const id = session.id;
  const state = session.status;
  const content = state === 'pending' ? pendingText(session) :
    state === 'live' ? `✅ **Challenge accepted** — <@${session.player2.userId}> accepted <@${session.player1.userId}>'s duel challenge.` :
    state === 'denied' ? `❌ **Challenge declined** — <@${session.player2.userId}> declined <@${session.player1.userId}>'s duel challenge.` :
    `⏰ **Challenge expired** — The 24-hour response period ended without an acceptance.`;
  const notices = session.challengeNotices || {};
  await Promise.all([
    editOriginal(client, session.player1.userId, notices.challengerMessageId, { content, components: [] }),
    editOriginal(client, session.player2.userId, notices.opponentMessageId, { content, components: state === 'pending' ? buttons(id) : [] }),
  ]);
}

// Status is persisted in DuelSession storage, not kept in a 2-minute collector.
// One reconciliation pass at startup and every minute handles restarts and offline time.
async function sweep(client) {
  const rows = await listSessions({ activeOnly: true });
  for (const row of rows.filter(r => r.mode === 'pvp' && r.status === 'pending')) {
    try {
      const s = await getSession(row.id);
      if (!s || s.status !== 'pending') continue;
      if (Date.now() >= challengeDeadline(s)) {
        const expired = await expireChallenge(s.id);
        if (expired.status === 'expired') {
          await syncMessages(client, expired);
          await Promise.all([
            dm(client, s.player1.userId, `⏰ Your duel challenge to <@${s.player2.userId}> expired after 24 hours.`),
            dm(client, s.player2.userId, `⏰ The duel challenge from <@${s.player1.userId}> expired.`),
          ]);
        }
      } else if (Date.now() >= Date.parse(s.createdAt) + 12 * HOUR && !s.challengeNotices?.remindedAt) {
        // Claim reminder using the atomic session mutation, preventing duplicate reminders per process/restart.
        let claimed = false;
        await mutateSession(s.id, current => {
          if (current.status === 'pending' && !current.challengeNotices?.remindedAt && Date.now() < challengeDeadline(current)) {
            current.challengeNotices = { ...(current.challengeNotices || {}), remindedAt: new Date().toISOString() };
            claimed = true;
          }
          return current;
        });
        if (claimed) await dm(client, s.player2.userId, `🔔 **12-hour duel reminder**\n<@${s.player2.userId}>, <@${s.player1.userId}> is still awaiting your response.\nExpires <t:${Math.floor(challengeDeadline(s) / SECOND)}:R>.\nUse **Accept** or **Deny** on the original DM.`);
      }
    } catch (e) { console.error(`[challenge] Reconciliation failed ${row.id}:`, errorText(e)); }
  }
}

export default async function registerChallenge(client) {
  const data = new SlashCommandBuilder().setName('challenge').setDescription('Challenge another linked player to a duel (24-hour response window).')
    .addUserOption(o => o.setName('opponent').setDescription('Player to challenge').setRequired(true)).setDMPermission(false);
  client.slashData.push(data.toJSON());
  client.commands.set('challenge', { data, async execute(i) {
    if (!requireSupporter(i.member)) return i.reply({ content: '❌ Supporter or Elite Collector role required.', ephemeral: true });
    if (config.battlefield_channel_id && String(i.channelId) !== String(config.battlefield_channel_id)) return i.reply({ content: `⚠️ Use this in <#${config.battlefield_channel_id}>.`, ephemeral: true });
    const opponent = i.options.getUser('opponent', true);
    if (opponent.bot || opponent.id === i.user.id) return i.reply({ content: '❌ Choose another human player.', ephemeral: true });
    try {
      await i.deferReply({ ephemeral: true });
      const challengerToken = await ensureLinkedToken(i.user.id, i.user.username);
      const opponentProfile = await getPlayerProfileByUserId(opponent.id);
      if (!opponentProfile?.token) return i.editReply('❌ That player is not linked.');
      const s = await createChallengeSession({ challengerId: i.user.id, challengerToken, challengerName: i.user.username, opponentId: opponent.id, opponentToken: opponentProfile.token, opponentName: opponent.username });
      const targetMsg = await dm(client, opponent.id, { content: pendingText(s), components: buttons(s.id) });
      if (!targetMsg) { await expireChallenge(s.id); return i.editReply('❌ Challenge not delivered. That player must enable server DMs. No challenge remains pending.'); }
      const sourceMsg = await dm(client, i.user.id, { content: `${pendingText(s)}\nYou will receive an update when your opponent responds.`, components: [] });
      await mutateSession(s.id, session => {
        session.challengeNotices = { opponentMessageId: targetMsg.id, challengerMessageId: sourceMsg?.id || null };
        return session;
      });
      return i.editReply(`✅ Your challenge was **delivered** to <@${opponent.id}>.\nExpires <t:${Math.floor(challengeDeadline(s) / SECOND)}:F> (<t:${Math.floor(challengeDeadline(s) / SECOND)}:R>).\n${sourceMsg ? 'A status notice was also sent to your DMs.' : 'Your DMs were unavailable; response updates will appear here only during this command, so enable DMs to receive future updates.'}`);
    } catch (e) { return i.deferred || i.replied ? i.editReply(`❌ ${errorText(e)}`) : i.reply({ content: `❌ ${errorText(e)}`, ephemeral: true }); }
  }});

  client.on('interactionCreate', async i => {
    if (!i.isButton() || !/^challenge_(accept|deny)_[A-Za-z0-9_-]{12,128}$/.test(i.customId)) return;
    const sessionId = i.customId.replace(/^challenge_(?:accept|deny)_/, '');
    try {
      if (!i.deferred && !i.replied) await i.deferReply({ ephemeral: true });
      const session = await getSession(sessionId);
      if (!session || session.mode !== 'pvp' || i.user.id !== session.player2.userId) return i.editReply('❌ This challenge does not belong to you.');
      if (session.status !== 'pending') return i.editReply(`ℹ️ This challenge is already ${session.status}.`);
      if (Date.now() >= challengeDeadline(session)) {
        const expired = await expireChallenge(session.id);
        await syncMessages(client, expired);
        return i.editReply('⏰ This challenge has expired.');
      }
      const profile = await getPlayerProfileByUserId(i.user.id);
      if (!profile?.token) return i.editReply('❌ Your TCG account is not linked.');
      const decision = i.customId.startsWith('challenge_accept_') ? 'accept' : 'deny';
      const result = await decideChallenge(session.id, profile.token, decision);
      await syncMessages(client, result);
      if (decision === 'deny') {
        await dm(client, result.player1.userId, `❌ <@${result.player2.userId}> declined your duel challenge.`);
        return i.editReply('❌ You declined the duel challenge. The challenger has been notified.');
      }
      const challenger = await getPlayerProfileByUserId(result.player1.userId);
      const challengerNotice = challenger?.token ? await dm(client, result.player1.userId, `✅ <@${result.player2.userId}> accepted your challenge.\n**Your private duel link:** ${PlayerLinks.duel(result.id, challenger.token)}\n**Spectator link:** ${PlayerLinks.spectator(result.id)}\nKeep your player link private.`) : null;
      await dm(client, result.player2.userId, `✅ You accepted <@${result.player1.userId}>'s duel challenge.\n**Your private duel link:** ${PlayerLinks.duel(result.id, profile.token)}\nKeep your player link private.`);
      return i.editReply(`✅ Challenge accepted!\n**Your private duel link:** ${PlayerLinks.duel(result.id, profile.token)}\n${!challengerNotice ? '⚠️ The challenger could not be DM-notified; ask them to enable DMs.' : 'The challenger has been sent their private duel link.'}`);
    } catch (e) { console.error('[challenge] Decision failed:', errorText(e)); if (i.deferred || i.replied) await i.editReply(`❌ ${errorText(e)}`).catch(() => {}); else await i.reply({ content: `❌ ${errorText(e)}`, ephemeral: true }).catch(() => {}); }
  });
  client.once('ready', () => {
    void sweep(client).catch(e => console.error('[challenge] Startup sweep:', errorText(e)));
    const timer = setInterval(() => { void sweep(client).catch(e => console.error('[challenge] Sweep:', errorText(e))); }, 60 * SECOND);
    timer.unref?.();
  });
}
