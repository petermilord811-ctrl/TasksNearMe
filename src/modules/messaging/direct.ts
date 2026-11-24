import { and, eq, gt, inArray, isNotNull, ne, notInArray, or, sql } from 'drizzle-orm';
import {
  DIRECT_CHATS_PER_DAY,
  DIRECT_FIRST_MESSAGES_MAX,
  DIRECT_MESSAGE_SETTINGS,
  normalizeUsername,
  PEOPLE_SUGGESTIONS_MAX,
  routes,
  STAFF_DIRECT_CHATS_PER_DAY,
  startDirectChatInputSchema,
  type ActionResult,
  type DirectChatAllowance,
  type DirectChatRefusal,
  type DirectChatStart,
  type DirectChatTarget,
  type DirectMessageSetting,
  type PeopleSearchData,
  type StartDirectChatInput,
  type FindPersonPageData,
  type TimelineEvent,
} from '@/contracts';
import { staffRoles, usernames, users } from '@/modules/accounts/schema';
import { findUserIdByUsername } from '@/modules/accounts/usernames';
import { topTier } from '@/modules/billing/domain';
import { activePlans } from '@/modules/billing/service';
import { bookings } from '@/modules/bookings/schema';
import { profilePhotoOf } from '@/modules/files/photos';
import { helperProfiles } from '@/modules/profiles/schema';
import { initialsOf } from '@/modules/profiles/queries';
import { directChatAllowance, sparksSummaryOf } from '@/modules/sparks/service';
import { blockedPeopleOf, isBlockedBetween } from '@/modules/trust/blocks';
import { isSampleId, samplesHiddenInThisBuild } from '@/shared/sample-data';
import { validationFailed } from '@/platform/actions/results';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { violatedConstraint } from '@/platform/db/errors';
import { outboxEvents } from '@/platform/outbox/schema';
import { consumeRateLimit } from '@/platform/rate-limit';
import { allowanceResetsAt, directChatRefusal, directPairKey } from './direct-rules';
import { noteSampleRecipient } from './samples';
import { messages, threadParticipants, threads } from './schema';
import { SEND_RATE_LIMIT, sendMessage } from './service';

/**
 * Direct conversations (owner, 2026-11-21; decisions.md): two people talking without a task, started by writing the
 * first message. One per pair. Who may start one: the recipient's setting, blocks, and the starter's allowance of new
 * conversations a day (their Sparks level, or their plan's); then a few messages until the other person answers.
 * Contact details stay masked until the two have a paid booking together, as in every other conversation.
 */

const DAY = 86_400_000;
const STARTER_STATUSES = new Set(['active']);
const RECIPIENT_STATUSES = new Set(['active', 'restricted']);

export const isDirectMessageSetting = (value: unknown): value is DirectMessageSetting => (DIRECT_MESSAGE_SETTINGS as readonly unknown[]).includes(value);

type Recipient = { id: string; row: typeof users.$inferSelect; handle?: string; helperActive: boolean; username?: string };

async function recipientOf(db: Db, to: { userId: string } | { helper: string }): Promise<Recipient | null> {
  const where = 'helper' in to ? eq(helperProfiles.handle, String(to.helper)) : eq(users.id, String(to.userId));
  const [row] = await db
    .select({ user: users, handle: helperProfiles.handle, profileStatus: helperProfiles.status, username: usernames.username })
    .from(users)
    .leftJoin(helperProfiles, eq(helperProfiles.userId, users.id))
    .leftJoin(usernames, eq(usernames.userId, users.id))
    .where(where)
    .limit(1);
  if (!row || ('helper' in to && !row.handle)) return null;
  return { id: row.user.id, row: row.user, ...(row.handle ? { handle: row.handle } : {}), helperActive: row.profileStatus === 'active', ...(row.username ? { username: row.username } : {}) };
}

/** A link's or the window's way of naming the person, as the id or handle `recipientOf` reads (an @username: its account). */
async function resolvedTarget(db: Db, to: DirectChatTarget): Promise<{ userId: string } | { helper: string } | null> {
  if (!('username' in to)) return to;
  const userId = await findUserIdByUsername(db, String(to.username));
  return userId ? { userId } : null;
}

/** The two people's direct conversation, when they have one. */
export async function directThreadBetween(db: Db, a: string, b: string): Promise<string | null> {
  const [row] = await db.select({ id: threads.id }).from(threads).where(and(eq(threads.kind, 'direct'), eq(threads.linkedId, directPairKey(a, b)))).limit(1);
  return row?.id ?? null;
}

/**
 * A line in the two people's direct conversation, when they have one (2026-11-23): a task request one of them sent the
 * other (`invite_sent` with its id) shows there as a card. Nothing when they don't talk directly. `actorUserId`'s own
 * news: it doesn't count as unread for them, unless something else in the conversation still is.
 */
export async function postInDirectThread(db: Pick<Db, 'select' | 'insert' | 'update'>, a: string, b: string, event: Pick<TimelineEvent, 'type' | 'params'>, now: Date, actorUserId: string): Promise<string | null> {
  const [thread] = await db.select({ id: threads.id }).from(threads).where(and(eq(threads.kind, 'direct'), eq(threads.linkedId, directPairKey(a, b)))).limit(1);
  if (!thread) return null;
  const id = newId('msg');
  await db.insert(messages).values({ id, threadId: thread.id, kind: 'status', event, createdAt: now });
  await db.update(threads).set({ lastMessageAt: now }).where(eq(threads.id, thread.id));
  const unreadBefore = sql`exists (select 1 from ${messages} where ${messages.threadId} = ${thread.id} and ${messages.id} <> ${id} and (${messages.senderUserId} is null or ${messages.senderUserId} <> ${actorUserId}) and (${threadParticipants.lastReadAt} is null or ${messages.createdAt} > ${threadParticipants.lastReadAt}))`;
  await db.update(threadParticipants).set({ lastReadAt: now }).where(and(eq(threadParticipants.threadId, thread.id), eq(threadParticipants.userId, actorUserId), sql`not ${unreadBefore}`));
  return thread.id;
}

/** They've talked about a task before: an offer, invite, booking or regular visits conversation with both in it. */
async function taskContactsBetween(db: Db, a: string, b: string): Promise<boolean> {
  const [row] = await db.execute<{ found: number }>(sql`
    select 1 as found from ${threadParticipants} mine
    join ${threadParticipants} theirs on theirs.thread_id = mine.thread_id and theirs.user_id = ${b}
    join ${threads} t on t.id = mine.thread_id and t.kind <> 'direct'
    where mine.user_id = ${a}
    limit 1`).then((result) => result.rows);
  return Boolean(row);
}

/** A staff account (any role): no daily limit on new conversations (2026-11-23). */
async function staffAccount(db: Pick<Db, 'select'>, userId: string): Promise<boolean> {
  const [row] = await db.select({ userId: staffRoles.userId }).from(staffRoles).where(eq(staffRoles.userId, userId)).limit(1);
  return Boolean(row);
}

/**
 * How many new direct conversations the person may start in any 24 hours: their Sparks level's or plan's allowance, or
 * for a staff account no limit to speak of (`STAFF_DIRECT_CHATS_PER_DAY`, a guard against a runaway script only).
 */
async function startsAllowed(db: Db, userId: string, now: Date): Promise<{ perDay: number; staff: boolean }> {
  if (await staffAccount(db, userId)) return { perDay: STAFF_DIRECT_CHATS_PER_DAY, staff: true };
  return { perDay: await directChatAllowance(db, userId, now), staff: false };
}

/** What New message says about the allowance: left of the day's, when the next frees up, or a staff account's none. */
function allowanceOf(starts: readonly Date[], allowed: { perDay: number; staff: boolean }, now: Date): DirectChatAllowance {
  const left = Math.max(0, allowed.perDay - starts.length);
  const resetsAt = left === 0 ? allowanceResetsAt([...starts], now) : undefined;
  return { left, perDay: allowed.perDay, ...(resetsAt ? { resetsAt: resetsAt.toISOString() } : {}), ...(allowed.staff ? { staff: true } : {}) };
}

/** The direct conversations the person started in the 24 hours before `now`. */
async function startsLastDay(db: Pick<Db, 'select'>, userId: string, now: Date): Promise<Date[]> {
  const rows = await db
    .select({ createdAt: threads.createdAt })
    .from(threads)
    .where(and(eq(threads.kind, 'direct'), eq(threads.startedByUserId, userId), gt(threads.createdAt, new Date(now.getTime() - DAY))));
  return rows.map((row) => row.createdAt);
}

async function facts(db: Db, viewerId: string, recipient: Recipient, now: Date) {
  const [viewer] = await db.select({ status: users.status }).from(users).where(eq(users.id, viewerId)).limit(1);
  const setting = isDirectMessageSetting(recipient.row.directMessages) ? recipient.row.directMessages : 'everyone';
  const [blocked, taskContacts, starts, allowed] = await Promise.all([
    isBlockedBetween(db, viewerId, recipient.id),
    setting === 'task_contacts' ? taskContactsBetween(db, viewerId, recipient.id) : Promise.resolve(false),
    startsLastDay(db, viewerId, now),
    startsAllowed(db, viewerId, now),
  ]);
  const { perDay } = allowed;
  const refusal = directChatRefusal({
    self: viewerId === recipient.id,
    viewerActive: STARTER_STATUSES.has(viewer?.status ?? ''),
    recipientActive: RECIPIENT_STATUSES.has(recipient.row.status),
    blocked,
    setting,
    taskContacts,
    startedLastDay: starts.length,
    perDay,
  });
  return { refusal, starts, perDay, allowed };
}

/**
 * Whether `starterId` may open a conversation with `recipientId` now, by the recipient's "who can message me", a block
 * and both accounts, without the daily allowance: for a conversation another flow opens (team up's invite, 2026-11-24,
 * sweep C6). `contacts`: they've talked about a task before, so it isn't a message request.
 */
export async function directStartFor(db: Db, starterId: string, recipientId: string, now: Date): Promise<{ refused: DirectChatRefusal | null; contacts: boolean }> {
  const recipient = await recipientOf(db, { userId: recipientId });
  if (!recipient || recipient.row.status === 'deleted') return { refused: 'unavailable', contacts: false };
  const [{ refusal }, contacts] = await Promise.all([facts(db, starterId, recipient, now), taskContactsBetween(db, starterId, recipientId)]);
  return { refused: refusal === 'limit_reached' ? null : refusal, contacts };
}

/** Contact details stay masked until the two have a paid booking together. */
async function paidBookingBetween(db: Db, a: string, b: string): Promise<boolean> {
  const [row] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(and(isNotNull(bookings.confirmedAt), or(and(eq(bookings.posterUserId, a), eq(bookings.helperUserId, b)), and(eq(bookings.posterUserId, b), eq(bookings.helperUserId, a)))))
    .limit(1);
  return Boolean(row);
}

/**
 * `/app/messages/new` (and the chat window's and the dialog's New message, `GET /api/messages/new`): the conversation to
 * go to when the two already have one, the first message's form, or null (nobody by that id, handle or @username, or an
 * account that's gone). `hiding`: whether sample profiles are told apart in this build (tests pass it).
 */
export async function getNewDirectMessagePage(db: Db, viewerId: string, to: DirectChatTarget, now: Date, hiding: boolean = samplesHiddenInThisBuild()): Promise<DirectChatStart | null> {
  const target = await resolvedTarget(db, to);
  const recipient = target ? await recipientOf(db, target) : null;
  if (!recipient || recipient.row.status === 'deleted') return null;
  if (recipient.id !== viewerId) {
    const existing = await directThreadBetween(db, viewerId, recipient.id);
    if (existing) return { kind: 'thread', threadId: existing };
  }
  const [{ refusal, starts, allowed }, paid] = await Promise.all([facts(db, viewerId, recipient, now), paidBookingBetween(db, viewerId, recipient.id)]);
  const user = recipient.row;
  return {
    kind: 'page',
    data: {
      recipient: { id: user.id, displayName: user.name, initials: initialsOf(user.firstName, user.lastName), ...profilePhotoOf(user), memberSince: user.createdAt.toISOString(), phoneVerified: user.phoneVerifiedAt !== null },
      ...(recipient.username ? { username: recipient.username } : {}),
      ...(hiding && isSampleId(user.id) ? { sample: true } : {}),
      ...(recipient.handle ? { helperHandle: recipient.handle } : {}),
      canRequest: recipient.helperActive && recipient.id !== viewerId,
      ...(refusal ? { refusal } : {}),
      allowance: allowanceOf(starts, allowed, now),
      firstMessagesMax: DIRECT_FIRST_MESSAGES_MAX,
      contactMasking: !paid,
      maxLength: 2000,
    },
  };
}

class Refused extends Error {
  constructor(readonly result: ActionResult) {
    super(result.ok ? 'ok' : result.code);
  }
}

/**
 * Starts a direct conversation with its first message (ok `sent`, `redirectTo` the conversation). When the two already
 * have one (or the other person started it at the same moment), the message goes there instead, under its rules.
 */
export async function startDirectChat(db: Db, viewerId: string, input: StartDirectChatInput, now: Date): Promise<ActionResult> {
  const parsed = startDirectChatInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const { to, body, requestKey } = parsed.data;
  // The same start again, after an answer that never arrived: it's sent already, so go to its conversation.
  if (requestKey) {
    const [sent] = await db.select({ threadId: messages.threadId }).from(messages).where(and(eq(messages.senderUserId, viewerId), eq(messages.requestKey, requestKey))).limit(1);
    if (sent) return { ok: true, code: 'sent', redirectTo: routes.app.thread(sent.threadId) };
  }
  const recipient = await recipientOf(db, { userId: to });
  if (!recipient || recipient.row.status === 'deleted') return { ok: false, code: 'not_found' };
  const sendThere = async (threadId: string): Promise<ActionResult> => {
    const result = await sendMessage(db, viewerId, threadId, { body, attachmentIds: [], ...(requestKey ? { requestKey } : {}) }, now);
    return result.ok ? { ...result, redirectTo: routes.app.thread(threadId) } : result;
  };
  if (recipient.id !== viewerId) {
    const existing = await directThreadBetween(db, viewerId, recipient.id);
    if (existing) return sendThere(existing);
  }
  const [{ refusal, starts, perDay }, contacts] = await Promise.all([facts(db, viewerId, recipient, now), taskContactsBetween(db, viewerId, recipient.id)]);
  if (refusal === 'limit_reached') return { ok: false, code: 'limit_reached', ...(allowanceResetsAt(starts, now) ? { retryAt: allowanceResetsAt(starts, now)!.toISOString() } : {}) };
  if (refusal) return { ok: false, code: 'not_allowed' };
  const limited = await consumeRateLimit(db, `messages:${viewerId}`, SEND_RATE_LIMIT, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };

  const threadId = newId('thr');
  try {
    await db.transaction(async (tx) => {
      // One start at a time per person, so two tabs can't both take the last of the day's allowance.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`direct-start:${viewerId}`}))`);
      if ((await startsLastDay(tx, viewerId, now)).length >= perDay) throw new Refused({ ok: false, code: 'limit_reached' });
      await tx.insert(threads).values({ id: threadId, kind: 'direct', linkedId: directPairKey(viewerId, recipient.id), taskId: null, startedByUserId: viewerId, createdAt: now, lastMessageAt: now });
      // A message request for the recipient (2026-11-23), unless the two have talked about a task before.
      await tx.insert(threadParticipants).values([
        { threadId, userId: viewerId, lastReadAt: now, acceptedAt: now },
        { threadId, userId: recipient.id, acceptedAt: contacts ? now : null },
      ]);
      await tx.insert(messages).values({ id: newId('msg'), threadId, senderUserId: viewerId, kind: 'text', body, attachmentFileIds: [], requestKey: requestKey ?? null, createdAt: now });
      await tx.insert(outboxEvents).values({
        id: newId('evt'),
        type: 'message.sent',
        aggregateType: 'thread',
        aggregateId: threadId,
        payload: { threadId, taskId: null, senderUserId: viewerId, recipientIds: [recipient.id] },
      });
      // A sample profile never answers: the app says so under the first message (2026-11-23).
      await noteSampleRecipient(tx, threadId, viewerId, [recipient.id], now);
    });
  } catch (error) {
    if (error instanceof Refused) return error.result;
    const constraint = violatedConstraint(error);
    // The other person started theirs at the same moment: write in it.
    if (constraint === 'threads_kind_linked_idx') {
      const existing = await directThreadBetween(db, viewerId, recipient.id);
      if (existing) return sendThere(existing);
    }
    // The same start at the same moment (its key is taken): the other request made it.
    if (requestKey && constraint === 'messages_sender_request_key_idx') {
      const [sent] = await db.select({ threadId: messages.threadId }).from(messages).where(and(eq(messages.senderUserId, viewerId), eq(messages.requestKey, requestKey))).limit(1);
      if (sent) return { ok: true, code: 'sent', redirectTo: routes.app.thread(sent.threadId) };
    }
    throw error;
  }
  return { ok: true, code: 'sent', redirectTo: routes.app.thread(threadId) };
}

/** "Who can message me directly" on the account page. */
export async function saveDirectMessageSetting(db: Db, userId: string, input: { setting?: unknown }, now: Date): Promise<ActionResult> {
  if (!isDirectMessageSetting(input?.setting)) return { ok: false, code: 'validation_failed', fieldErrors: { setting: ['invalid'] } };
  await db.update(users).set({ directMessages: input.setting, updatedAt: now }).where(and(eq(users.id, userId), ne(users.status, 'deleted')));
  return { ok: true, code: 'updated' };
}

/**
 * "New message" with no one named yet (2026-11-22): the box for an @username, and the person's own allowance of new
 * conversations (left in any 24 hours, by Sparks level or plan), so they see what their level allows before typing.
 */
export async function getFindPersonPage(db: Db, viewerId: string, query: { text?: string; notFound?: boolean }, now: Date): Promise<FindPersonPageData> {
  const [starts, allowed, summary, plans] = await Promise.all([startsLastDay(db, viewerId, now), startsAllowed(db, viewerId, now), sparksSummaryOf(db, viewerId), activePlans(db, viewerId, now)]);
  const level = summary?.level ?? 'newcomer';
  // A plan sets the allowance when it gives more than the level does (the plans' ladder, 2026-11-23); a staff account
  // has no limit to speak of (2026-11-23).
  const tier = topTier(plans.keys());
  return {
    ...(!allowed.staff && tier !== 'free' && allowed.perDay > DIRECT_CHATS_PER_DAY[level] ? { allowanceFrom: tier } : {}),
    // As usernames read (the "@" they typed goes: the box and the message show their own).
    ...(query.text && normalizeUsername(query.text) ? { query: normalizeUsername(query.text).slice(0, 40) } : {}),
    ...(query.notFound ? { notFound: true } : {}),
    allowance: allowanceOf(starts, allowed, now),
    level,
  };
}

/** What may start an @username: `USERNAME_PATTERN`'s first letter, then its letters, digits and "_", up to its 20. */
const USERNAME_PREFIX = /^[a-z][a-z0-9_]{0,19}$/;

/**
 * New message's suggestions as the person types an @username (2026-11-23, owner: "I want to do it in live chat box
 * itself"): reachable people whose username starts with what's typed (any case, with or without "@"), the exact one
 * first, then the shortest. Never the viewer, nobody blocked either way, only accounts in use (as `findUserIdByUsername`).
 * Each says whether they're a helper, whether they're a sample profile (`hiding`: where sample rows are told apart), and
 * the viewer's conversation with them, so choosing one opens it. With the viewer's allowance, as on the find step.
 */
export async function searchPeople(db: Db, viewerId: string, text: string, now: Date, hiding: boolean = samplesHiddenInThisBuild()): Promise<PeopleSearchData> {
  const query = normalizeUsername(text).slice(0, 20);
  const found = await getFindPersonPage(db, viewerId, {}, now);
  const base = { query, allowance: found.allowance, level: found.level, ...(found.allowanceFrom ? { allowanceFrom: found.allowanceFrom } : {}) };
  if (!USERNAME_PREFIX.test(query)) return { ...base, people: [] };
  const blocked = await blockedPeopleOf(db, viewerId);
  // "_" is LIKE's one-character wildcard: escaped, it's itself.
  const startsWith = `${query.replace(/_/g, '\\_')}%`;
  const rows = await db
    .select({ id: users.id, name: users.name, firstName: users.firstName, lastName: users.lastName, avatarFileId: users.avatarFileId, username: usernames.username, profileStatus: helperProfiles.status })
    .from(usernames)
    .innerJoin(users, eq(users.id, usernames.userId))
    .leftJoin(helperProfiles, eq(helperProfiles.userId, users.id))
    .where(and(sql`lower(${usernames.username}) like ${startsWith}`, inArray(users.status, [...RECIPIENT_STATUSES]), ne(users.id, viewerId), ...(blocked.length > 0 ? [notInArray(users.id, blocked)] : [])))
    .orderBy(sql`lower(${usernames.username}) = ${query} desc`, sql`length(${usernames.username})`, sql`lower(${usernames.username})`)
    .limit(PEOPLE_SUGGESTIONS_MAX);
  const keys = rows.map((row) => directPairKey(viewerId, row.id));
  const existing = keys.length > 0 ? await db.select({ id: threads.id, linkedId: threads.linkedId }).from(threads).where(and(eq(threads.kind, 'direct'), inArray(threads.linkedId, keys))) : [];
  const threadOf = new Map(existing.map((row) => [row.linkedId, row.id] as const));
  return {
    ...base,
    people: rows.map((row) => {
      const threadId = threadOf.get(directPairKey(viewerId, row.id));
      return {
        id: row.id,
        username: row.username,
        displayName: row.name,
        initials: initialsOf(row.firstName, row.lastName),
        ...profilePhotoOf(row),
        helper: row.profileStatus === 'active',
        ...(hiding && isSampleId(row.id) ? { sample: true } : {}),
        ...(threadId ? { threadId } : {}),
      };
    }),
  };
}
