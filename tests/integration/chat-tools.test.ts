import { and, eq, inArray, like, or } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { staffRoles, usernames, users } from '@/modules/accounts/schema';
import { invites } from '@/modules/invites/schema';
import { suggestReplies, translateMessage } from '@/modules/messaging/assist';
import { cardsFor } from '@/modules/messaging/cards';
import { getNewDirectMessagePage, postInDirectThread, startDirectChat } from '@/modules/messaging/direct';
import { acceptMessageRequest, searchConversation, setConversationFlag } from '@/modules/messaging/folders';
import { noteSampleRecipient } from '@/modules/messaging/samples';
import { messages, threadParticipants, threads } from '@/modules/messaging/schema';
import { getInbox, getThreadPage, sendMessage, unreadMessageCount } from '@/modules/messaging/service';
import { planNotifications } from '@/modules/notifications/service';
import { tasks } from '@/modules/tasks/schema';
import { outboxEvents } from '@/platform/outbox/schema';
import { rateLimits } from '@/platform/rate-limit/schema';
import { createDb } from '@/platform/db/connect';
import type { Translator } from '@/integrations/ai/translator';
import type { ReplySuggester } from '@/integrations/ai/reply-suggester';

/**
 * The chat, 2026-11-23 (owner: "plan all and implement"): message requests, pin, mute and archive, a conversation's
 * search, people named by @username, a sample profile's note, staff without a daily limit, Translate and Suggest
 * replies, and task request cards. Its own people (usr_tmp_ct_*), cleaned up after.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const ANA = 'usr_tmp_ct_ana';
const BEN = 'usr_tmp_ct_ben';
const CAL = 'usr_tmp_ct_cal';
const STAFF = 'usr_tmp_ct_staff';
const DEE = 'usr_tmp_ct_dee';
const PEOPLE = [ANA, BEN, CAL, STAFF, DEE];
const now = new Date();
let key = 0;
const requestKey = () => `00000000-0000-4000-8000-${String(++key).padStart(12, '0')}`;
const later = (ms: number) => new Date(now.getTime() + ms);

async function threadOf(a: string, b: string): Promise<string> {
  const started = await startDirectChat(db, a, { to: b, body: `Hello from ${a}`, requestKey: requestKey() }, now);
  expect(started).toMatchObject({ ok: true, code: 'sent' });
  const id = started.ok && started.redirectTo ? started.redirectTo.split('/').pop()! : '';
  expect(id).toMatch(/^thr_/);
  return id;
}

beforeAll(async () => {
  const [maya] = await db.select().from(users).where(eq(users.id, 'usr_maya'));
  await db.insert(users).values([
    { ...maya!, id: ANA, email: 'tmp-ct-ana@example.test', name: 'Ana A.', firstName: 'Ana', lastName: 'Avila', phone: '+15125550781', directMessages: 'everyone', locale: 'es' },
    { ...maya!, id: BEN, email: 'tmp-ct-ben@example.test', name: 'Ben B.', firstName: 'Ben', lastName: 'Brook', phone: '+15125550782', directMessages: 'everyone', locale: 'en' },
    { ...maya!, id: CAL, email: 'tmp-ct-cal@example.test', name: 'Cal C.', firstName: 'Cal', lastName: 'Cruz', phone: '+15125550783', directMessages: 'everyone', locale: 'en' },
    { ...maya!, id: STAFF, email: 'tmp-ct-staff@example.test', name: 'Sky S.', firstName: 'Sky', lastName: 'Stone', phone: '+15125550784', directMessages: 'everyone', locale: 'en' },
    { ...maya!, id: DEE, email: 'tmp-ct-dee@example.test', name: 'Dee D.', firstName: 'Dee', lastName: 'Dunn', phone: '+15125550785', directMessages: 'everyone', locale: 'en' },
  ]);
  await db.insert(usernames).values([
    { userId: ANA, username: 'tmpct_ana' },
    { userId: BEN, username: 'tmpct_ben' },
    { userId: CAL, username: 'tmpct_cal' },
  ]);
});

afterAll(async () => {
  const mine = await db.select({ id: threads.id }).from(threads).where(or(inArray(threads.startedByUserId, PEOPLE), like(threads.linkedId, '%usr_tmp_ct_%')));
  const ids = mine.map((row) => row.id);
  if (ids.length) {
    await db.delete(outboxEvents).where(inArray(outboxEvents.aggregateId, ids));
    await db.delete(messages).where(inArray(messages.threadId, ids));
    await db.delete(threadParticipants).where(inArray(threadParticipants.threadId, ids));
    await db.delete(threads).where(inArray(threads.id, ids));
  }
  await db.delete(invites).where(or(inArray(invites.posterUserId, PEOPLE), inArray(invites.helperUserId, PEOPLE)));
  await db.delete(rateLimits).where(or(...PEOPLE.map((id) => like(rateLimits.key, `%${id}%`))));
  await db.delete(staffRoles).where(inArray(staffRoles.userId, PEOPLE));
  await db.delete(usernames).where(inArray(usernames.userId, PEOPLE));
  await db.delete(users).where(inArray(users.id, PEOPLE));
  await pool.end();
});

describe('message requests', () => {
  it('a stranger’s first message waits under Requests, out of the badge, until it’s accepted or answered', async () => {
    const id = await threadOf(ANA, BEN);
    const ben = (await getInbox(db, BEN, now)).threads.find((thread) => thread.id === id);
    expect(ben).toMatchObject({ request: true, unreadCount: 1 });
    // The one who wrote it doesn't see a request.
    expect((await getInbox(db, ANA, now)).threads.find((thread) => thread.id === id)?.request).toBeUndefined();
    const before = await unreadMessageCount(db, BEN);
    expect(await acceptMessageRequest(db, BEN, id, now)).toEqual({ ok: true, code: 'updated' });
    expect((await getInbox(db, BEN, now)).threads.find((thread) => thread.id === id)?.request).toBeUndefined();
    expect(await unreadMessageCount(db, BEN)).toBe(before + 1);
    // Someone else's conversation: nothing to accept.
    expect(await acceptMessageRequest(db, CAL, id, now)).toEqual({ ok: false, code: 'not_found' });
  });

  it('answering accepts it, and an ignored request stays archived when more messages come', async () => {
    const answered = await threadOf(CAL, ANA);
    expect((await sendMessage(db, ANA, answered, { body: 'Hi Cal!', attachmentIds: [] }, later(1000))).ok).toBe(true);
    expect((await getInbox(db, ANA, later(2000))).threads.find((thread) => thread.id === answered)?.request).toBeUndefined();

    const ignored = await threadOf(CAL, BEN);
    expect(await setConversationFlag(db, BEN, ignored, { flag: 'archived', on: true }, now)).toEqual({ ok: true, code: 'updated' });
    expect((await sendMessage(db, CAL, ignored, { body: 'Are you there?', attachmentIds: [] }, later(1000))).ok).toBe(true);
    expect((await getInbox(db, BEN, later(2000))).threads.find((thread) => thread.id === ignored)).toMatchObject({ archived: true, request: true });
  });
});

describe('pin, mute and archive', () => {
  it('pins up to three, mutes out of the badge and the notifications, and brings an archived one back on a new message', async () => {
    const [ab] = (await db.select({ id: threads.id }).from(threads).where(and(eq(threads.kind, 'direct'), eq(threads.startedByUserId, ANA)))).map((row) => row.id);
    expect(ab).toBeDefined();
    // Ben accepted Ana's earlier: pinned, then on top.
    expect(await setConversationFlag(db, BEN, ab!, { flag: 'pinned', on: true }, now)).toEqual({ ok: true, code: 'updated' });
    expect((await getInbox(db, BEN, now)).threads[0]).toMatchObject({ id: ab, pinned: true });

    // A fourth pin is refused: Ben has Ana's, Sky's and Cal's on top.
    const ignored = (await db.select({ id: threads.id }).from(threads).where(and(eq(threads.kind, 'direct'), eq(threads.startedByUserId, CAL), like(threads.linkedId, `%${BEN}%`))))[0]!.id;
    const extra = [await threadOf(STAFF, BEN), ignored];
    for (const id of extra) expect(await setConversationFlag(db, BEN, id, { flag: 'pinned', on: true }, now)).toEqual({ ok: true, code: 'updated' });
    const fourth = await threadOf(DEE, BEN);
    expect(await setConversationFlag(db, BEN, fourth, { flag: 'pinned', on: true }, now)).toEqual({ ok: false, code: 'limit_reached' });
    for (const id of extra) await setConversationFlag(db, BEN, id, { flag: 'pinned', on: false }, now);

    // Muted: no notification, and the badge leaves it out.
    expect(await setConversationFlag(db, BEN, ab!, { flag: 'muted', on: true }, now)).toEqual({ ok: true, code: 'updated' });
    const badge = await unreadMessageCount(db, BEN);
    expect((await sendMessage(db, ANA, ab!, { body: 'One more thing', attachmentIds: [] }, later(3000))).ok).toBe(true);
    expect(await unreadMessageCount(db, BEN)).toBe(badge);
    const planned = await planNotifications(db, { id: 'evt_tmp_ct', type: 'message.sent', aggregateType: 'thread', aggregateId: ab!, payload: { threadId: ab, taskId: null, senderUserId: ANA, recipientIds: [BEN] }, createdAt: now, dispatchedAt: null, claimedAt: null, attempts: 0 } as never);
    expect(planned.filter((item) => item.userId === BEN)).toEqual([]);
    await setConversationFlag(db, BEN, ab!, { flag: 'muted', on: false }, now);

    // Archived, then Ana writes: it's back in Ben's list (and off the top, archiving unpinned it).
    await setConversationFlag(db, BEN, ab!, { flag: 'archived', on: true }, now);
    expect((await getInbox(db, BEN, now)).threads.find((thread) => thread.id === ab)).toMatchObject({ archived: true });
    await sendMessage(db, ANA, ab!, { body: 'Back again', attachmentIds: [] }, later(4000));
    const back = (await getInbox(db, BEN, later(5000))).threads.find((thread) => thread.id === ab);
    expect(back?.archived).toBeUndefined();
    expect(back?.pinned).toBeUndefined();
  });
});

describe('a conversation’s search and people by @username', () => {
  it('finds words as the reader sees them: a hidden number can’t be found, a person by @username is found by name', async () => {
    const id = await threadOf(CAL, STAFF);
    await sendMessage(db, CAL, id, { body: 'Call me at 512-555-0199, or ask @tmpct_ana about the desk', attachmentIds: [] }, later(1000));
    // The reader before a paid booking: the number is hidden, so typing it finds nothing.
    expect((await searchConversation(db, STAFF, id, '555-0199', later(2000)))?.hits).toEqual([]);
    const byName = await searchConversation(db, STAFF, id, 'ana a', later(2000));
    expect(byName?.hits).toHaveLength(1);
    expect(byName?.hits[0]?.segments).toContainEqual({ kind: 'mention', userId: ANA, name: 'Ana A.' });
    // The writer sees their own words.
    expect((await searchConversation(db, CAL, id, '555-0199', later(2000)))?.hits).toHaveLength(1);
    // Not theirs: nothing.
    expect(await searchConversation(db, BEN, id, 'desk', later(2000))).toBeNull();

    // In the conversation: @tmpct_ana is Ana, an unknown @name stays hidden.
    await sendMessage(db, CAL, id, { body: 'Or pay @nobody_here_xyz', attachmentIds: [] }, later(3000));
    const page = await getThreadPage(db, STAFF, id, later(4000));
    const segments = page!.messages.filter((message) => message.kind === 'text').flatMap((message) => message.segments);
    expect(segments).toContainEqual({ kind: 'mention', userId: ANA, name: 'Ana A.' });
    expect(segments).toContainEqual({ kind: 'masked', detail: 'handle' });
  });
});

describe('sample profiles, staff, and help from the models', () => {
  it('writes the app’s note once when someone writes to a sample profile, only where samples are told apart', async () => {
    const id = await threadOf(DEE, CAL);
    // The rule reads the recipient's id: a seed person's fixed id (usr_minh) is a sample; Cal's test id is one too, so the
    // writer must be a real (generated) id: none of these people are, so the note never comes for them here.
    expect(await noteSampleRecipient(db, id, DEE, ['usr_minh'], now, true)).toBe(false);
    // A generated id writing to a sample: the note, once.
    const real = 'usr_0123456789abcdef0123456789abcdef';
    expect(await noteSampleRecipient(db, id, real, ['usr_minh'], now, true)).toBe(true);
    expect(await noteSampleRecipient(db, id, real, ['usr_minh'], later(1000), true)).toBe(false);
    // Where samples aren't told apart (development, e2e): never.
    expect(await noteSampleRecipient(db, id, real, ['usr_minh'], now, false)).toBe(false);
    const notes = await db.select({ id: messages.id }).from(messages).where(and(eq(messages.threadId, id), eq(messages.kind, 'system')));
    expect(notes).toHaveLength(1);
  });

  it('a staff account has no daily limit to show', async () => {
    await db.insert(staffRoles).values({ userId: STAFF, role: 'support_agent' });
    const page = await getNewDirectMessagePage(db, STAFF, { userId: ANA }, now);
    expect(page?.kind === 'page' && page.data.allowance).toMatchObject({ staff: true, perDay: 500 });
  });

  it('translates and suggests from the conversation as the reader sees it, and only when the other person wrote last', async () => {
    const id = await threadOf(CAL, ANA);
    // Later than anything before in this conversation, so it's the last word.
    await sendMessage(db, CAL, id, { body: 'Can you come Saturday? My number is 512-555-0142', attachmentIds: [] }, later(60_000));
    const asked: string[] = [];
    const translator: Translator = { name: 'test', translate: async (input) => { asked.push(`${input.to}:${input.body}`); return { body: `[${input.to}] ${input.body}` }; } };
    const [last] = await db.select({ id: messages.id }).from(messages).where(and(eq(messages.threadId, id), eq(messages.kind, 'text'), like(messages.body, '%Saturday%')));
    const translated = await translateMessage(db, ANA, id, last!.id, later(61_000), translator);
    // Ana reads Spanish; the number never reached the model.
    expect(translated?.text).toMatch(/^\[es\] Can you come Saturday\? My number is \[hidden\]/);
    expect(asked.join(' ')).not.toContain('0142');
    expect(await translateMessage(db, BEN, id, last!.id, later(61_000), translator)).toBeNull();

    const lines: string[] = [];
    const suggester: ReplySuggester = { name: 'test', suggest: async (input) => { lines.push(...input.lines.map((line) => `${line.from}:${line.text}`)); return ['Sí, el sábado me va bien.']; } };
    expect(await suggestReplies(db, ANA, id, later(61_000), suggester)).toEqual({ replies: ['Sí, el sábado me va bien.'] });
    expect(lines.join(' ')).not.toContain('0142');
    // Cal wrote last: nothing for him to answer.
    expect(await suggestReplies(db, CAL, id, later(61_000), suggester)).toBeNull();
  });
});

describe('task request cards', () => {
  it('shows a request between two people who talk directly as a card, for each of them', async () => {
    const id = await threadOf(ANA, CAL);
    const [task] = await db.select({ id: tasks.id }).from(tasks).limit(1);
    const inviteId = 'inv_tmp_ct_1';
    await db.insert(invites).values({
      id: inviteId,
      taskId: task!.id,
      posterUserId: ANA,
      helperUserId: CAL,
      status: 'sent',
      pricingType: 'fixed',
      priceCents: 6000,
      startAt: later(3 * 86_400_000),
      breakdown: { lines: [], totalCents: 6000 } as never,
      expiresAt: later(86_400_000),
      createdAt: now,
      updatedAt: now,
    });
    expect(await postInDirectThread(db, ANA, CAL, { type: 'invite_sent', params: { inviteId } }, later(1000), ANA)).toBe(id);
    const rows = await db.select({ kind: messages.kind, event: messages.event }).from(messages).where(eq(messages.threadId, id));
    const forHelper = await cardsFor(db, CAL, rows, later(2000));
    expect(forHelper?.requests?.[inviteId]).toMatchObject({ viewerRole: 'helper', status: 'sent', actions: ['accept', 'decline'], pricing: { type: 'fixed', priceCents: 6000 }, href: `/app/offers?invite=${inviteId}` });
    const forClient = await cardsFor(db, ANA, rows, later(2000));
    expect(forClient?.requests?.[inviteId]).toMatchObject({ viewerRole: 'poster', actions: ['cancel'] });
    // Past its time it reads as expired, with nothing to do.
    expect((await cardsFor(db, CAL, rows, later(2 * 86_400_000)))?.requests?.[inviteId]).toMatchObject({ status: 'expired', actions: [] });
    // Someone else sees no card.
    expect(await cardsFor(db, BEN, rows, later(2000))).toBeUndefined();
    // No direct conversation between them: nothing is posted.
    expect(await postInDirectThread(db, DEE, ANA, { type: 'invite_sent', params: { inviteId } }, now, DEE)).toBeNull();
  });
});
