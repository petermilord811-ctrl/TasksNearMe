import { and, eq, gt, isNotNull, ne, or, sql } from 'drizzle-orm';
import {
  DIRECT_FIRST_MESSAGES_MAX,
  DIRECT_MESSAGE_SETTINGS,
  normalizeUsername,
  routes,
  startDirectChatInputSchema,
  type ActionResult,
  type DirectMessageSetting,
  type NewDirectMessagePageData,
  type StartDirectChatInput,
  type FindPersonPageData,
} from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { bookings } from '@/modules/bookings/schema';
import { profilePhotoOf } from '@/modules/files/photos';
import { helperProfiles } from '@/modules/profiles/schema';
import { initialsOf } from '@/modules/profiles/queries';
import { directChatAllowance, sparksSummaryOf } from '@/modules/sparks/service';
import { isBlockedBetween } from '@/modules/trust/blocks';
import { validationFailed } from '@/platform/actions/results';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { violatedConstraint } from '@/platform/db/errors';
import { outboxEvents } from '@/platform/outbox/schema';
import { consumeRateLimit } from '@/platform/rate-limit';
import { allowanceResetsAt, directChatRefusal, directPairKey } from './direct-rules';
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

type Recipient = { id: string; row: typeof users.$inferSelect; handle?: string; helperActive: boolean };

async function recipientOf(db: Db, to: { userId: string } | { helper: string }): Promise<Recipient | null> {
  const where = 'helper' in to ? eq(helperProfiles.handle, String(to.helper)) : eq(users.id, String(to.userId));
  const [row] = await db.select({ user: users, handle: helperProfiles.handle, profileStatus: helperProfiles.status }).from(users).leftJoin(helperProfiles, eq(helperProfiles.userId, users.id)).where(where).limit(1);
  if (!row || ('helper' in to && !row.handle)) return null;
  return { id: row.user.id, row: row.user, ...(row.handle ? { handle: row.handle } : {}), helperActive: row.profileStatus === 'active' };
}

/** The two people's direct conversation, when they have one. */
export async function directThreadBetween(db: Db, a: string, b: string): Promise<string | null> {
  const [row] = await db.select({ id: threads.id }).from(threads).where(and(eq(threads.kind, 'direct'), eq(threads.linkedId, directPairKey(a, b)))).limit(1);
  return row?.id ?? null;
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
  const [blocked, taskContacts, starts, perDay] = await Promise.all([
    isBlockedBetween(db, viewerId, recipient.id),
    setting === 'task_contacts' ? taskContactsBetween(db, viewerId, recipient.id) : Promise.resolve(false),
    startsLastDay(db, viewerId, now),
    directChatAllowance(db, viewerId, now),
  ]);
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
  return { refusal, starts, perDay };
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
 * `/app/messages/new`: the conversation to go to when the two already have one, the page to write the first message,
 * or null (nobody by that id or handle, or an account that's gone).
 */
export async function getNewDirectMessagePage(db: Db, viewerId: string, to: { userId: string } | { helper: string }, now: Date): Promise<{ kind: 'thread'; threadId: string } | { kind: 'page'; data: NewDirectMessagePageData } | null> {
  const recipient = await recipientOf(db, to);
  if (!recipient || recipient.row.status === 'deleted') return null;
  if (recipient.id !== viewerId) {
    const existing = await directThreadBetween(db, viewerId, recipient.id);
    if (existing) return { kind: 'thread', threadId: existing };
  }
  const [{ refusal, starts, perDay }, paid] = await Promise.all([facts(db, viewerId, recipient, now), paidBookingBetween(db, viewerId, recipient.id)]);
  const left = Math.max(0, perDay - starts.length);
  const resetsAt = left === 0 ? allowanceResetsAt(starts, now) : undefined;
  const user = recipient.row;
  return {
    kind: 'page',
    data: {
      recipient: { id: user.id, displayName: user.name, initials: initialsOf(user.firstName, user.lastName), ...profilePhotoOf(user), memberSince: user.createdAt.toISOString(), phoneVerified: user.phoneVerifiedAt !== null },
      ...(recipient.handle ? { helperHandle: recipient.handle } : {}),
      canRequest: recipient.helperActive && recipient.id !== viewerId,
      ...(refusal ? { refusal } : {}),
      allowance: { left, perDay, ...(resetsAt ? { resetsAt: resetsAt.toISOString() } : {}) },
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
  const { refusal, starts, perDay } = await facts(db, viewerId, recipient, now);
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
      await tx.insert(threadParticipants).values([
        { threadId, userId: viewerId, lastReadAt: now },
        { threadId, userId: recipient.id },
      ]);
      await tx.insert(messages).values({ id: newId('msg'), threadId, senderUserId: viewerId, kind: 'text', body, attachmentFileIds: [], requestKey: requestKey ?? null, createdAt: now });
      await tx.insert(outboxEvents).values({
        id: newId('evt'),
        type: 'message.sent',
        aggregateType: 'thread',
        aggregateId: threadId,
        payload: { threadId, taskId: null, senderUserId: viewerId, recipientIds: [recipient.id] },
      });
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
  const [starts, perDay, summary] = await Promise.all([startsLastDay(db, viewerId, now), directChatAllowance(db, viewerId, now), sparksSummaryOf(db, viewerId)]);
  const left = Math.max(0, perDay - starts.length);
  const resetsAt = left === 0 ? allowanceResetsAt(starts, now) : undefined;
  return {
    // As usernames read (the "@" they typed goes: the box and the message show their own).
    ...(query.text && normalizeUsername(query.text) ? { query: normalizeUsername(query.text).slice(0, 40) } : {}),
    ...(query.notFound ? { notFound: true } : {}),
    allowance: { left, perDay, ...(resetsAt ? { resetsAt: resetsAt.toISOString() } : {}) },
    level: summary?.level ?? 'newcomer',
  };
}
