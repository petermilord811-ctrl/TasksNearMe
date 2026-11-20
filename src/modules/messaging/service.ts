import { helperProfiles } from '@/modules/profiles/schema';
import { recomputeResponseTime } from '@/modules/profiles/response-time';
import { and, asc, count, desc, eq, gt, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import type {
  ActionResult,
  ComposerClosedReason,
  ComposerDisabledReason,
  InboxPageData,
  MessageView,
  PersonSummary,
  SendMessageInput,
  ThreadKind,
  ThreadPageData,
  ThreadSubject,
  ThreadSummary,
  TimelineEvent,
} from '@/contracts';
import { MESSAGE_REACTIONS, MESSAGE_SAVED_REPLY_MAX, messageSavedReplyInputSchema, sendMessageInputSchema, type MessageReaction, type MessageSavedReplyInput } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { bookingSeries, bookings } from '@/modules/bookings/schema';
import { MAX_PHOTO_BYTES, photoFromFile } from '@/modules/files/uploads';
import { profilePhotoOf } from '@/modules/files/photos';
import { notifications } from '@/modules/notifications/schema';
import { declinedByCancel } from '@/modules/offers/closing';
import { offers } from '@/modules/offers/schema';
import { initialsOf } from '@/modules/profiles/queries';
import { files, tasks } from '@/modules/tasks/schema';
import { isBlockedBetween } from '@/modules/trust/blocks';
import { toMessageSegments } from '@/modules/trust/message-segments';
import { validationFailed } from '@/platform/actions/results';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { outboxEvents } from '@/platform/outbox/schema';
import { consumeRateLimit } from '@/platform/rate-limit';
import { userChannel } from '@/platform/realtime/hub';
import { publishNotices } from '@/platform/realtime/publish';
import { presenceOf } from '@/modules/realtime/presence';
import { messageReactions, messages, savedReplies, threadParticipants, threads } from './schema';

/**
 * Threads between the two people on an offer or a booking (blueprint 02 J2 step 6, 06, 08). Bodies are
 * stored as written and masked when shown until a booking between them is confirmed. Threads are made
 * when first needed (opening "Message", a booking update).
 */

const DAY = 86_400_000;
const SEND_RATE_LIMIT = { limit: 60, windowSeconds: 3600 };
const PAGE_SIZE = 100;
const LIVE_BOOKING_STATUSES = ['confirmed', 'in_progress', 'completion_submitted', 'disputed', 'completed'];

type ThreadRow = typeof threads.$inferSelect;
type Writer = Pick<Db, 'insert' | 'update' | 'select'>;

export interface ThreadLink {
  kind: ThreadKind;
  linkedId: string;
  taskId: string;
  participantIds: string[];
}

/** The thread for an offer or a booking, created with its participants the first time. */
export async function ensureThread(db: Writer, link: ThreadLink, now: Date): Promise<string> {
  await db
    .insert(threads)
    .values({ id: newId('thr'), kind: link.kind, linkedId: link.linkedId, taskId: link.taskId, createdAt: now })
    .onConflictDoNothing({ target: [threads.kind, threads.linkedId] });
  const [thread] = await db
    .select({ id: threads.id })
    .from(threads)
    .where(and(eq(threads.kind, link.kind), eq(threads.linkedId, link.linkedId)))
    .limit(1);
  if (!thread) throw new Error('Thread missing after insert');
  for (const userId of new Set(link.participantIds)) {
    await db.insert(threadParticipants).values({ threadId: thread.id, userId }).onConflictDoNothing();
  }
  return thread.id;
}

/**
 * A booking update or notice in a thread ("Jordan is on the way"). `actorUserId`: the person whose act it records
 * (the client who paid, the helper on the way). It isn't news to them, so it doesn't count as unread for them (sweep
 * MN8): their read mark moves past it, but only when nothing else in the conversation is unread for them, so a
 * message they haven't seen yet never reads as seen. Without one (the system's own notices), it's unread for both.
 */
export async function postEvent(db: Writer, link: ThreadLink, kind: 'status' | 'system', event: Pick<TimelineEvent, 'type' | 'params'>, now: Date, actorUserId?: string | null): Promise<void> {
  const threadId = await ensureThread(db, link, now);
  const id = newId('msg');
  await db.insert(messages).values({ id, threadId, kind, event, createdAt: now });
  await db.update(threads).set({ lastMessageAt: now }).where(eq(threads.id, threadId));
  if (!actorUserId) return;
  const unreadBefore = sql`exists (select 1 from ${messages} where ${messages.threadId} = ${threadId} and ${messages.id} <> ${id} and (${messages.senderUserId} is null or ${messages.senderUserId} <> ${actorUserId}) and (${threadParticipants.lastReadAt} is null or ${messages.createdAt} > ${threadParticipants.lastReadAt}))`;
  await db
    .update(threadParticipants)
    .set({ lastReadAt: now })
    .where(and(eq(threadParticipants.threadId, threadId), eq(threadParticipants.userId, actorUserId), sql`not ${unreadBefore}`));
}

// ---- What each thread is about ----------------------------------------------------------------------

interface ThreadContext {
  title: string;
  subject: ThreadSubject;
  /** Contact details stay hidden until a booking between the two is confirmed (paid). */
  masking: boolean;
  closed: boolean;
  /** Why it closed, when it did (audit L13). */
  closedReason?: ComposerClosedReason;
}

/**
 * What several threads are about, with one query per kind of record they link to rather than a few per thread
 * (the inbox and the home page list every thread a person has: completion plan 5.7). A thread whose task or
 * linked record is gone has no entry.
 */
async function contextsOf(db: Db, list: ThreadRow[], viewerId: string, now: Date): Promise<Map<string, ThreadContext>> {
  const out = new Map<string, ThreadContext>();
  if (list.length === 0) return out;
  const linked = (kind: ThreadKind) => [...new Set(list.filter((thread) => thread.kind === kind).map((thread) => thread.linkedId))];
  const bookingIds = linked('booking');
  const seriesIds = linked('series');
  const offerIds = linked('offer');
  const [taskRows, bookingRows, seriesRows, lastVisits, offerRows, bookedRows] = await Promise.all([
    db.select({ id: tasks.id, title: tasks.title, posterUserId: tasks.posterUserId, status: tasks.status }).from(tasks).where(inArray(tasks.id, [...new Set(list.map((thread) => thread.taskId))])),
    bookingIds.length ? db.select().from(bookings).where(inArray(bookings.id, bookingIds)) : [],
    seriesIds.length ? db.select({ id: bookingSeries.id, status: bookingSeries.status }).from(bookingSeries).where(inArray(bookingSeries.id, seriesIds)) : [],
    // Each series' last visit that isn't canceled.
    seriesIds.length
      ? db
          .selectDistinctOn([bookings.seriesId], { seriesId: bookings.seriesId, startAt: bookings.startAt })
          .from(bookings)
          .where(and(inArray(bookings.seriesId, seriesIds), ne(bookings.status, 'canceled')))
          .orderBy(bookings.seriesId, desc(bookings.startAt))
      : [],
    offerIds.length ? db.select().from(offers).where(inArray(offers.id, offerIds)) : [],
    offerIds.length ? db.selectDistinct({ offerId: bookings.offerId }).from(bookings).where(and(inArray(bookings.offerId, offerIds), inArray(bookings.status, LIVE_BOOKING_STATUSES))) : [],
  ]);
  const taskById = new Map(taskRows.map((task) => [task.id, task]));
  const bookingById = new Map(bookingRows.map((booking) => [booking.id, booking]));
  const seriesById = new Map(seriesRows.map((series) => [series.id, series]));
  const lastVisitBySeries = new Map(lastVisits.map((visit) => [visit.seriesId, visit.startAt]));
  const offerById = new Map(offerRows.map((offer) => [offer.id, offer]));
  const bookedOffers = new Set(bookedRows.map((row) => row.offerId));
  // A declined offer whose task's cancellation declined it says the task was canceled (sweep D9), not that another
  // offer was chosen: offers/closing.ts has the rule, shared with the offer page and My offers.
  const canceledOffers = await declinedByCancel(db, offerRows, (taskId) => taskById.get(taskId)?.status);
  for (const thread of list) {
    const task = taskById.get(thread.taskId);
    if (!task) continue;
    if (thread.kind === 'booking') {
      const booking = bookingById.get(thread.linkedId);
      if (!booking) continue;
      const endedAt = booking.status === 'completed' ? booking.completedAt : booking.status === 'canceled' ? booking.canceledAt : null;
      const keepOpenDays = booking.status === 'completed' ? 30 : 7;
      const closed = endedAt !== null && now.getTime() > endedAt.getTime() + keepOpenDays * DAY;
      out.set(thread.id, {
        title: task.title,
        subject: { kind: 'booking', bookingId: booking.id },
        // Until it's paid (`confirmed_at`, set only when the money comes in): a booking made more than 14 days ahead
        // is `scheduled`, unpaid and free to cancel, and one canceled before its money came never was (sweep MN3).
        masking: booking.confirmedAt === null,
        closed,
        ...(closed ? { closedReason: booking.status === 'completed' ? 'booking_completed' : 'booking_canceled' } : {}),
      });
    } else if (thread.kind === 'series') {
      // Regular visits: open while the series runs, and 30 days after its last visit once it's over.
      const series = seriesById.get(thread.linkedId);
      if (!series) continue;
      const last = lastVisitBySeries.get(series.id);
      const over = series.status === 'canceled' || series.status === 'ended';
      const closed = over && (!last || now.getTime() > last.getTime() + 30 * DAY);
      out.set(thread.id, {
        title: task.title,
        subject: { kind: 'series', seriesId: series.id },
        masking: false,
        closed,
        ...(closed ? { closedReason: 'series_ended' as const } : {}),
      });
    } else if (thread.kind === 'offer') {
      const offer = offerById.get(thread.linkedId);
      if (!offer) continue;
      const booked = bookedOffers.has(offer.id);
      const open = ['pending', 'stale'].includes(offer.status) && offer.expiresAt > now;
      const closed = !open && !booked;
      // An offer still pending past its expiry is expired, whether or not the job runner has marked it yet.
      const closedReason: ComposerClosedReason = offer.status === 'declined' ? (canceledOffers.has(offer.id) ? 'task_canceled' : 'offer_declined') : offer.status === 'withdrawn' ? 'offer_withdrawn' : offer.status === 'accepted' ? 'offer_ended' : 'offer_expired';
      out.set(thread.id, {
        title: task.title,
        subject: viewerId === task.posterUserId ? { kind: 'offer_for_client', taskId: thread.taskId, offerId: offer.id } : { kind: 'task_for_helper', taskId: thread.taskId },
        masking: !booked,
        closed,
        ...(closed ? { closedReason } : {}),
      });
    }
  }
  return out;
}

function personOf(user: typeof users.$inferSelect): PersonSummary {
  return {
    id: user.id,
    displayName: user.name,
    initials: initialsOf(user.firstName, user.lastName),
    ...profilePhotoOf(user),
    memberSince: user.createdAt.toISOString(),
    phoneVerified: user.phoneVerifiedAt !== null,
  };
}

const isBlocked = isBlockedBetween;

function toView(row: typeof messages.$inferSelect, viewerId: string, masking: boolean, photos: Map<string, typeof files.$inferSelect>): MessageView {
  const sender: MessageView['sender'] = row.senderUserId === null ? 'system' : row.senderUserId === viewerId ? 'me' : 'them';
  return {
    id: row.id,
    sender,
    kind: row.kind as MessageView['kind'],
    // Your own words are never hidden from you.
    segments: row.kind === 'text' ? toMessageSegments(row.body, { mask: masking && sender !== 'me' }) : [],
    attachments: row.attachmentFileIds.flatMap((id) => {
      const file = photos.get(id);
      return file ? [photoFromFile(file)] : [];
    }),
    ...(row.event ? { event: row.event } : {}),
    createdAt: row.createdAt.toISOString(),
  };
}

type Summary = { summary: ThreadSummary; context: ThreadContext; other: typeof users.$inferSelect };

/**
 * The inbox rows for several threads, in their order: about eight queries however many threads there are (each
 * thread used to cost six of its own). A thread the viewer isn't in, or whose subject is gone, is left out.
 */
async function summariesOf(db: Db, list: ThreadRow[], viewerId: string, now: Date): Promise<Map<string, Summary>> {
  const out = new Map<string, Summary>();
  if (list.length === 0) return out;
  const threadIds = list.map((thread) => thread.id);
  const [contexts, people, latestRows, unreadRows] = await Promise.all([
    contextsOf(db, list, viewerId, now),
    db
      .select({ threadId: threadParticipants.threadId, lastReadAt: threadParticipants.lastReadAt, user: users })
      .from(threadParticipants)
      .innerJoin(users, eq(users.id, threadParticipants.userId))
      .where(inArray(threadParticipants.threadId, threadIds)),
    db.selectDistinctOn([messages.threadId]).from(messages).where(inArray(messages.threadId, threadIds)).orderBy(messages.threadId, desc(messages.createdAt)),
    // Messages from anyone else (or the system) since the viewer last read the thread.
    db
      .select({ threadId: messages.threadId, value: sql<number>`count(*)::int` })
      .from(messages)
      .innerJoin(threadParticipants, and(eq(threadParticipants.threadId, messages.threadId), eq(threadParticipants.userId, viewerId)))
      .where(
        and(
          inArray(messages.threadId, threadIds),
          or(isNull(messages.senderUserId), ne(messages.senderUserId, viewerId)),
          or(isNull(threadParticipants.lastReadAt), gt(messages.createdAt, threadParticipants.lastReadAt)),
        ),
      )
      .groupBy(messages.threadId),
  ]);
  const latestByThread = new Map(latestRows.map((row) => [row.threadId, row]));
  const unreadByThread = new Map(unreadRows.map((row) => [row.threadId, row.value]));
  for (const thread of list) {
    const context = contexts.get(thread.id);
    const here = people.filter((person) => person.threadId === thread.id);
    const viewer = here.find((person) => person.user.id === viewerId);
    const other = here.find((person) => person.user.id !== viewerId)?.user;
    if (!context || !other || !viewer) continue;
    const latest = latestByThread.get(thread.id);
    const latestView = latest ? toView(latest, viewerId, context.masking, new Map()) : null;
    out.set(thread.id, {
      summary: {
        id: thread.id,
        kind: thread.kind as ThreadKind,
        title: context.title,
        otherParty: personOf(other),
        subject: context.subject,
        ...(latestView
          ? {
              lastMessage: {
                sender: latestView.sender,
                kind: latestView.kind,
                preview: latestView.segments,
                ...(latestView.event ? { event: latestView.event } : {}),
                createdAt: latestView.createdAt,
              },
            }
          : {}),
        unreadCount: unreadByThread.get(thread.id) ?? 0,
        contactMasking: context.masking,
      },
      context,
      other,
    });
  }
  return out;
}

async function summaryOf(db: Db, thread: ThreadRow, viewerId: string, now: Date): Promise<Summary | null> {
  return (await summariesOf(db, [thread], viewerId, now)).get(thread.id) ?? null;
}

/** Messages (and booking updates) in the viewer's threads that they haven't read yet: the shell's badge. */
export async function unreadMessageCount(db: Db, userId: string): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(messages)
    .innerJoin(threadParticipants, and(eq(threadParticipants.threadId, messages.threadId), eq(threadParticipants.userId, userId)))
    .where(
      and(
        or(isNull(messages.senderUserId), ne(messages.senderUserId, userId)),
        or(isNull(threadParticipants.lastReadAt), gt(messages.createdAt, threadParticipants.lastReadAt)),
      ),
    );
  return row?.value ?? 0;
}

/** `/app/messages`: the viewer's threads with any messages, latest activity first. */
export async function getInbox(db: Db, userId: string, now: Date): Promise<InboxPageData> {
  const rows = await db
    .select({ thread: threads })
    .from(threadParticipants)
    .innerJoin(threads, eq(threads.id, threadParticipants.threadId))
    .where(eq(threadParticipants.userId, userId))
    .orderBy(desc(sql`coalesce(${threads.lastMessageAt}, ${threads.createdAt})`));
  const summaries = await summariesOf(db, rows.map(({ thread }) => thread), userId, now);
  const list = rows.flatMap(({ thread }) => { const found = summaries.get(thread.id); return found ? [found.summary] : []; });
  // Conversations waiting on the viewer first (audit M33), each group by latest activity (the query's order; sort is stable).
  return { threads: list.sort((a, b) => Number(b.unreadCount > 0) - Number(a.unreadCount > 0)) };
}

/**
 * Reading a conversation (opening it, or answering in it) reads its "sent you a message" notifications too (sweep
 * MN1). Unread messages in one thread make one notification (notifications/service.ts adds none while the thread
 * has an unread one), so an entry left unread after the person read the thread from its email or push link kept
 * every later message in it from reaching them, by any channel, until they tapped that old entry in the bell.
 */
async function readMessageNotifications(db: Writer, userId: string, threadId: string, now: Date): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: now })
    .where(and(eq(notifications.userId, userId), eq(notifications.type, 'message_received'), isNull(notifications.readAt), sql`${notifications.target}->>'threadId' = ${threadId}`));
}

/** One conversation for a participant (null for anyone else). Opening it marks it read. */
export async function getThreadPage(db: Db, userId: string, threadId: string, now: Date): Promise<ThreadPageData | null> {
  const [thread] = await db.select().from(threads).where(eq(threads.id, threadId)).limit(1);
  if (!thread) return null;
  const found = await summaryOf(db, thread, userId, now);
  if (!found) return null;
  const rows = (await db.select().from(messages).where(eq(messages.threadId, thread.id)).orderBy(desc(messages.createdAt)).limit(PAGE_SIZE)).reverse();
  const fileIds = [...new Set(rows.flatMap((row) => row.attachmentFileIds))];
  const photoRows = fileIds.length ? await db.select().from(files).where(inArray(files.id, fileIds)) : [];
  const photos = new Map(photoRows.map((file) => [file.id, file]));
  const participants = await db.select().from(threadParticipants).where(eq(threadParticipants.threadId, thread.id));
  const mine = participants.find((row) => row.userId === userId);
  const theirs = participants.find((row) => row.userId === found.other.id);
  await db.update(threadParticipants).set({ lastReadAt: now }).where(and(eq(threadParticipants.threadId, thread.id), eq(threadParticipants.userId, userId)));
  await readMessageNotifications(db, userId, thread.id, now);

  const blocked = await isBlocked(db, userId, found.other.id);
  // Mutual (WhatsApp's rule, completion plan 7.1): someone who hides their own activity doesn't see anyone
  // else's or "Seen", and reading their messages sends no "Seen" either.
  const [viewer] = await db.select({ showActivity: users.showActivity }).from(users).where(eq(users.id, userId)).limit(1);
  // Only once it's a real conversation (the research report's rule 10): a booking's or regular visits' thread,
  // or an offer or invite thread where both people have written. Any verified helper opens a thread by making
  // an offer, so a poster who never answered never shows their activity to them.
  const engaged = (thread.kind !== 'offer' && thread.kind !== 'invite') || (rows.some((row) => row.senderUserId === userId) && rows.some((row) => row.senderUserId === found.other.id));
  const mutual = engaged && !blocked && viewer?.showActivity !== false && found.other.showActivity;
  const presence = mutual ? presenceOf(found.other.lastActiveAt, true, now) : undefined;
  // "Seen" for the people whose messages were just read: a live notice, ids only.
  const newlyRead = rows.filter((row) => row.senderUserId && row.senderUserId !== userId && (!mine?.lastReadAt || row.createdAt > mine.lastReadAt));
  if (newlyRead.length > 0 && mutual) {
    const senders = [...new Set(newlyRead.map((row) => row.senderUserId!))];
    await publishNotices(db, senders.map((sender) => ({ channel: userChannel(sender), notice: { type: 'read', thread: thread.id } })));
  }
  const lastMine = [...rows].reverse().find((row) => row.senderUserId === userId);
  const disabledReason: ComposerDisabledReason | undefined = blocked ? 'blocked' : found.context.closed ? 'closed' : undefined;
  const closedReason = disabledReason === 'closed' ? found.context.closedReason : undefined;
  // Quotes (a replied-to message may be older than this page) and reactions, then the viewer's saved replies (7.3).
  const quotedIds = [...new Set(rows.flatMap((row) => (row.replyToMessageId ? [row.replyToMessageId] : [])))];
  const [quotedRows, reactionRows, replies] = await Promise.all([
    quotedIds.length ? db.select({ id: messages.id, body: messages.body, senderUserId: messages.senderUserId }).from(messages).where(and(inArray(messages.id, quotedIds), eq(messages.threadId, thread.id))) : Promise.resolve([]),
    rows.length ? db.select({ messageId: messageReactions.messageId, userId: messageReactions.userId, emoji: messageReactions.emoji }).from(messageReactions).where(inArray(messageReactions.messageId, rows.map((row) => row.id))) : Promise.resolve([]),
    listSavedReplies(db, userId),
  ]);
  const quoted = new Map(quotedRows.map((row) => [row.id, row]));
  const reactionsOf = (messageId: string) => {
    const mine = reactionRows.filter((row) => row.messageId === messageId);
    return MESSAGE_REACTIONS.flatMap((emoji) => {
      const given = mine.filter((row) => row.emoji === emoji);
      return given.length ? [{ emoji, count: given.length, mine: given.some((row) => row.userId === userId) }] : [];
    });
  };
  const withExtras = (row: typeof messages.$inferSelect) => {
    const view = toView(row, userId, found.context.masking, photos);
    const quote = row.replyToMessageId ? quoted.get(row.replyToMessageId) : undefined;
    const reactions = reactionsOf(row.id);
    return {
      ...view,
      ...(quote ? { replyTo: { id: quote.id, sender: quote.senderUserId === userId ? ('me' as const) : ('them' as const), segments: toMessageSegments(quote.body.length > 160 ? `${quote.body.slice(0, 157)}…` : quote.body, { mask: found.context.masking && quote.senderUserId !== userId }) } } : {}),
      ...(reactions.length ? { reactions } : {}),
    };
  };
  return {
    thread: { ...found.summary, unreadCount: 0 },
    messages: rows.map(withExtras),
    ...(replies.length ? { savedReplies: replies } : {}),
    ...(presence ? { presence } : {}),
    ...(mutual && lastMine && theirs?.lastReadAt && theirs.lastReadAt >= lastMine.createdAt ? { seenMessageId: lastMine.id } : {}),
    ...(newlyRead[0] ? { firstUnreadId: newlyRead[0].id } : {}),
    composer: {
      canSend: !disabledReason,
      ...(disabledReason ? { disabledReason } : {}),
      ...(closedReason ? { closedReason } : {}),
      maxLength: 2000,
      maxAttachments: 4,
      maxPhotoMegabytes: Math.round(MAX_PHOTO_BYTES / (1024 * 1024)),
    },
  };
}

export async function sendMessage(db: Db, userId: string, threadId: string, input: SendMessageInput, now: Date): Promise<ActionResult> {
  const parsed = sendMessageInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const [thread] = await db.select().from(threads).where(eq(threads.id, String(threadId))).limit(1);
  const found = thread ? await summaryOf(db, thread, userId, now) : null;
  if (!thread || !found) return { ok: false, code: 'not_found' };
  if (found.context.closed || (await isBlocked(db, userId, found.other.id))) return { ok: false, code: 'not_allowed' };
  const limited = await consumeRateLimit(db, `messages:${userId}`, SEND_RATE_LIMIT, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };

  // A reply quotes an earlier message of the same conversation (completion plan 7.3).
  let replyToMessageId: string | null = null;
  if (parsed.data.replyToId) {
    const [quoted] = await db.select({ id: messages.id }).from(messages).where(and(eq(messages.id, parsed.data.replyToId), eq(messages.threadId, thread.id), eq(messages.kind, 'text'))).limit(1);
    if (!quoted) return { ok: false, code: 'validation_failed', fieldErrors: { replyToId: ['invalid'] } };
    replyToMessageId = quoted.id;
  }

  const attachmentIds = [...new Set(parsed.data.attachmentIds)];
  if (attachmentIds.length > 0) {
    const owned = await db
      .select({ id: files.id })
      .from(files)
      .where(and(inArray(files.id, attachmentIds), eq(files.ownerUserId, userId), eq(files.kind, 'message')));
    if (owned.length !== attachmentIds.length) return { ok: false, code: 'validation_failed', fieldErrors: { attachmentIds: ['invalid'] } };
  }
  await db.insert(messages).values({ id: newId('msg'), threadId: thread.id, senderUserId: userId, kind: 'text', body: parsed.data.body, attachmentFileIds: attachmentIds, replyToMessageId, createdAt: now });
  const others = await db
    .select({ userId: threadParticipants.userId })
    .from(threadParticipants)
    .where(and(eq(threadParticipants.threadId, thread.id), ne(threadParticipants.userId, userId)));
  await db.insert(outboxEvents).values({
    id: newId('evt'),
    type: 'message.sent',
    aggregateType: 'thread',
    aggregateId: thread.id,
    payload: { threadId: thread.id, taskId: thread.taskId, senderUserId: userId, recipientIds: others.map((row) => row.userId) },
  });
  await db.update(threads).set({ lastMessageAt: now }).where(eq(threads.id, thread.id));
  await db.update(threadParticipants).set({ lastReadAt: now }).where(and(eq(threadParticipants.threadId, thread.id), eq(threadParticipants.userId, userId)));
  await readMessageNotifications(db, userId, thread.id, now);
  // A helper's answer may change how fast they usually reply (completion plan 7.12); never holds up the message.
  const [helper] = await db.select({ userId: helperProfiles.userId }).from(helperProfiles).where(eq(helperProfiles.userId, userId)).limit(1);
  if (helper) await recomputeResponseTime(db, userId, now).catch((error) => console.error('[messaging] response time', error));
  return { ok: true, code: 'sent' };
}

/** A reaction on a message (completion plan 7.3): the conversation's two people only, never across a block. */
export async function reactToMessage(db: Db, userId: string, threadId: string, input: { messageId: string; emoji: MessageReaction; on: boolean }, now: Date): Promise<ActionResult> {
  if (!(MESSAGE_REACTIONS as readonly string[]).includes(input.emoji)) return { ok: false, code: 'validation_failed' };
  const [thread] = await db.select().from(threads).where(eq(threads.id, String(threadId))).limit(1);
  const found = thread ? await summaryOf(db, thread, userId, now) : null;
  if (!thread || !found) return { ok: false, code: 'not_found' };
  if (await isBlocked(db, userId, found.other.id)) return { ok: false, code: 'not_allowed' };
  const [message] = await db.select({ id: messages.id }).from(messages).where(and(eq(messages.id, String(input.messageId)), eq(messages.threadId, thread.id), eq(messages.kind, 'text'))).limit(1);
  if (!message) return { ok: false, code: 'not_found' };
  if (input.on) await db.insert(messageReactions).values({ messageId: message.id, userId, emoji: input.emoji, createdAt: now }).onConflictDoNothing();
  else await db.delete(messageReactions).where(and(eq(messageReactions.messageId, message.id), eq(messageReactions.userId, userId), eq(messageReactions.emoji, input.emoji)));
  // The other person's open conversation shows it at once (ids only).
  await publishNotices(db, [{ channel: userChannel(found.other.id), notice: { type: 'update', event: 'message.reacted', thread: thread.id } }]);
  return { ok: true, code: 'updated' };
}

export async function listSavedReplies(db: Db, userId: string) {
  return db.select({ id: savedReplies.id, title: savedReplies.title, body: savedReplies.body }).from(savedReplies).where(eq(savedReplies.userId, userId)).orderBy(asc(savedReplies.createdAt)).limit(MESSAGE_SAVED_REPLY_MAX);
}

export async function saveReply(db: Db, userId: string, input: MessageSavedReplyInput, now: Date): Promise<ActionResult> {
  const parsed = messageSavedReplyInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const [mine] = await db.select({ value: count() }).from(savedReplies).where(eq(savedReplies.userId, userId));
  if (Number(mine?.value ?? 0) >= MESSAGE_SAVED_REPLY_MAX) return { ok: false, code: 'limit_reached' };
  await db.insert(savedReplies).values({ id: newId('srp'), userId, title: parsed.data.title, body: parsed.data.body, createdAt: now, updatedAt: now });
  return { ok: true, code: 'saved' };
}

export async function deleteReply(db: Db, userId: string, id: string): Promise<ActionResult> {
  const deleted = await db.delete(savedReplies).where(and(eq(savedReplies.id, String(id)), eq(savedReplies.userId, userId))).returning({ id: savedReplies.id });
  return deleted.length ? { ok: true, code: 'updated' } : { ok: false, code: 'not_found' };
}

/** When each person last said they were typing in a thread (this server only; it only spaces the notices out). */
const typingSentAt = new Map<string, number>();
const TYPING_EVERY_MS = 2500;

/**
 * "Typing…" (completion plan 7.1): a live notice to the thread's other participants, at most one every 2.5 s
 * per person and thread. Ephemeral: never stored and never an outbox event. Only a participant sends one, and
 * blocked pairs get nothing.
 */
export async function notifyTyping(db: Db, userId: string, threadId: string, now: Date): Promise<'sent' | 'throttled' | 'not_found'> {
  const key = `${userId}:${threadId}`;
  if (now.getTime() - (typingSentAt.get(key) ?? 0) < TYPING_EVERY_MS) return 'throttled';
  const participants = await db.select({ userId: threadParticipants.userId }).from(threadParticipants).where(eq(threadParticipants.threadId, threadId));
  if (!participants.some((row) => row.userId === userId)) return 'not_found';
  typingSentAt.set(key, now.getTime());
  if (typingSentAt.size > 10_000) {
    for (const [entry, at] of typingSentAt) if (now.getTime() - at > 60_000) typingSentAt.delete(entry);
  }
  const envelopes = [];
  for (const { userId: other } of participants) {
    if (other === userId || (await isBlockedBetween(db, userId, other))) continue;
    envelopes.push({ channel: userChannel(other), notice: { type: 'typing', thread: threadId } });
  }
  await publishNotices(db, envelopes);
  return 'sent';
}

// ---- Threads for offers and bookings ------------------------------------------------------------------

/** The offer's thread (client and helper), for "Message helper" and "Message the client". */
export async function offerThreadId(db: Db, offerId: string, now: Date): Promise<string | null> {
  const [row] = await db
    .select({ offerId: offers.id, taskId: offers.taskId, helperUserId: offers.helperUserId, posterUserId: tasks.posterUserId })
    .from(offers)
    .innerJoin(tasks, eq(tasks.id, offers.taskId))
    .where(eq(offers.id, offerId))
    .limit(1);
  if (!row) return null;
  return ensureThread(db, { kind: 'offer', linkedId: row.offerId, taskId: row.taskId, participantIds: [row.posterUserId, row.helperUserId] }, now);
}

/** The booking's link for its thread. */
/** A booking's conversation: its own, or, for a visit of regular visits, the series' one (all visits share it). */
export function bookingThreadLink(booking: { id: string; taskId: string; posterUserId: string; helperUserId: string; seriesId?: string | null }): ThreadLink {
  if (booking.seriesId) return { kind: 'series', linkedId: booking.seriesId, taskId: booking.taskId, participantIds: [booking.posterUserId, booking.helperUserId] };
  return { kind: 'booking', linkedId: booking.id, taskId: booking.taskId, participantIds: [booking.posterUserId, booking.helperUserId] };
}

/** The conversation of regular visits. */
export function seriesThreadLink(series: { id: string; templateTaskId: string; posterUserId: string; helperUserId: string }): ThreadLink {
  return { kind: 'series', linkedId: series.id, taskId: series.templateTaskId, participantIds: [series.posterUserId, series.helperUserId] };
}

/** Who may see a message photo: the people in its thread. */
export async function canViewMessageFile(db: Db, fileId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: messages.id })
    .from(messages)
    .innerJoin(threadParticipants, and(eq(threadParticipants.threadId, messages.threadId), eq(threadParticipants.userId, userId)))
    .where(sql`${messages.attachmentFileIds} @> ${JSON.stringify([fileId])}::jsonb`)
    .limit(1);
  return Boolean(row);
}
