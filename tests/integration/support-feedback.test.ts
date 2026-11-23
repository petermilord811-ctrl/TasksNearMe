import { and, eq, inArray, like, or } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EmailMessage } from '@/integrations/email';
import { createFakeSupportAssistant } from '@/integrations/ai/support-assistant';
import { getHelpChat, handOffToSupport } from '@/modules/assist/support-chat';
import { staffRoles, usernames, users } from '@/modules/accounts/schema';
import { supportAgentViewOf } from '@/modules/support/agents';
import { endLiveChat, getAdminLivePage, joinLiveChat, liveReply, liveStateOf } from '@/modules/support/live-chat';
import { caseRateable, rateSupportCase, supportRatingView } from '@/modules/support/ratings';
import { supportCaseEvents, supportCaseReads, supportCases } from '@/modules/support/schema';
import { getSupportCasePage, maskedEmailAddress } from '@/modules/support/service';
import { addCaseNote, getAdminCase, staffReply, type StaffActor } from '@/modules/support/staff';
import { emailSupportTranscript } from '@/modules/support/transcripts';
import { auditLog } from '@/platform/audit/schema';
import { createDb } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';
import { rateLimits } from '@/platform/rate-limit/schema';
import { throwawayClient } from '../support/people';

/**
 * Live support after the chat (2026-11-23, owner: "Live support: rate the chat afterwards, see the agent's name and
 * photo, and get a transcript by email"): the member who opened a case rates the help once its live chat ended (or it's
 * solved), once, changeable for a week, and staff see it; the person from support shows with their first name; and
 * the member emails themselves the conversation as they see it, 3 times a day. Its own members and staff, removed at
 * the end.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const assistant = createFakeSupportAssistant();
const agent: StaffActor = { id: 'usr_feedback_agent', roles: ['support_agent'] };
const members = ['usr_feedback_member_1', 'usr_feedback_member_2', 'usr_feedback_member_3'];
const chatId = 'ach_support_feedback_test_1';
const DAY = 86_400_000;
let [member, stranger, solved] = ['', '', ''];

async function liveCase(userId: string, details: string, at: Date) {
  expect(await handOffToSupport(db, userId, { chatId, topic: 'payment', details, turns: [] }, at)).toEqual({ ok: true, code: 'submitted' });
  const rows = await db.select().from(supportCases).where(eq(supportCases.openedByUserId, userId));
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]!;
}

const rowOf = async (caseId: string) => (await db.select().from(supportCases).where(eq(supportCases.id, caseId)))[0]!;

function mailer(options: { fail?: boolean } = {}) {
  const sent: EmailMessage[] = [];
  return {
    sent,
    mailer: {
      appUrl: 'https://tasksnearme.example',
      email: {
        name: 'test',
        async send(message: EmailMessage) {
          if (options.fail) throw new Error('provider down');
          sent.push(message);
        },
      },
    },
  };
}

beforeAll(async () => {
  [member, stranger, solved] = await Promise.all(members.map((id) => throwawayClient(db, id)));
  const [alex] = await db.select().from(users).where(eq(users.id, 'usr_alex'));
  await db.insert(users).values({ ...alex!, id: agent.id, email: `${agent.id}@example.test`, firstName: 'Quinn', lastName: 'Lastname', name: 'Quinn L.', avatarFileId: null }).onConflictDoNothing({ target: users.id });
  await db.insert(staffRoles).values({ userId: agent.id, role: 'support_agent', grantedBy: 'test' }).onConflictDoNothing();
});

afterAll(async () => {
  await db.delete(staffRoles).where(eq(staffRoles.userId, agent.id));
  const ids = (await db.select({ id: supportCases.id }).from(supportCases).where(inArray(supportCases.openedByUserId, members))).map((row) => row.id);
  if (ids.length) {
    await db.delete(supportCaseEvents).where(inArray(supportCaseEvents.caseId, ids));
    await db.delete(supportCaseReads).where(inArray(supportCaseReads.caseId, ids));
    await db.delete(outboxEvents).where(inArray(outboxEvents.aggregateId, ids));
    await db.delete(auditLog).where(inArray(auditLog.targetId, ids));
    await db.delete(supportCases).where(inArray(supportCases.id, ids));
  }
  await db.delete(rateLimits).where(or(...[...members, agent.id].map((id) => like(rateLimits.key, `%:${id}`))));
  await db.delete(usernames).where(inArray(usernames.userId, [...members, agent.id]));
  await db.delete(users).where(inArray(users.id, [agent.id]));
  await pool.end();
});

describe('who from support is on the chat', () => {
  it('shows their first name, and their photo or initial, never a last name', () => {
    expect(supportAgentViewOf({ firstName: 'Quinn', avatarFileId: null })).toEqual({ name: 'Quinn', initials: 'Q' });
    expect(supportAgentViewOf({ firstName: ' álex ', avatarFileId: 'fil_1' })).toEqual({ name: 'álex', initials: 'Á', photo: expect.objectContaining({ id: 'fil_1', src: '/api/files/fil_1?w=256', alt: 'álex' }) });
    expect(supportAgentViewOf({ firstName: '', avatarFileId: 'fil_1' })).toBeUndefined();
  });

  it('names the person who joined, on the live state, the joined line and their messages; other replies stay "Support"', async () => {
    const now = new Date(Date.now() - 60_000);
    const row = await liveCase(member, 'I was charged twice for the desk.', now);
    // Someone from support writes before anyone joins: that reply stays "Support".
    expect(await staffReply(db, agent, row.id, { partyId: member, body: 'Looking now.' }, new Date(now.getTime() + 1_000))).toMatchObject({ ok: true });
    expect(await joinLiveChat(db, agent, row.id, new Date(now.getTime() + 2_000))).toEqual({ ok: true, code: 'updated' });
    expect(await liveReply(db, agent, row.id, { body: "Hi, I'm Quinn." }, new Date(now.getTime() + 3_000))).toMatchObject({ ok: true });

    const live = await liveStateOf(db, await rowOf(row.id), 1);
    expect(live).toMatchObject({ state: 'joined', agentName: 'Quinn', agent: { name: 'Quinn', initials: 'Q' } });
    expect(JSON.stringify(live)).not.toContain('Lastname');

    const page = await getSupportCasePage(db, member, row.id, new Date(), { markRead: false });
    const joined = page!.events.find((event) => event.kind === 'live');
    expect(joined).toMatchObject({ live: 'joined', agentName: 'Quinn', agent: { name: 'Quinn', initials: 'Q' } });
    const replies = page!.events.filter((event) => event.from === 'support');
    // "Looking now." came before the join, from the same person: it's named too (they joined this case's live chat).
    expect(replies.map((event) => [event.body, event.agent?.name])).toEqual([['Looking now.', 'Quinn'], ["Hi, I'm Quinn.", 'Quinn']]);
    expect(JSON.stringify(page)).not.toContain('Lastname');
  });
});

describe('rating the help', () => {
  it('is for the person who opened the case, once the live chat ended, never shown as a message, and staff see it', async () => {
    const start = new Date(Date.now() - 50_000);
    const row = await liveCase(stranger, 'My payout is late.', start);
    await joinLiveChat(db, agent, row.id, new Date(start.getTime() + 1_000));

    // Nothing to rate while the chat is on.
    expect(caseRateable(await rowOf(row.id))).toBe(false);
    expect(await rateSupportCase(db, stranger, row.id, { rating: 'good' }, new Date())).toEqual({ ok: false, code: 'not_allowed' });
    expect((await getSupportCasePage(db, stranger, row.id, new Date(), { markRead: false }))!.rating).toBeUndefined();

    expect(await endLiveChat(db, agent, row.id, new Date(start.getTime() + 5_000))).toEqual({ ok: true, code: 'updated' });
    const ratedAt = new Date(start.getTime() + 10_000);
    expect((await getSupportCasePage(db, stranger, row.id, ratedAt, { markRead: false }))!.rating).toEqual({ canRate: true });

    // Someone else can't; a long comment can't.
    expect(await rateSupportCase(db, member, row.id, { rating: 'good' }, ratedAt)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await rateSupportCase(db, stranger, row.id, { rating: 'good', comment: 'x'.repeat(501) }, ratedAt)).toMatchObject({ ok: false, code: 'validation_failed', fieldErrors: { comment: ['too_long'] } });
    expect(await rateSupportCase(db, stranger, row.id, { rating: 'meh' as 'good' }, ratedAt)).toMatchObject({ ok: false, code: 'validation_failed' });

    expect(await rateSupportCase(db, stranger, row.id, { rating: 'good', comment: '  Quick and kind.  ' }, ratedAt)).toEqual({ ok: true, code: 'saved' });
    const [event] = await db.select().from(supportCaseEvents).where(and(eq(supportCaseEvents.caseId, row.id), eq(supportCaseEvents.kind, 'rating')));
    expect(event).toMatchObject({ authorUserId: stranger, partyUserId: stranger, visibility: 'internal', body: 'Quick and kind.', meta: { rating: 'good' } });

    // The member sees their rating, never as a message in the conversation.
    const page = await getSupportCasePage(db, stranger, row.id, ratedAt, { markRead: false });
    expect(page!.rating).toEqual({ given: { rating: 'good', comment: 'Quick and kind.', at: ratedAt.toISOString() }, canRate: true, changeUntil: new Date(ratedAt.getTime() + 7 * DAY).toISOString() });
    expect(page!.events.some((item) => item.body?.includes('Quick and kind'))).toBe(false);

    // Changed within the week: one rating, the new one, and when it changed.
    const changedAt = new Date(ratedAt.getTime() + 2 * DAY);
    expect(await rateSupportCase(db, stranger, row.id, { rating: 'bad', comment: 'It came back the next day.' }, changedAt)).toEqual({ ok: true, code: 'saved' });
    const ratings = await db.select().from(supportCaseEvents).where(and(eq(supportCaseEvents.caseId, row.id), eq(supportCaseEvents.kind, 'rating')));
    expect(ratings).toHaveLength(1);
    expect(ratings[0]).toMatchObject({ body: 'It came back the next day.', meta: { rating: 'bad', changedAt: changedAt.toISOString() }, createdAt: ratedAt });

    // Staff: on the case and on the live chat console.
    const admin = await getAdminCase(db, agent, row.id, changedAt);
    expect(admin?.data.events.find((item) => item.kind === 'rating')).toMatchObject({ rating: 'bad', body: 'It came back the next day.', changedAt: changedAt.toISOString(), actor: { kind: 'member' } });
    const console = await getAdminLivePage(db, agent, changedAt, { selected: row.id, agentsOnline: 1 });
    expect(console.selected?.events.some((item) => item.kind === 'rating' && item.rating === 'bad')).toBe(true);

    // After the week, it stays.
    expect(await rateSupportCase(db, stranger, row.id, { rating: 'good' }, new Date(ratedAt.getTime() + 7 * DAY))).toEqual({ ok: false, code: 'expired' });
    expect((await getSupportCasePage(db, stranger, row.id, new Date(ratedAt.getTime() + 8 * DAY), { markRead: false }))!.rating).toMatchObject({ given: { rating: 'bad' }, canRate: false });
  });

  it('asks about a case solved in the last week from the Help conversation, and shows live chat hours', async () => {
    const row = await liveCase(solved, 'Can you close my request?', new Date(Date.now() - 40_000));
    await db.update(supportCases).set({ status: 'resolved', resolvedAt: new Date(), liveEndedAt: new Date() }).where(eq(supportCases.id, row.id));
    const help = await getHelpChat(db, solved, new Date(), { assistant, markRead: false, agentsOnline: 0 });
    expect(help?.recent).toMatchObject({ id: row.id, status: 'resolved', rating: { canRate: true } });
    expect(help?.liveHours).toMatchObject({ timeZone: 'America/New_York', schedule: [{ fromDay: 1, toDay: 5, opens: '09:00', closes: '18:00' }, { fromDay: 6, toDay: 6, opens: '10:00', closes: '14:00' }] });
    expect(typeof help?.liveHours.open).toBe('boolean');
  });

  it('decides what the member sees from the facts alone', () => {
    const now = new Date('2026-11-23T12:00:00.000Z');
    expect(supportRatingView({ isOpener: false, rateable: true, now })).toBeUndefined();
    expect(supportRatingView({ isOpener: true, rateable: false, now })).toBeUndefined();
    expect(supportRatingView({ isOpener: true, rateable: true, now })).toEqual({ canRate: true });
    const given = { meta: { rating: 'bad' as const }, body: null, createdAt: new Date('2026-11-16T12:00:00.000Z') };
    expect(supportRatingView({ isOpener: true, rateable: false, given, now })).toEqual({ given: { rating: 'bad', at: '2026-11-16T12:00:00.000Z' }, canRate: false, changeUntil: '2026-11-23T12:00:00.000Z' });
    expect(caseRateable({ status: 'resolved', liveEndedAt: null })).toBe(true);
    expect(caseRateable({ status: 'awaiting_support', liveEndedAt: null })).toBe(false);
  });
});

describe('a copy of the conversation by email', () => {
  it('sends what the member sees to their own address, at most 3 times a day, and says when the email fails', async () => {
    const row = await liveCase(member, 'Please send me this chat.', new Date(Date.now() - 30_000));
    await joinLiveChat(db, agent, row.id, new Date(Date.now() - 20_000));
    await liveReply(db, agent, row.id, { body: 'Here to help.' }, new Date(Date.now() - 10_000));
    expect(await addCaseNote(db, agent, row.id, { body: 'Internal: check the refund first.' }, new Date(Date.now() - 5_000))).toMatchObject({ ok: true });

    const page = await getSupportCasePage(db, member, row.id, new Date(), { markRead: false });
    expect(page!.transcript).toEqual({ to: maskedEmailAddress(`${member}@example.test`) });
    expect(maskedEmailAddress('maya.r@gmail.com')).toBe('m•••@gmail.com');

    const { sent, mailer: ok } = mailer();
    const now = new Date();
    expect(await emailSupportTranscript(db, ok, member, row.id, now)).toEqual({ ok: true, code: 'sent' });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: `${member}@example.test`, tag: 'support-transcript' });
    expect(sent[0]!.subject).toContain('a payment');
    expect(sent[0]!.text).toContain('Please send me this chat.');
    expect(sent[0]!.text).toContain('Quinn from support');
    expect(sent[0]!.text).toContain('Here to help.');
    expect(sent[0]!.text).not.toContain('Internal: check the refund first.');
    expect(sent[0]!.html).toContain(`https://tasksnearme.example/app/support/${row.id}`);

    // Three a day per case for each person.
    expect(await emailSupportTranscript(db, ok, member, row.id, now)).toMatchObject({ ok: true });
    expect(await emailSupportTranscript(db, ok, member, row.id, now)).toMatchObject({ ok: true });
    expect(await emailSupportTranscript(db, ok, member, row.id, now)).toMatchObject({ ok: false, code: 'rate_limited', retryAt: expect.any(String) });
    expect(sent).toHaveLength(3);

    // Not their case; a provider that fails.
    expect(await emailSupportTranscript(db, ok, stranger, row.id, now)).toEqual({ ok: false, code: 'not_allowed' });
    const strangerCase = await liveCase(stranger, 'Another question.', new Date(Date.now() - 1_000));
    expect(await emailSupportTranscript(db, mailer({ fail: true }).mailer, stranger, strangerCase.id, now)).toEqual({ ok: false, code: 'unavailable' });
  });
});
