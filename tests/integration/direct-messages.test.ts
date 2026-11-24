import { and, eq, inArray, like, or } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { usernames, users } from '@/modules/accounts/schema';
import { directThreadBetween, getNewDirectMessagePage, saveDirectMessageSetting, searchPeople, startDirectChat } from '@/modules/messaging/direct';
import { messages, threadParticipants, threads, blocks } from '@/modules/messaging/schema';
import { getInbox, getThreadPage, sendMessage } from '@/modules/messaging/service';
import { helperProfiles } from '@/modules/profiles/schema';
import { outboxEvents } from '@/platform/outbox/schema';
import { createDb } from '@/platform/db/connect';

/** Direct conversations (owner, 2026-11-21): starting one, its rules, and how it reads in the inbox and the thread. */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const CLIENT = 'usr_tmp_dm_client';
const HELPER = 'usr_tmp_dm_helper';
const OTHER = 'usr_tmp_dm_other';
const PEOPLE = [CLIENT, HELPER, OTHER];
const HANDLE = 'tmp-dm-helper';
const now = new Date();
let key = 0;
const requestKey = () => `00000000-0000-4000-8000-${String(++key).padStart(12, '0')}`;

beforeAll(async () => {
  const [maya] = await db.select().from(users).where(eq(users.id, 'usr_maya'));
  const [jordan] = await db.select().from(users).where(eq(users.id, 'usr_jordan'));
  const [profile] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, 'usr_jordan'));
  await db.insert(users).values([
    { ...maya!, id: CLIENT, email: 'tmp-dm-client@example.test', name: 'Dee M.', firstName: 'Dee', lastName: 'Moss', phone: '+15125550941', directMessages: 'everyone' },
    { ...jordan!, id: HELPER, email: 'tmp-dm-helper@example.test', name: 'Hank D.', firstName: 'Hank', lastName: 'Dale', phone: '+15125550942', directMessages: 'everyone' },
    { ...maya!, id: OTHER, email: 'tmp-dm-other@example.test', name: 'Ola O.', firstName: 'Ola', lastName: 'Ortiz', phone: '+15125550943', directMessages: 'everyone' },
  ]);
  await db.insert(helperProfiles).values({ ...profile!, userId: HELPER, handle: HANDLE, status: 'active', foundingNumber: null, completedCount: 0 });
});

afterAll(async () => {
  const mine = await db.select({ id: threads.id }).from(threads).where(or(inArray(threads.startedByUserId, PEOPLE), like(threads.linkedId, '%usr_tmp_dm_%')));
  const ids = mine.map((row) => row.id);
  if (ids.length) {
    await db.delete(outboxEvents).where(inArray(outboxEvents.aggregateId, ids));
    await db.delete(messages).where(inArray(messages.threadId, ids));
    await db.delete(threadParticipants).where(inArray(threadParticipants.threadId, ids));
    await db.delete(threads).where(inArray(threads.id, ids));
  }
  await db.delete(blocks).where(or(inArray(blocks.blockerId, PEOPLE), inArray(blocks.blockedId, PEOPLE)));
  await db.delete(helperProfiles).where(eq(helperProfiles.userId, HELPER));
  await db.delete(users).where(inArray(users.id, PEOPLE));
  await pool.end();
});

describe('direct conversations', () => {
  it('opens the page for a helper by handle, with the day’s allowance, masking and a task request', async () => {
    const found = await getNewDirectMessagePage(db, CLIENT, { helper: HANDLE }, now);
    expect(found?.kind).toBe('page');
    if (found?.kind !== 'page') return;
    expect(found.data).toMatchObject({ recipient: { id: HELPER, displayName: 'Hank D.' }, helperHandle: HANDLE, canRequest: true, allowance: { left: 3, perDay: 3 }, firstMessagesMax: 3, contactMasking: true });
    expect(found.data.refusal).toBeUndefined();
    expect(await getNewDirectMessagePage(db, CLIENT, { helper: 'nobody-by-this-handle' }, now)).toBeNull();
    // Yourself: the page says so.
    const self = await getNewDirectMessagePage(db, CLIENT, { userId: CLIENT }, now);
    expect(self?.kind === 'page' && self.data.refusal).toBe('self');
  });

  it('starts with the first message, lists it in both inboxes, and masks contact details for the reader', async () => {
    // A phone number, a payment username and a link: all hidden from the reader before a paid booking (J-AB1, J-AB2).
    const started = await startDirectChat(db, CLIENT, { to: HELPER, body: 'Hi Hank! Call me at 512-555-0199 or Venmo @dee-m. Photos: https://bit.ly/3xYz', requestKey: requestKey() }, now);
    expect(started).toMatchObject({ ok: true, code: 'sent', redirectTo: expect.stringMatching(/^\/app\/messages\/thr_/) });
    const threadId = started.ok ? started.redirectTo!.split('/').pop()! : '';
    const [row] = await db.select().from(threads).where(eq(threads.id, threadId));
    expect(row).toMatchObject({ kind: 'direct', taskId: null, startedByUserId: CLIENT });
    const [event] = await db.select().from(outboxEvents).where(and(eq(outboxEvents.aggregateId, threadId), eq(outboxEvents.type, 'message.sent')));
    expect(event?.payload).toMatchObject({ threadId, taskId: null, senderUserId: CLIENT, recipientIds: [HELPER] });

    const helperInbox = await getInbox(db, HELPER, now);
    const listed = helperInbox.threads.find((thread) => thread.id === threadId);
    expect(listed).toMatchObject({ kind: 'direct', title: 'Dee M.', subject: { kind: 'person', canRequest: false }, unreadCount: 1, contactMasking: true });
    expect(listed?.lastMessage?.preview.filter((segment) => segment.kind === 'masked')).toHaveLength(3);
    const page = await getThreadPage(db, HELPER, threadId, now);
    expect((page?.messages[0]?.segments ?? []).flatMap((segment) => (segment.kind === 'masked' ? [segment.detail] : [])).sort()).toEqual(['handle', 'link', 'phone']);
    // The starter's own view: their words as written, the helper's profile, and two more messages until a reply.
    const mine = await getThreadPage(db, CLIENT, threadId, now);
    expect(mine?.thread.subject).toEqual({ kind: 'person', helperHandle: HANDLE, canRequest: true });
    expect(mine?.messages[0]?.segments.every((segment) => segment.kind === 'text')).toBe(true);
    expect(mine?.composer).toMatchObject({ canSend: true, firstMessagesLeft: 2 });
    // The page now goes straight to it.
    expect(await getNewDirectMessagePage(db, CLIENT, { helper: HANDLE }, now)).toEqual({ kind: 'thread', threadId });
  });

  it('allows three messages before an answer, then any number once they reply', async () => {
    const found = await getNewDirectMessagePage(db, CLIENT, { helper: HANDLE }, now);
    const threadId = found?.kind === 'thread' ? found.threadId : '';
    // A second start goes into the same conversation (the second of the three).
    expect(await startDirectChat(db, CLIENT, { to: HELPER, body: 'It’s a standing desk.', requestKey: requestKey() }, now)).toMatchObject({ ok: true, redirectTo: `/app/messages/${threadId}` });
    expect(await sendMessage(db, CLIENT, threadId, { body: 'Saturday works best.', attachmentIds: [] }, now)).toEqual({ ok: true, code: 'sent' });
    expect(await sendMessage(db, CLIENT, threadId, { body: 'Hello?', attachmentIds: [] }, now)).toEqual({ ok: false, code: 'limit_reached' });
    expect((await getThreadPage(db, CLIENT, threadId, now))?.composer).toMatchObject({ canSend: false, disabledReason: 'awaiting_reply', firstMessagesLeft: 0 });
    // The helper's side has no such limit, and their answer lifts the starter's.
    expect((await getThreadPage(db, HELPER, threadId, now))?.composer.firstMessagesLeft).toBeUndefined();
    expect(await sendMessage(db, HELPER, threadId, { body: 'Sure, Saturday at 10?', attachmentIds: [] }, now)).toEqual({ ok: true, code: 'sent' });
    expect(await sendMessage(db, CLIENT, threadId, { body: 'Perfect, thanks!', attachmentIds: [] }, now)).toEqual({ ok: true, code: 'sent' });
    expect((await getThreadPage(db, CLIENT, threadId, now))?.composer).toMatchObject({ canSend: true });
    expect((await getThreadPage(db, CLIENT, threadId, now))?.composer.firstMessagesLeft).toBeUndefined();
    expect(await db.select().from(threads).where(and(eq(threads.kind, 'direct'), like(threads.linkedId, `%${HELPER}%`)))).toHaveLength(1);
  });

  it('follows the recipient’s setting and blocks', async () => {
    expect(await saveDirectMessageSetting(db, OTHER, { setting: 'sometimes' }, now)).toMatchObject({ ok: false, code: 'validation_failed' });
    expect(await saveDirectMessageSetting(db, OTHER, { setting: 'nobody' }, now)).toEqual({ ok: true, code: 'updated' });
    let page = await getNewDirectMessagePage(db, HELPER, { userId: OTHER }, now);
    expect(page?.kind === 'page' && page.data.refusal).toBe('not_accepting');
    expect(await startDirectChat(db, HELPER, { to: OTHER, body: 'Hi!' }, now)).toEqual({ ok: false, code: 'not_allowed' });
    await saveDirectMessageSetting(db, OTHER, { setting: 'task_contacts' }, now);
    page = await getNewDirectMessagePage(db, HELPER, { userId: OTHER }, now);
    expect(page?.kind === 'page' && page.data.refusal).toBe('task_contacts_only');
    await saveDirectMessageSetting(db, OTHER, { setting: 'everyone' }, now);
    await db.insert(blocks).values({ blockerId: OTHER, blockedId: HELPER });
    page = await getNewDirectMessagePage(db, HELPER, { userId: OTHER }, now);
    expect(page?.kind === 'page' && page.data.refusal).toBe('blocked');
    await db.delete(blocks).where(eq(blocks.blockerId, OTHER));
    page = await getNewDirectMessagePage(db, HELPER, { userId: OTHER }, now);
    expect(page?.kind === 'page' && page.data.refusal).toBeUndefined();
  });

  it('stops at the day’s allowance of new conversations, and says when the next one frees up', async () => {
    // Three starts in the last day (a newcomer's allowance since 2026-11-22), the oldest 20 hours ago.
    const earlier = (hours: number) => new Date(now.getTime() - hours * 3_600_000);
    await db.insert(threads).values(Array.from({ length: 3 }, (_, index) => ({ id: `thr_tmp_dm_fill_${index}`, kind: 'direct', linkedId: `usr_tmp_dm_fill_${index}:${OTHER}`, taskId: null, startedByUserId: OTHER, createdAt: earlier(20 - index) })));
    const page = await getNewDirectMessagePage(db, OTHER, { helper: HANDLE }, now);
    expect(page?.kind === 'page' && page.data).toMatchObject({ refusal: 'limit_reached', allowance: { left: 0, perDay: 3, resetsAt: new Date(earlier(20).getTime() + 86_400_000).toISOString() } });
    expect(await startDirectChat(db, OTHER, { to: HELPER, body: 'Hi Hank!' }, now)).toMatchObject({ ok: false, code: 'limit_reached', retryAt: expect.any(String) });
    // A day later the oldest has dropped out.
    const later = new Date(now.getTime() + 4 * 3_600_000 + 60_000);
    expect(await startDirectChat(db, OTHER, { to: HELPER, body: 'Hi Hank!' }, later)).toMatchObject({ ok: true, code: 'sent' });
  });
});

describe('New message in place (2026-11-23): suggestions by @username, and the form for one', () => {
  // "tmpdm_…": nobody else's username starts with it.
  beforeAll(async () => {
    await db.insert(usernames).values([
      { userId: CLIENT, username: 'tmpdm_dee' },
      { userId: HELPER, username: 'tmpdm_hank' },
      { userId: OTHER, username: 'tmpdm_ola' },
    ]);
  });

  it('suggests reachable people by the start of their @username, shortest first, never the viewer, with their conversation', async () => {
    const found = await searchPeople(db, CLIENT, '@TMPDM_', now, false);
    expect(found.query).toBe('tmpdm_');
    expect(found.people.map((person) => person.username)).toEqual(['tmpdm_ola', 'tmpdm_hank']);
    const hank = found.people.find((person) => person.id === HELPER)!;
    expect(hank).toMatchObject({ displayName: 'Hank D.', initials: 'HD', helper: true });
    expect(hank.sample).toBeUndefined();
    const talking = await directThreadBetween(db, CLIENT, HELPER);
    expect(hank.threadId).toBe(talking ?? undefined);
    expect(found.people.find((person) => person.id === OTHER)).toMatchObject({ helper: false });
    expect(found.allowance.perDay).toBeGreaterThan(0);
    expect(found.level).toBeTruthy();
    // The exact one first, whatever its length.
    expect((await searchPeople(db, CLIENT, 'tmpdm_hank', now, false)).people.map((person) => person.username)).toEqual(['tmpdm_hank']);
  });

  it('takes "_" as itself and nothing that can’t start a username, and leaves out blocked and suspended people', async () => {
    expect((await searchPeople(db, CLIENT, 'tmpdmx', now, false)).people).toEqual([]);
    expect((await searchPeople(db, CLIENT, 'tmpdm%', now, false)).people).toEqual([]);
    expect((await searchPeople(db, CLIENT, '', now, false)).people).toEqual([]);
    await db.insert(blocks).values({ blockerId: OTHER, blockedId: CLIENT });
    try {
      expect((await searchPeople(db, CLIENT, 'tmpdm_', now, false)).people.map((person) => person.id)).toEqual([HELPER]);
    } finally {
      await db.delete(blocks).where(and(eq(blocks.blockerId, OTHER), eq(blocks.blockedId, CLIENT)));
    }
    await db.update(users).set({ status: 'suspended' }).where(eq(users.id, OTHER));
    try {
      expect((await searchPeople(db, CLIENT, 'tmpdm_', now, false)).people.map((person) => person.id)).toEqual([HELPER]);
    } finally {
      await db.update(users).set({ status: 'active' }).where(eq(users.id, OTHER));
    }
  });

  it('marks sample profiles where sample rows are told apart (the base seed’s fixed ids are sample rows)', async () => {
    const found = await searchPeople(db, CLIENT, 'tmpdm_', now, true);
    expect(found.people.every((person) => person.sample === true)).toBe(true);
  });

  it('opens the first message’s form by @username, any case, with their username and whether they’re a sample', async () => {
    // Dee and Ola haven't talked (Ola started one with Hank above).
    const page = await getNewDirectMessagePage(db, CLIENT, { username: '@TMPDM_OLA' }, now, true);
    expect(page?.kind).toBe('page');
    if (page?.kind !== 'page') return;
    expect(page.data).toMatchObject({ recipient: { id: OTHER, displayName: 'Ola O.' }, username: 'tmpdm_ola', sample: true, canRequest: false });
    expect(page.data.helperHandle).toBeUndefined();
    const plain = await getNewDirectMessagePage(db, CLIENT, { username: 'tmpdm_ola' }, now, false);
    expect(plain).toMatchObject({ kind: 'page', data: { username: 'tmpdm_ola' } });
    expect(plain?.kind === 'page' && plain.data.sample).toBeUndefined();
    // Someone they already talk to: that conversation.
    expect(await getNewDirectMessagePage(db, OTHER, { username: 'tmpdm_hank' }, now)).toEqual({ kind: 'thread', threadId: await directThreadBetween(db, OTHER, HELPER) });
    expect(await getNewDirectMessagePage(db, CLIENT, { username: 'nobody_tmpdm' }, now)).toBeNull();
    expect(await getNewDirectMessagePage(db, CLIENT, { username: 'x' }, now)).toBeNull();
  });
});
