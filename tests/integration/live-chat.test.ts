import { eq, inArray, like, or } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFakeSupportAssistant } from '@/integrations/ai/support-assistant';
import { askSupportAssistant, getHelpChat, handOffToSupport } from '@/modules/assist/support-chat';
import { staffRoles, usernames, users } from '@/modules/accounts/schema';
import { assignUsername, changeUsername, findUserIdByUsername, usernamesOf } from '@/modules/accounts/usernames';
import { endLiveChat, getAdminLivePage, joinLiveChat, liveReply, liveWaitingCount, requestLiveChat, typingInLiveChat } from '@/modules/support/live-chat';
import { supportCaseEvents, supportCaseReads, supportCases } from '@/modules/support/schema';
import { getSupportCasePage, replyToSupportCase } from '@/modules/support/service';
import { staffReply, type StaffActor } from '@/modules/support/staff';
import { auditLog } from '@/platform/audit/schema';
import { createDb } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';
import { rateLimits } from '@/platform/rate-limit/schema';
import { throwawayClient } from '../support/people';

/**
 * Live chat with support and @usernames (2026-11-22). "Talk to a person" puts the member in the live queue; someone from
 * support joins (the member sees who), they write to each other, the chat ends and can be asked for again; a reply from
 * the case page joins a waiting chat too. Usernames: given from the first name, changed at most once in 30 days, found
 * with or without "@", and freed with the account. Its own members and staff, removed at the end, so nothing stays on
 * the seeded cast (the seeded staff's reply limits included).
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const assistant = createFakeSupportAssistant();
const agentA: StaffActor = { id: 'usr_live_agent_a', roles: ['support_agent'] };
const agentB: StaffActor = { id: 'usr_live_agent_b', roles: ['support_agent'] };
const lead: StaffActor = { id: 'usr_live_lead', roles: ['support_lead'] };
const chatId = 'ach_live_chat_integration_1';
const members = ['usr_live_member_1', 'usr_live_member_2', 'usr_live_member_3'];
let [first, second, third] = ['', '', ''];

async function caseOf(userId: string) {
  const rows = await db.select().from(supportCases).where(eq(supportCases.openedByUserId, userId));
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]!;
}

async function talkToAPerson(userId: string, details: string, now: Date) {
  expect(await handOffToSupport(db, userId, { chatId, topic: 'booking', details, turns: [] }, now)).toEqual({ ok: true, code: 'submitted' });
  return caseOf(userId);
}

/** Live notices on the shared channel while `run` runs, for this case (`*`: all of them). */
async function noticesDuring(caseId: string, run: () => Promise<unknown>): Promise<{ channel: string; notice: { type: string; event?: string; case?: string } }[]> {
  const client = await pool.connect();
  const heard: { channel: string; notice: { type: string; event?: string; case?: string } }[] = [];
  const onNotice = (message: { payload?: string }) => {
    const envelope = JSON.parse(message.payload ?? '{}') as (typeof heard)[number];
    if (caseId === '*' || envelope.notice?.case === caseId) heard.push(envelope);
  };
  client.on('notification', onNotice);
  try {
    await client.query('LISTEN tnm_realtime');
    await run();
    await new Promise((resolve) => setTimeout(resolve, 150));
    return heard;
  } finally {
    client.removeListener('notification', onNotice);
    await client.query('UNLISTEN tnm_realtime');
    client.release();
  }
}

beforeAll(async () => {
  [first, second, third] = await Promise.all(members.map((id) => throwawayClient(db, id)));
  const [alex] = await db.select().from(users).where(eq(users.id, 'usr_alex'));
  for (const [actor, firstName] of [[agentA, 'Avery'], [agentB, 'Blake'], [lead, 'Lena']] as const) {
    await db.insert(users).values({ ...alex!, id: actor.id, email: `${actor.id}@example.test`, firstName, lastName: 'Test', name: `${firstName} T.` }).onConflictDoNothing({ target: users.id });
    await db.insert(staffRoles).values({ userId: actor.id, role: actor.roles[0]!, grantedBy: 'test' }).onConflictDoNothing();
  }
});

afterAll(async () => {
  // The staff roles first: the seeded-people checks count every staff role.
  const staffIds = [agentA.id, agentB.id, lead.id];
  await db.delete(staffRoles).where(inArray(staffRoles.userId, staffIds));
  const ids = (await db.select({ id: supportCases.id }).from(supportCases).where(inArray(supportCases.openedByUserId, members))).map((row) => row.id);
  if (ids.length) {
    await db.delete(supportCaseEvents).where(inArray(supportCaseEvents.caseId, ids));
    await db.delete(supportCaseReads).where(inArray(supportCaseReads.caseId, ids));
    await db.delete(outboxEvents).where(inArray(outboxEvents.aggregateId, ids));
    await db.delete(auditLog).where(inArray(auditLog.targetId, ids));
    await db.delete(supportCases).where(inArray(supportCases.id, ids));
  }
  await db.delete(rateLimits).where(or(...[...members, ...staffIds].map((id) => like(rateLimits.key, `%:${id}`))));
  await db.delete(usernames).where(inArray(usernames.userId, [...members, ...staffIds]));
  await db.delete(users).where(inArray(users.id, staffIds));
  await pool.end();
});

describe('live chat with support', () => {
  it('"Talk to a person" puts them in line, in order, and support on duty hear it at once', async () => {
    // Both a moment ago, the first before the second (what support does next happens now).
    const now = new Date(Date.now() - 2_000);
    const before = await liveWaitingCount(db, now);
    let firstCase: Awaited<ReturnType<typeof caseOf>> | undefined;
    const heard = await noticesDuring('*', async () => {
      firstCase = await talkToAPerson(first, 'Jordan never came on Saturday.', now);
    });
    expect(firstCase).toMatchObject({ liveRequestedAt: now, liveJoinedAt: null, liveAgentUserId: null, liveEndedAt: null });
    expect(heard.some((envelope) => envelope.channel === 'staff:support' && envelope.notice.event === 'support.live_requested' && envelope.notice.case === firstCase!.id)).toBe(true);
    const secondCase = await talkToAPerson(second, 'I was charged twice.', new Date(now.getTime() + 1_000));
    expect(secondCase.liveRequestedAt!.getTime()).toBeLessThan(Date.now());
    expect(await liveWaitingCount(db, now)).toBe(before + 2);

    // The member: second in line, and whether anyone from support is online.
    const help = await getHelpChat(db, second, new Date(), { assistant, markRead: false, agentsOnline: 1 });
    expect(help?.case).toMatchObject({ id: secondCase.id, canRequestLive: false, live: { state: 'waiting', position: before + 2, agentsOnline: true } });
    const offline = await getHelpChat(db, first, new Date(), { assistant, markRead: false, agentsOnline: 0 });
    expect(offline?.case?.live).toMatchObject({ state: 'waiting', position: before + 1, agentsOnline: false });

    // Staff: both in the queue, oldest first, with who they are.
    const console = await getAdminLivePage(db, agentA, new Date(), { agentsOnline: 1 });
    const queued = console.waiting.map((row) => row.caseId);
    expect(queued.indexOf(firstCase!.id)).toBeGreaterThanOrEqual(0);
    expect(queued.indexOf(firstCase!.id)).toBeLessThan(queued.indexOf(secondCase.id));
    expect(console.waiting.find((row) => row.caseId === firstCase!.id)).toMatchObject({ topic: 'booking', waitingOnSupport: true, last: { from: 'member', body: 'Jordan never came on Saturday.' } });
    expect(console.canWork).toBe(true);
  });

  it('asking in words connects them, whatever the AI would have said', async () => {
    const result = await askSupportAssistant({ db, assistant, now: new Date() }, third, { chatId, question: 'I want to contact a live agent please', history: [] });
    expect(result).toMatchObject({ ok: true, turn: { answer: { handoff: 'live', sources: [] } } });
    const spanish = await askSupportAssistant({ db, assistant, now: new Date() }, third, { chatId, question: 'Quiero hablar con una persona real', history: [] });
    expect(spanish).toMatchObject({ ok: true, turn: { answer: { handoff: 'live' } } });
    const ordinary = await askSupportAssistant({ db, assistant, now: new Date() }, third, { chatId, question: 'When am I charged?', history: [] });
    expect(ordinary).toMatchObject({ ok: true, turn: { answer: { handoff: 'none' } } });

    // Connected with that question as the request: it shows once, for the member and for support.
    const asked = 'I want to contact a live agent please';
    expect(await handOffToSupport(db, third, { chatId, topic: 'other', details: asked, turns: result.ok ? [result.turn] : [] }, new Date())).toEqual({ ok: true, code: 'submitted' });
    const row = await caseOf(third);
    const page = await getSupportCasePage(db, third, row.id, new Date(), { markRead: false });
    expect(page?.events.map((event) => [event.from, event.body])).toEqual([['me', asked], ['assistant', expect.stringContaining('Connecting you')]]);
    const consoleView = await getAdminLivePage(db, agentA, new Date(), { selected: row.id, agentsOnline: 1 });
    expect(consoleView.selected?.events.filter((event) => event.body === asked)).toHaveLength(1);
    // A request in other words shows as the request, after the chat.
    const differs = await getAdminLivePage(db, agentA, new Date(), { selected: (await caseOf(first)).id, agentsOnline: 1 });
    expect(differs.selected?.events.filter((event) => event.kind === 'message').at(-1)?.body).toBe('Jordan never came on Saturday.');
  });

  it('someone from support joins: it is theirs, the member sees who, and both hear it', async () => {
    const row = await caseOf(first);
    const heard = await noticesDuring(row.id, async () => {
      expect(await joinLiveChat(db, agentA, row.id, new Date())).toEqual({ ok: true, code: 'updated' });
    });
    expect(heard.map((envelope) => [envelope.channel, envelope.notice.event])).toEqual(expect.arrayContaining([['staff:support', 'support.live_joined'], [`user:${first}`, 'support.live_joined']]));
    // Joining again is fine; someone else can't take it.
    expect(await joinLiveChat(db, agentA, row.id, new Date())).toEqual({ ok: true, code: 'updated' });
    expect(await joinLiveChat(db, agentB, row.id, new Date())).toEqual({ ok: false, code: 'not_allowed' });

    const help = await getHelpChat(db, first, new Date(), { assistant, markRead: false, agentsOnline: 1 });
    expect(help?.case?.live).toMatchObject({ state: 'joined', agentName: 'Avery' });
    const page = await getSupportCasePage(db, first, row.id, new Date(), { markRead: false });
    expect(page?.events.find((event) => event.kind === 'live')).toMatchObject({ live: 'joined', agentName: 'Avery' });
    expect((await caseOf(first)).assigneeUserId).toBe(agentA.id);

    const mine = await getAdminLivePage(db, agentA, new Date(), { selected: row.id, agentsOnline: 2 });
    expect(mine.mine.map((chat) => chat.caseId)).toContain(row.id);
    expect(mine.waiting.map((chat) => chat.caseId)).not.toContain(row.id);
    expect(mine.selected).toMatchObject({ state: 'joined', isMine: true, canJoin: false, canEnd: true, canReply: true });
    const theirs = await getAdminLivePage(db, agentB, new Date(), { selected: row.id, agentsOnline: 2 });
    expect(theirs.others.map((chat) => chat.caseId)).toContain(row.id);
    expect(theirs.selected).toMatchObject({ state: 'joined', isMine: false, canJoin: false, canEnd: false, canReply: false });
  });

  it('they write to each other as it happens, and see each other typing', async () => {
    const row = await caseOf(first);
    const replied = await noticesDuring(row.id, async () => {
      expect(await liveReply(db, agentA, row.id, { body: 'Hi, I paused the payment. Did Jordan message you?' }, new Date())).toEqual({ ok: true, code: 'sent' });
    });
    expect(replied.some((envelope) => envelope.channel === `user:${first}` && envelope.notice.event === 'support.replied')).toBe(true);
    expect(await liveReply(db, agentB, row.id, { body: 'Me too' }, new Date())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await replyToSupportCase(db, first, row.id, { body: 'No, nothing since Friday.' }, new Date(Date.now() + 1_000))).toMatchObject({ ok: true });

    const help = await getHelpChat(db, first, new Date(Date.now() + 2_000), { assistant, markRead: true, agentsOnline: 1 });
    expect(help?.case?.events.slice(-2).map((event) => [event.from, event.body])).toEqual([['support', 'Hi, I paused the payment. Did Jordan message you?'], ['me', 'No, nothing since Friday.']]);

    // Typing: the member to support on duty, the one on the chat to the member; nobody else's, never spammed.
    const at = new Date(Date.now() + 60_000);
    const typing = await noticesDuring(row.id, async () => {
      await typingInLiveChat(db, { userId: first, staff: false }, row.id, at);
      await typingInLiveChat(db, { userId: first, staff: false }, row.id, new Date(at.getTime() + 500));
      await typingInLiveChat(db, { userId: agentA.id, staff: true }, row.id, at);
      await typingInLiveChat(db, { userId: agentB.id, staff: true }, row.id, at);
      await typingInLiveChat(db, { userId: second, staff: false }, row.id, at);
    });
    expect(typing.map((envelope) => [envelope.channel, envelope.notice.type])).toEqual([['staff:support', 'typing'], [`user:${first}`, 'typing']]);
  });

  it('a reply from the case page joins a waiting chat, so the member is not left in line', async () => {
    const row = await caseOf(second);
    expect(row.liveAgentUserId).toBeNull();
    expect(await staffReply(db, agentB, row.id, { partyId: second, body: 'Hi, I can see two charges. Let me check.' }, new Date())).toEqual({ ok: true, code: 'sent' });
    expect(await caseOf(second)).toMatchObject({ liveAgentUserId: agentB.id });
    const help = await getHelpChat(db, second, new Date(), { assistant, markRead: false, agentsOnline: 1 });
    expect(help?.case?.live).toMatchObject({ state: 'joined', agentName: 'Blake' });
    // The join shows before the message.
    expect(help?.case?.events.slice(-2).map((event) => event.kind)).toEqual(['live', 'message']);
  });

  it('ends the chat (the one on it or a lead), the case goes on, and they can ask for another', async () => {
    const row = await caseOf(first);
    expect(await endLiveChat(db, agentB, row.id, new Date())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await endLiveChat(db, agentA, row.id, new Date())).toEqual({ ok: true, code: 'updated' });
    expect(await endLiveChat(db, agentA, row.id, new Date())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await joinLiveChat(db, agentB, row.id, new Date())).toEqual({ ok: false, code: 'expired' });

    const ended = await getHelpChat(db, first, new Date(), { assistant, markRead: false, agentsOnline: 1 });
    expect(ended?.case).toMatchObject({ canReply: true, canRequestLive: true, live: { state: 'ended' } });
    expect((await getSupportCasePage(db, first, row.id, new Date(), { markRead: false }))?.events.filter((event) => event.kind === 'live').map((event) => event.live)).toEqual(['joined', 'ended']);

    // Another live chat on the same case: back in line, nobody on it yet. Only the member who opened it may ask.
    expect(await requestLiveChat(db, second, row.id, new Date())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await requestLiveChat(db, first, row.id, new Date())).toEqual({ ok: true, code: 'updated' });
    expect(await requestLiveChat(db, first, row.id, new Date())).toEqual({ ok: true, code: 'updated' });
    expect(await caseOf(first)).toMatchObject({ liveAgentUserId: null, liveJoinedAt: null, liveEndedAt: null });
    const again = await getHelpChat(db, first, new Date(), { assistant, markRead: false, agentsOnline: 1 });
    expect(again?.case).toMatchObject({ canRequestLive: false, live: { state: 'waiting' } });

    // A lead ends someone else's chat; a waiting one can be ended by anyone who answers it.
    expect(await endLiveChat(db, lead, (await caseOf(second)).id, new Date())).toEqual({ ok: true, code: 'updated' });
    expect(await endLiveChat(db, agentB, row.id, new Date())).toEqual({ ok: true, code: 'updated' });
  });

  it('a case resolved while live reads as an ended chat, and leaves the queue', async () => {
    const row = await caseOf(first);
    expect(await requestLiveChat(db, first, row.id, new Date())).toEqual({ ok: true, code: 'updated' });
    await db.update(supportCases).set({ status: 'resolved', resolvedAt: new Date() }).where(eq(supportCases.id, row.id));
    const consoleView = await getAdminLivePage(db, agentA, new Date(), { selected: row.id, agentsOnline: 1 });
    expect(consoleView.waiting.map((chat) => chat.caseId)).not.toContain(row.id);
    expect(consoleView.selected).toMatchObject({ state: 'ended', canJoin: false, canEnd: false, canReply: false });
    expect(await requestLiveChat(db, first, row.id, new Date())).toEqual({ ok: false, code: 'not_allowed' });
  });

  it('roles that do not work cases read the console but cannot answer', async () => {
    const finance: StaffActor = { id: 'usr_casey', roles: ['finance'] };
    const page = await getAdminLivePage(db, finance, new Date(), { agentsOnline: 0 });
    expect(page.canWork).toBe(false);
    expect(await joinLiveChat(db, finance, (await caseOf(second)).id, new Date())).toMatchObject({ ok: false, code: 'not_allowed' });
  });
});

describe('@usernames', () => {
  it('gives one from the first name, numbered when taken, and keeps it', async () => {
    const name = await assignUsername(db, first);
    expect(name).toMatch(/^ruth_\d+$/);
    expect(await assignUsername(db, first)).toBe(name);
    const other = await assignUsername(db, second);
    expect(other).toMatch(/^ruth_\d+$/);
    expect(other).not.toBe(name);
    expect((await usernamesOf(db, [first, second, 'usr_nobody'])).size).toBe(2);
  });

  it('changes once in 30 days, refusing invalid, reserved and taken names', async () => {
    const now = new Date('2026-11-22T12:00:00.000Z');
    expect(await changeUsername(db, first, { username: 'ab' }, now)).toMatchObject({ ok: false, fieldErrors: { username: ['invalid'] } });
    expect(await changeUsername(db, first, { username: 'support' }, now)).toMatchObject({ ok: false, fieldErrors: { username: ['name_reserved'] } });
    expect(await changeUsername(db, first, { username: 'Ruth' }, now)).toMatchObject({ ok: false, fieldErrors: { username: ['in_use'] } });
    expect(await changeUsername(db, first, { username: '@Live_Ruth_One' }, now)).toEqual({ ok: true, code: 'updated' });
    expect(await changeUsername(db, first, { username: 'live_ruth_one' }, now)).toEqual({ ok: true, code: 'updated' });
    expect(await changeUsername(db, first, { username: 'live_ruth_two' }, new Date('2026-12-01T12:00:00.000Z'))).toEqual({ ok: false, code: 'rate_limited', retryAt: '2026-12-22T12:00:00.000Z' });
    expect(await changeUsername(db, first, { username: 'live_ruth_two' }, new Date('2026-12-22T12:00:00.000Z'))).toEqual({ ok: true, code: 'updated' });
    // Nobody can take it in another case.
    expect(await changeUsername(db, second, { username: 'LIVE_RUTH_TWO' }, now)).toMatchObject({ ok: false, fieldErrors: { username: ['in_use'] } });
  });

  it('finds people by username, with or without "@", and never a deleted account', async () => {
    expect(await findUserIdByUsername(db, '@Live_Ruth_Two')).toBe(first);
    expect(await findUserIdByUsername(db, 'live_ruth_two')).toBe(first);
    expect(await findUserIdByUsername(db, 'nobody_has_this')).toBeNull();
    expect(await findUserIdByUsername(db, 'not valid!')).toBeNull();
    await db.update(users).set({ status: 'deleted' }).where(eq(users.id, first));
    try {
      expect(await findUserIdByUsername(db, 'live_ruth_two')).toBeNull();
      expect((await usernamesOf(db, [first])).size).toBe(0);
      expect(await assignUsername(db, third)).toMatch(/^ruth_\d+$/);
    } finally {
      await db.update(users).set({ status: 'active' }).where(eq(users.id, first));
    }
  });
});
