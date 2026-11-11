import { and, desc, eq, gt, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import type {
  ActionResult,
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
import { sendMessageInputSchema } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { bookings } from '@/modules/bookings/schema';
import { MAX_PHOTO_BYTES, photoFromFile } from '@/modules/files/uploads';
import { offers } from '@/modules/offers/schema';
import { initialsOf } from '@/modules/profiles/queries';
import { files, tasks } from '@/modules/tasks/schema';
import { toMessageSegments } from '@/modules/trust/message-segments';
import { validationFailed } from '@/platform/actions/results';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { consumeRateLimit } from '@/platform/rate-limit';
import { blocks, messages, threadParticipants, threads } from './schema';

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

/** A booking update or notice in a thread ("Jordan is on the way"). */
export async function postEvent(db: Writer, link: ThreadLink, kind: 'status' | 'system', event: Pick<TimelineEvent, 'type' | 'params'>, now: Date): Promise<void> {
  const threadId = await ensureThread(db, link, now);
  await db.insert(messages).values({ id: newId('msg'), threadId, kind, event, createdAt: now });
  await db.update(threads).set({ lastMessageAt: now }).where(eq(threads.id, threadId));
}

// ---- What each thread is about ----------------------------------------------------------------------

interface ThreadContext {
  title: string;
  subject: ThreadSubject;
  /** Contact details stay hidden until a booking between the two is confirmed. */
  masking: boolean;
  closed: boolean;
}

async function contextOf(db: Db, thread: ThreadRow, viewerId: string, now: Date): Promise<ThreadContext | null> {
  const [task] = await db.select({ title: tasks.title, posterUserId: tasks.posterUserId }).from(tasks).where(eq(tasks.id, thread.taskId)).limit(1);
  if (!task) return null;
  if (thread.kind === 'booking') {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, thread.linkedId)).limit(1);
    if (!booking) return null;
    const endedAt = booking.status === 'completed' ? booking.completedAt : booking.status === 'canceled' ? booking.canceledAt : null;
    const keepOpenDays = booking.status === 'completed' ? 30 : 7;
    return {
      title: task.title,
      subject: { kind: 'booking', bookingId: booking.id },
      masking: booking.status === 'pending_funding',
      closed: endedAt !== null && now.getTime() > endedAt.getTime() + keepOpenDays * DAY,
    };
  }
  if (thread.kind === 'offer') {
    const [offer] = await db.select().from(offers).where(eq(offers.id, thread.linkedId)).limit(1);
    if (!offer) return null;
    const [booked] = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.offerId, offer.id), inArray(bookings.status, LIVE_BOOKING_STATUSES)))
      .limit(1);
    const open = ['pending', 'stale'].includes(offer.status) && offer.expiresAt > now;
    return {
      title: task.title,
      subject: viewerId === task.posterUserId ? { kind: 'offer_for_client', taskId: thread.taskId, offerId: offer.id } : { kind: 'task_for_helper', taskId: thread.taskId },
      masking: !booked,
      closed: !open && !booked,
    };
  }
  return null;
}

function personOf(user: typeof users.$inferSelect): PersonSummary {
  return {
    id: user.id,
    displayName: user.name,
    initials: initialsOf(user.firstName, user.lastName),
    memberSince: user.createdAt.toISOString(),
    phoneVerified: user.phoneVerifiedAt !== null,
  };
}

async function otherParticipant(db: Db, threadId: string, viewerId: string) {
  const [row] = await db
    .select({ user: users })
    .from(threadParticipants)
    .innerJoin(users, eq(users.id, threadParticipants.userId))
    .where(and(eq(threadParticipants.threadId, threadId), ne(threadParticipants.userId, viewerId)))
    .limit(1);
  return row?.user ?? null;
}

async function isBlocked(db: Db, a: string, b: string): Promise<boolean> {
  const [row] = await db
    .select({ blockerId: blocks.blockerId })
    .from(blocks)
    .where(or(and(eq(blocks.blockerId, a), eq(blocks.blockedId, b)), and(eq(blocks.blockerId, b), eq(blocks.blockedId, a))))
    .limit(1);
  return Boolean(row);
}

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

async function summaryOf(db: Db, thread: ThreadRow, viewerId: string, now: Date): Promise<{ summary: ThreadSummary; context: ThreadContext; other: typeof users.$inferSelect } | null> {
  const [context, other, participant] = await Promise.all([
    contextOf(db, thread, viewerId, now),
    otherParticipant(db, thread.id, viewerId),
    db
      .select({ lastReadAt: threadParticipants.lastReadAt })
      .from(threadParticipants)
      .where(and(eq(threadParticipants.threadId, thread.id), eq(threadParticipants.userId, viewerId)))
      .limit(1),
  ]);
  if (!context || !other || participant.length === 0) return null;
  const lastReadAt = participant[0]!.lastReadAt;
  const [latest] = await db.select().from(messages).where(eq(messages.threadId, thread.id)).orderBy(desc(messages.createdAt)).limit(1);
  const unread = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(messages)
    .where(
      and(
        eq(messages.threadId, thread.id),
        or(isNull(messages.senderUserId), ne(messages.senderUserId, viewerId)),
        lastReadAt ? gt(messages.createdAt, lastReadAt) : sql`true`,
      ),
    );
  const latestView = latest ? toView(latest, viewerId, context.masking, new Map()) : null;
  return {
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
      unreadCount: unread[0]?.value ?? 0,
      contactMasking: context.masking,
    },
    context,
    other,
  };
}

/** `/app/messages`: the viewer's threads with any messages, latest activity first. */
export async function getInbox(db: Db, userId: string, now: Date): Promise<InboxPageData> {
  const rows = await db
    .select({ thread: threads })
    .from(threadParticipants)
    .innerJoin(threads, eq(threads.id, threadParticipants.threadId))
    .where(eq(threadParticipants.userId, userId))
    .orderBy(desc(sql`coalesce(${threads.lastMessageAt}, ${threads.createdAt})`));
  const summaries = await Promise.all(rows.map(({ thread }) => summaryOf(db, thread, userId, now)));
  return { threads: summaries.flatMap((item) => (item ? [item.summary] : [])) };
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
  await db.update(threadParticipants).set({ lastReadAt: now }).where(and(eq(threadParticipants.threadId, thread.id), eq(threadParticipants.userId, userId)));

  const blocked = await isBlocked(db, userId, found.other.id);
  const disabledReason: ComposerDisabledReason | undefined = blocked ? 'blocked' : found.context.closed ? 'closed' : undefined;
  return {
    thread: { ...found.summary, unreadCount: 0 },
    messages: rows.map((row) => toView(row, userId, found.context.masking, photos)),
    composer: {
      canSend: !disabledReason,
      ...(disabledReason ? { disabledReason } : {}),
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

  const attachmentIds = [...new Set(parsed.data.attachmentIds)];
  if (attachmentIds.length > 0) {
    const owned = await db
      .select({ id: files.id })
      .from(files)
      .where(and(inArray(files.id, attachmentIds), eq(files.ownerUserId, userId), eq(files.kind, 'message')));
    if (owned.length !== attachmentIds.length) return { ok: false, code: 'validation_failed', fieldErrors: { attachmentIds: ['invalid'] } };
  }
  await db.insert(messages).values({ id: newId('msg'), threadId: thread.id, senderUserId: userId, kind: 'text', body: parsed.data.body, attachmentFileIds: attachmentIds, createdAt: now });
  await db.update(threads).set({ lastMessageAt: now }).where(eq(threads.id, thread.id));
  await db.update(threadParticipants).set({ lastReadAt: now }).where(and(eq(threadParticipants.threadId, thread.id), eq(threadParticipants.userId, userId)));
  return { ok: true, code: 'sent' };
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
export function bookingThreadLink(booking: { id: string; taskId: string; posterUserId: string; helperUserId: string }): ThreadLink {
  return { kind: 'booking', linkedId: booking.id, taskId: booking.taskId, participantIds: [booking.posterUserId, booking.helperUserId] };
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
