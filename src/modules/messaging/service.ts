import { helperProfiles } from '@/modules/profiles/schema';
import { recomputeResponseTime } from '@/modules/profiles/response-time';
import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, ne, not, or, sql } from 'drizzle-orm';
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
import { usernames, users } from '@/modules/accounts/schema';
import { bookingSeries, bookings } from '@/modules/bookings/schema';
import { MAX_PHOTO_BYTES, photoFromFile } from '@/modules/files/uploads';
import { profilePhotoOf } from '@/modules/files/photos';
import { notifications } from '@/modules/notifications/schema';
import { declinedByCancel } from '@/modules/offers/closing';
import { offers } from '@/modules/offers/schema';
import { files, tasks } from '@/modules/tasks/schema';
import { isBlockedBetween } from '@/modules/trust/blocks';
import { shortenSegments, toMessageSegments, type Mentions } from '@/modules/trust/message-segments';
import { validationFailed } from '@/platform/actions/results';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { violatedConstraint } from '@/platform/db/errors';
import { outboxEvents } from '@/platform/outbox/schema';
import { consumeRateLimit } from '@/platform/rate-limit';
import { userChannel } from '@/platform/realtime/hub';
import { publishNotices } from '@/platform/realtime/publish';
import { presenceOf } from '@/modules/realtime/presence';
import { firstMessagesLeft } from './direct-rules';
import { mentionsOf } from './mentions';
import { noteSampleRecipient } from './samples';
import { CATCH_UP_UNREAD, chatAssistOffered } from './assist';
import { cardsFor } from './cards';
import { recipientQuietUntil } from '@/modules/notifications/own-quiet-hours';
import { thanksPanelFor } from '@/modules/thanks/views';
import { requestOptionsFor } from './asks';
import { shareableSlotsFor } from './times';
import { bookingChatToolsOf } from '@/modules/bookings/chat-tools';
import { allowedChangeTypes } from '@/modules/bookings/changes-domain';
import { isSampleId, samplesHiddenInThisBuild } from '@/shared/sample-data';
import { messageReactions, messages, savedReplies, threadParticipants, threads } from './schema';
import { deletedLabelFor, shownPerson } from '@/modules/accounts/shown-name';
import { sparksSummaryOf } from '@/modules/sparks/service';

/**
 * Threads between the two people on an offer or a booking (blueprint 02 J2 step 6, 06, 08). Bodies are
 * stored as written and masked when shown until a booking between them is confirmed. Threads are made
 * when first needed (opening "Message", a booking update).
 */

const DAY = 86_400_000;
export const SEND_RATE_LIMIT = { limit: 60, windowSeconds: 3600 };
/** Each reaction tells the other person at once: a person's pace, not a script's (security review SEC21). */
const REACTION_RATE_LIMIT = { limit: 60, windowSeconds: 60 };
const PAGE_SIZE = 100;
/** The most one page of a conversation shows, the latest ones, however far back "Load earlier messages" went. */
const MAX_SHOWN = 1_000;
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
  const taskIds = [...new Set(list.flatMap((thread) => (thread.taskId ? [thread.taskId] : [])))];
  const [taskRows, bookingRows, seriesRows, lastVisits, offerRows, bookedRows, direct] = await Promise.all([
    taskIds.length ? db.select({ id: tasks.id, title: tasks.title, posterUserId: tasks.posterUserId, status: tasks.status }).from(tasks).where(inArray(tasks.id, taskIds)) : [],
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
    directPeopleOf(db, list, viewerId),
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
    if (thread.kind === 'direct') {
      // Two people, no task (2026-11-21): titled with the other person; open while both accounts are; contact details
      // hidden until the two have a paid booking together.
      const otherId = otherOfPair(thread.linkedId, viewerId);
      const other = otherId ? direct.people.get(otherId) : undefined;
      if (!otherId || !other) continue;
      out.set(thread.id, {
        title: other.name,
        subject: { kind: 'person', ...(other.handle ? { helperHandle: other.handle } : {}), canRequest: other.bookable },
        masking: !direct.paidWith.has(otherId),
        closed: false,
      });
      continue;
    }
    const task = thread.taskId ? taskById.get(thread.taskId) : undefined;
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
        subject: viewerId === task.posterUserId ? { kind: 'offer_for_client', taskId: task.id, offerId: offer.id } : { kind: 'task_for_helper', taskId: task.id },
        masking: !booked,
        closed,
        ...(closed ? { closedReason } : {}),
      });
    }
  }
  return out;
}

/**
 * A message request for the viewer (2026-11-23): a direct conversation someone else started that they haven't accepted
 * or answered (`accepted_at` stays null until then; it's set at once for someone they've talked to about a task).
 */
function isRequestFor(thread: ThreadRow, participant: { acceptedAt: Date | null }, viewerId: string): boolean {
  return thread.kind === 'direct' && participant.acceptedAt === null && thread.startedByUserId !== viewerId;
}

/** `isRequestFor` in SQL, for a query that joins `threads` and the viewer's `thread_participants` row. */
function requestCondition(viewerId: string) {
  return sql`(${threads.kind} = 'direct' and ${threadParticipants.acceptedAt} is null and ${threads.startedByUserId} is distinct from ${viewerId})`;
}

/**
 * Whether contact details are hidden in a conversation for the viewer (until a paid booking between the two), or null
 * when it isn't theirs (2026-11-23: a conversation's search sees what the viewer sees).
 */
export async function maskingFor(db: Db, viewerId: string, threadId: string, now: Date): Promise<boolean | null> {
  const [thread] = await db.select().from(threads).where(eq(threads.id, threadId)).limit(1);
  const found = thread ? await summaryOf(db, thread, viewerId, now) : null;
  return found ? found.context.masking : null;
}

/** The other person of a direct conversation's pair key (`directPairKey`), when the viewer is one of the two. */
function otherOfPair(linkedId: string, viewerId: string): string | undefined {
  const [a, b] = linkedId.split(':');
  if (!a || !b) return undefined;
  return a === viewerId ? b : b === viewerId ? a : undefined;
}

/**
 * The other people of the viewer's direct conversations: their name, helper handle (and whether their profile is
 * live, for "Send a task request"), and which of them the viewer has a paid booking with (contact details show then).
 */
async function directPeopleOf(db: Db, list: ThreadRow[], viewerId: string) {
  const others = [...new Set(list.flatMap((thread) => (thread.kind === 'direct' ? [otherOfPair(thread.linkedId, viewerId)] : [])).filter((id): id is string => Boolean(id)))];
  const people = new Map<string, { name: string; handle?: string; bookable: boolean }>();
  const paidWith = new Set<string>();
  if (others.length === 0) return { people, paidWith };
  const [rows, paid] = await Promise.all([
    db.select({ id: users.id, name: users.name, handle: helperProfiles.handle, profileStatus: helperProfiles.status }).from(users).leftJoin(helperProfiles, eq(helperProfiles.userId, users.id)).where(inArray(users.id, others)),
    db
      .selectDistinct({ posterUserId: bookings.posterUserId, helperUserId: bookings.helperUserId })
      .from(bookings)
      .where(and(isNotNull(bookings.confirmedAt), or(and(eq(bookings.posterUserId, viewerId), inArray(bookings.helperUserId, others)), and(eq(bookings.helperUserId, viewerId), inArray(bookings.posterUserId, others))))),
  ]);
  for (const row of rows) people.set(row.id, { name: row.name, ...(row.handle ? { handle: row.handle } : {}), bookable: row.profileStatus === 'active' && row.id !== viewerId });
  for (const row of paid) paidWith.add(row.posterUserId === viewerId ? row.helperUserId : row.posterUserId);
  return { people, paidWith };
}

/**
 * A direct conversation's first messages (2026-11-21): what the viewer can still send before the other person
 * answers (`firstMessagesLeft`), or null once they have, for the person who didn't start it, and for other threads.
 */
export async function directFirstMessagesLeft(db: Db, thread: ThreadRow, viewerId: string): Promise<number | null> {
  if (thread.kind !== 'direct' || thread.startedByUserId !== viewerId) return null;
  const rows = await db
    .select({ senderUserId: messages.senderUserId, value: sql<number>`count(*)::int` })
    .from(messages)
    .where(and(eq(messages.threadId, thread.id), eq(messages.kind, 'text')))
    .groupBy(messages.senderUserId);
  const viewerSent = rows.find((row) => row.senderUserId === viewerId)?.value ?? 0;
  const otherSent = rows.filter((row) => row.senderUserId !== null && row.senderUserId !== viewerId).reduce((sum, row) => sum + row.value, 0);
  return firstMessagesLeft({ viewerStarted: true, viewerSent, otherSent });
}

/** `deletedLabel`: the reader's "Deleted account" (shown-name.ts), for someone whose account was deleted (J-PR15). */
function personOf(user: typeof users.$inferSelect, deletedLabel?: string, username?: string | null): PersonSummary {
  return {
    id: user.id,
    ...shownPerson(user, deletedLabel),
    ...profilePhotoOf(user),
    memberSince: user.createdAt.toISOString(),
    phoneVerified: user.phoneVerifiedAt !== null,
    // Their @username (2026-11-22), never a deleted account's.
    ...(username && user.status !== 'deleted' ? { username } : {}),
  };
}

const isBlocked = isBlockedBetween;

/** `mentions`: the people the conversation's texts name by @username (`mentionsOf`). */
function toView(row: typeof messages.$inferSelect, viewerId: string, masking: boolean, photos: Map<string, typeof files.$inferSelect>, mentions?: Mentions): MessageView {
  const sender: MessageView['sender'] = row.senderUserId === null ? 'system' : row.senderUserId === viewerId ? 'me' : 'them';
  return {
    id: row.id,
    sender,
    kind: row.kind as MessageView['kind'],
    // Your own words are never hidden from you.
    segments: row.kind === 'text' ? toMessageSegments(row.body, { mask: masking && sender !== 'me', ...(mentions ? { mentions } : {}) }) : [],
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
      .select({
        threadId: threadParticipants.threadId,
        lastReadAt: threadParticipants.lastReadAt,
        pinnedAt: threadParticipants.pinnedAt,
        archivedAt: threadParticipants.archivedAt,
        acceptedAt: threadParticipants.acceptedAt,
        muted: threadParticipants.muted,
        user: users,
        username: usernames.username,
      })
      .from(threadParticipants)
      .innerJoin(users, eq(users.id, threadParticipants.userId))
      .leftJoin(usernames, eq(usernames.userId, users.id))
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
  const [deletedLabel, mentions] = await Promise.all([deletedLabelFor(people.map((person) => person.user)), mentionsOf(db, latestRows.map((row) => (row.kind === 'text' ? row.body : '')), viewerId)]);
  for (const thread of list) {
    const context = contexts.get(thread.id);
    const here = people.filter((person) => person.threadId === thread.id);
    const viewer = here.find((person) => person.user.id === viewerId);
    const otherRow = here.find((person) => person.user.id !== viewerId);
    const other = otherRow?.user;
    if (!context || !other || !viewer) continue;
    const latest = latestByThread.get(thread.id);
    const latestView = latest ? toView(latest, viewerId, context.masking, new Map(), mentions) : null;
    out.set(thread.id, {
      summary: {
        id: thread.id,
        kind: thread.kind as ThreadKind,
        title: context.title,
        otherParty: personOf(other, deletedLabel, otherRow?.username),
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
        // A sample profile of the demo marketplace, where they're told apart (2026-11-23).
        ...(samplesHiddenInThisBuild() && isSampleId(other.id) ? { sample: true } : {}),
        // The viewer's own list (2026-11-23).
        ...(viewer.pinnedAt ? { pinned: true } : {}),
        ...(viewer.muted ? { muted: true } : {}),
        ...(viewer.archivedAt ? { archived: true } : {}),
        ...(isRequestFor(thread, viewer, viewerId) ? { request: true } : {}),
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

/**
 * Messages (and booking updates) in the viewer's threads that they haven't read yet: the shell's badge. Not in muted
 * conversations or message requests (2026-11-23): those show their own counts in Messages.
 */
export async function unreadMessageCount(db: Db, userId: string): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(messages)
    .innerJoin(threadParticipants, and(eq(threadParticipants.threadId, messages.threadId), eq(threadParticipants.userId, userId)))
    .innerJoin(threads, eq(threads.id, messages.threadId))
    .where(
      and(
        or(isNull(messages.senderUserId), ne(messages.senderUserId, userId)),
        or(isNull(threadParticipants.lastReadAt), gt(messages.createdAt, threadParticipants.lastReadAt)),
        eq(threadParticipants.muted, false),
        not(requestCondition(userId)),
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
  // Pinned ones on top (2026-11-23), then conversations waiting on the viewer (audit M33), each group by latest activity
  // (the query's order; sort is stable).
  return { threads: list.sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || Number(b.unreadCount > 0) - Number(a.unreadCount > 0)) };
}

/**
 * Reading a conversation (opening it, or answering in it) reads its "sent you a message" notifications too (sweep
 * MN1). Unread messages in one thread make one notification (notifications/service.ts adds none while the thread
 * has an unread one), so an entry left unread after the person read the thread from its email or push link kept
 * every later message in it from reaching them, by any channel, until they tapped that old entry in the bell.
 */
async function readMessageNotifications(db: Writer, userId: string, threadId: string, now: Date): Promise<number> {
  const read = await db
    .update(notifications)
    .set({ readAt: now })
    .where(and(eq(notifications.userId, userId), eq(notifications.type, 'message_received'), isNull(notifications.readAt), sql`${notifications.target}->>'threadId' = ${threadId}`))
    .returning({ id: notifications.id });
  return read.length;
}

/**
 * The reader's own pages hear that they read a conversation (sweep MN6): the Messages and bell badges live in the
 * signed-in shell, which stays mounted from page to page, and on the person's other devices. Only when something was
 * unread, so the page that refreshes on it doesn't send another.
 */
async function noticeReadByReader(db: Db, userId: string, threadId: string, unreadBefore: number, notificationsRead: number): Promise<void> {
  if (unreadBefore === 0 && notificationsRead === 0) return;
  await publishNotices(db, [{ channel: userChannel(userId), notice: { type: 'read', thread: threadId } }]);
}

/**
 * A conversation's order is by time, then id (status lines can share a moment), compared in the database at its full
 * precision: the messages from message `id` on, and those before it.
 */
const fromMessage = (id: string) => sql`(${messages.createdAt}, ${messages.id}) >= (select m.created_at, m.id from ${messages} m where m.id = ${id})`;
const beforeMessage = (id: string) => sql`(${messages.createdAt}, ${messages.id}) < (select m.created_at, m.id from ${messages} m where m.id = ${id})`;

/**
 * One conversation for a participant (null for anyone else). Opening it marks it read. It shows the latest 100 messages,
 * or, after "Load earlier messages" (`from`, a message of it: sweep MN11), everything from that message on, up to the
 * latest 1,000; `earlier` says where the 100 before the first one shown start.
 */
export async function getThreadPage(db: Db, userId: string, threadId: string, now: Date, page: { from?: string } = {}): Promise<ThreadPageData | null> {
  const [thread] = await db.select().from(threads).where(eq(threads.id, threadId)).limit(1);
  if (!thread) return null;
  const found = await summaryOf(db, thread, userId, now);
  if (!found) return null;
  // Another conversation's message, or none: the latest page, as without one.
  const [from] = page.from ? await db.select({ id: messages.id }).from(messages).where(and(eq(messages.id, String(page.from)), eq(messages.threadId, thread.id))).limit(1) : [];
  const rows = (
    await db
      .select()
      .from(messages)
      .where(and(eq(messages.threadId, thread.id), ...(from ? [fromMessage(from.id)] : [])))
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(from ? MAX_SHOWN : PAGE_SIZE)
  ).reverse();
  const earlier = rows[0]
    ? (await db.select({ id: messages.id }).from(messages).where(and(eq(messages.threadId, thread.id), beforeMessage(rows[0].id))).orderBy(desc(messages.createdAt), desc(messages.id)).limit(PAGE_SIZE)).at(-1)
    : undefined;
  const fileIds = [...new Set(rows.flatMap((row) => row.attachmentFileIds))];
  const photoRows = fileIds.length ? await db.select().from(files).where(inArray(files.id, fileIds)) : [];
  const photos = new Map(photoRows.map((file) => [file.id, file]));
  const participants = await db.select().from(threadParticipants).where(eq(threadParticipants.threadId, thread.id));
  const mine = participants.find((row) => row.userId === userId);
  const theirs = participants.find((row) => row.userId === found.other.id);
  await db.update(threadParticipants).set({ lastReadAt: now }).where(and(eq(threadParticipants.threadId, thread.id), eq(threadParticipants.userId, userId)));
  await noticeReadByReader(db, userId, thread.id, found.summary.unreadCount, await readMessageNotifications(db, userId, thread.id, now));

  const [blocked, otherSparks] = await Promise.all([isBlocked(db, userId, found.other.id), sparksSummaryOf(db, found.other.id)]);
  // Mutual (WhatsApp's rule, completion plan 7.1): someone who hides their own activity doesn't see anyone
  // else's or "Seen", and reading their messages sends no "Seen" either.
  const [viewer] = await db.select({ showActivity: users.showActivity, locale: users.locale }).from(users).where(eq(users.id, userId)).limit(1);
  // Only once it's a real conversation (the research report's rule 10): a booking's or regular visits' thread,
  // or an offer or invite thread where both people have written. Any verified helper opens a thread by making
  // an offer, so a poster who never answered never shows their activity to them.
  const engaged = (thread.kind !== 'offer' && thread.kind !== 'invite' && thread.kind !== 'direct') || (rows.some((row) => row.senderUserId === userId) && rows.some((row) => row.senderUserId === found.other.id));
  const mutual = engaged && !blocked && viewer?.showActivity !== false && found.other.showActivity;
  const presence = mutual ? presenceOf(found.other.lastActiveAt, true, now) : undefined;
  // "Seen" for the people whose messages were just read: a live notice, ids only.
  const newlyRead = rows.filter((row) => row.senderUserId && row.senderUserId !== userId && (!mine?.lastReadAt || row.createdAt > mine.lastReadAt));
  if (newlyRead.length > 0 && mutual) {
    const senders = [...new Set(newlyRead.map((row) => row.senderUserId!))];
    await publishNotices(db, senders.map((sender) => ({ channel: userChannel(sender), notice: { type: 'read', thread: thread.id } })));
  }
  const lastMine = [...rows].reverse().find((row) => row.senderUserId === userId);
  const assist = chatAssistOffered();
  // Task requests, booking changes and asks for an offer its lines show as cards, as they are now (2026-11-23).
  const cards = await cardsFor(db, userId, rows, now, found.other.id);
  // A direct conversation's "+" menu: Request a task, Ask for an offer, Make an offer on their task (2026-11-23).
  const requestOptions = thread.kind === 'direct' && found.other.status !== 'deleted' ? await requestOptionsFor(db, userId, found.other.id, found.summary.subject, now) : null;
  // A deleted account reads nothing (privacy rehearsal J-PR8): the conversation reads as closed, with no reason that
  // points a way on (no offer to request again, no booking to write about).
  const otherGone = found.other.status === 'deleted';
  // A direct conversation the viewer started: a few messages until the other person answers (2026-11-21).
  const firstLeft = await directFirstMessagesLeft(db, thread, userId);
  const disabledReason: ComposerDisabledReason | undefined = blocked ? 'blocked' : otherGone || found.context.closed ? 'closed' : firstLeft === 0 ? 'awaiting_reply' : undefined;
  const closedReason = disabledReason === 'closed' && !otherGone ? found.context.closedReason : undefined;
  // Share times from the "+" (2026-11-24): a helper's open slots, in a direct conversation or their open offer's.
  const shareable = !disabledReason && (thread.kind === 'direct' || thread.kind === 'offer') ? await shareableSlotsFor(db, userId, thread, now) : [];
  const options = requestOptions || shareable.length ? { ...(requestOptions ?? { myOpenTasks: [], theirOpenTasks: [] }), ...(shareable.length ? { shareableSlots: shareable } : {}) } : null;
  // A booking's conversation (2026-11-24): "What we agreed" on top, and the day-of updates the viewer can send now.
  const bookingTools = thread.kind === 'booking' ? await bookingChatToolsOf(db, userId, thread.linkedId, found.summary.title, now) : null;
  // A booking that can still change: "Propose a change" from its conversation.
  // Price and scope can change while it's confirmed or under way (bookings/changes-domain.ts); the dialog says what else.
  const [changeable] = thread.kind === 'booking' && !disabledReason ? await db.select({ status: bookings.status }).from(bookings).where(eq(bookings.id, thread.linkedId)).limit(1) : [];
  // The other person's quiet hours (2026-11-24): a note above the message box while a new message would reach only their
  // app. Only when they turned them on, and never when the booking is today or within 12 hours (those notify as usual).
  const quietUntil = !disabledReason ? await recipientQuietUntil(db, found.other.id, thread.id, now) : null;
  // A completed booking's thank-you note (2026-11-24): the client's "Send a thank-you note" above the message box.
  const [thanksBooking] = thread.kind === 'booking' && !otherGone ? await db.select({ id: bookings.id, status: bookings.status, posterUserId: bookings.posterUserId, helperUserId: bookings.helperUserId, confirmedAt: bookings.confirmedAt }).from(bookings).where(eq(bookings.id, thread.linkedId)).limit(1) : [];
  const thanks = thanksBooking && !blocked ? await thanksPanelFor(db, userId, thanksBooking, now) : null;
  const canProposeChange = changeable ? allowedChangeTypes({ status: changeable.status, pricingType: 'fixed', startAt: now, now }).length > 0 : false;
  // Quotes (a replied-to message may be older than this page) and reactions, then the viewer's saved replies (7.3).
  const quotedIds = [...new Set(rows.flatMap((row) => (row.replyToMessageId ? [row.replyToMessageId] : [])))];
  const [quotedRows, reactionRows, replies] = await Promise.all([
    quotedIds.length ? db.select({ id: messages.id, body: messages.body, senderUserId: messages.senderUserId }).from(messages).where(and(inArray(messages.id, quotedIds), eq(messages.threadId, thread.id))) : Promise.resolve([]),
    rows.length ? db.select({ messageId: messageReactions.messageId, userId: messageReactions.userId, emoji: messageReactions.emoji }).from(messageReactions).where(inArray(messageReactions.messageId, rows.map((row) => row.id))) : Promise.resolve([]),
    listSavedReplies(db, userId),
  ]);
  const quoted = new Map(quotedRows.map((row) => [row.id, row]));
  // The people the messages and their quotes name by @username (2026-11-23), in one look.
  const mentions = await mentionsOf(db, [...rows.filter((row) => row.kind === 'text').map((row) => row.body), ...quotedRows.map((row) => row.body)], userId);
  const reactionsOf = (messageId: string) => {
    const mine = reactionRows.filter((row) => row.messageId === messageId);
    return MESSAGE_REACTIONS.flatMap((emoji) => {
      const given = mine.filter((row) => row.emoji === emoji);
      return given.length ? [{ emoji, count: given.length, mine: given.some((row) => row.userId === userId) }] : [];
    });
  };
  const withExtras = (row: typeof messages.$inferSelect) => {
    const view = toView(row, userId, found.context.masking, photos, mentions);
    const quote = row.replyToMessageId ? quoted.get(row.replyToMessageId) : undefined;
    const reactions = reactionsOf(row.id);
    return {
      ...view,
      ...(quote ? { replyTo: { id: quote.id, sender: quote.senderUserId === userId ? ('me' as const) : ('them' as const), segments: shortenSegments(toMessageSegments(quote.body, { mask: found.context.masking && quote.senderUserId !== userId, mentions })) } } : {}),
      ...(reactions.length ? { reactions } : {}),
    };
  };
  return {
    // The other person's Sparks in the header (2026-11-22), never a deleted account's.
    thread: { ...found.summary, unreadCount: 0, otherParty: { ...found.summary.otherParty, ...(otherSparks && !otherGone ? { sparks: otherSparks } : {}) } },
    messages: rows.map(withExtras),
    ...(earlier ? { earlier: { from: earlier.id } } : {}),
    ...(replies.length ? { savedReplies: replies } : {}),
    // Translate and Suggest replies, where a model (or, outside production, the stand-in) answers (2026-11-23); since
    // 2026-11-24 also the whole conversation translated and "Catch me up", into the reader's language.
    ...(assist.translate || assist.suggest || assist.summarize ? { assist: { ...assist, language: viewer?.locale === 'es' ? ('es' as const) : ('en' as const) } } : {}),
    // Many unread on opening (2026-11-24): "Catch me up" waits above "New messages".
    ...(assist.summarize && newlyRead.length >= CATCH_UP_UNREAD ? { catchUp: { unread: newlyRead.length } } : {}),
    ...(cards ? { cards } : {}),
    ...(canProposeChange ? { canProposeChange: true } : {}),
    ...(options ? { requestOptions: options } : {}),
    ...(bookingTools ? { agreement: bookingTools.agreement } : {}),
    ...(bookingTools?.actions.length ? { bookingActions: bookingTools.actions } : {}),
    ...(quietUntil ? { quietHours: { until: quietUntil.toISOString() } } : {}),
    ...(thanks ? { thanks } : {}),
    ...(presence ? { presence } : {}),
    ...(mutual && lastMine && theirs?.lastReadAt && theirs.lastReadAt >= lastMine.createdAt ? { seenMessageId: lastMine.id } : {}),
    // Ticks (2026-11-24): how far they've read, under the same rule as "Seen".
    ...(mutual && theirs?.lastReadAt ? { readUpTo: theirs.lastReadAt.toISOString() } : {}),
    ...(newlyRead[0] ? { firstUnreadId: newlyRead[0].id } : {}),
    composer: {
      canSend: !disabledReason,
      ...(disabledReason ? { disabledReason } : {}),
      ...(closedReason ? { closedReason } : {}),
      ...(firstLeft !== null && !blocked && !otherGone ? { firstMessagesLeft: firstLeft } : {}),
      maxLength: 2000,
      maxAttachments: 4,
      maxPhotoMegabytes: Math.round(MAX_PHOTO_BYTES / (1024 * 1024)),
    },
  };
}

export async function sendMessage(db: Db, userId: string, threadId: string, input: SendMessageInput, now: Date): Promise<ActionResult> {
  const parsed = sendMessageInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  // The same message again, after an answer that never arrived (the composer's key): sent already, never twice, and
  // before the rate limit (bad connections pass, J-N1).
  const requestKey = parsed.data.requestKey;
  if (requestKey) {
    const [sent] = await db.select({ id: messages.id }).from(messages).where(and(eq(messages.senderUserId, userId), eq(messages.requestKey, requestKey))).limit(1);
    if (sent) return { ok: true, code: 'sent' };
  }
  const [thread] = await db.select().from(threads).where(eq(threads.id, String(threadId))).limit(1);
  const found = thread ? await summaryOf(db, thread, userId, now) : null;
  if (!thread || !found) return { ok: false, code: 'not_found' };
  if (found.context.closed || found.other.status === 'deleted' || (await isBlocked(db, userId, found.other.id))) return { ok: false, code: 'not_allowed' };
  // A direct conversation the sender started: no more until the other person answers (2026-11-21).
  if ((await directFirstMessagesLeft(db, thread, userId)) === 0) return { ok: false, code: 'limit_reached' };
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
  try {
    await db.insert(messages).values({ id: newId('msg'), threadId: thread.id, senderUserId: userId, kind: 'text', body: parsed.data.body, attachmentFileIds: attachmentIds, replyToMessageId, requestKey: requestKey ?? null, createdAt: now });
  } catch (error) {
    // The same message at the same moment (its key is taken): the other request sent it.
    if (requestKey && violatedConstraint(error) === 'messages_sender_request_key_idx') return { ok: true, code: 'sent' };
    throw error;
  }
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
  // Answering a message request accepts it (2026-11-23); the sender's own list keeps it as it was otherwise.
  await db
    .update(threadParticipants)
    .set({ lastReadAt: now, ...(thread.kind === 'direct' ? { acceptedAt: sql`coalesce(${threadParticipants.acceptedAt}, ${now})` } : {}) })
    .where(and(eq(threadParticipants.threadId, thread.id), eq(threadParticipants.userId, userId)));
  // A new message brings an archived conversation back into the other person's list, unless it's a request they ignored.
  await db
    .update(threadParticipants)
    .set({ archivedAt: null })
    .where(and(eq(threadParticipants.threadId, thread.id), ne(threadParticipants.userId, userId), isNotNull(threadParticipants.archivedAt), ...(thread.kind === 'direct' ? [isNotNull(threadParticipants.acceptedAt)] : [])));
  // A sample profile never answers: the app says so, once (2026-11-23).
  await noteSampleRecipient(db, thread.id, userId, others.map((row) => row.userId), now);
  // Answering reads the conversation too: the person's other devices hear it (this page refreshes with the action).
  await noticeReadByReader(db, userId, thread.id, found.summary.unreadCount, await readMessageNotifications(db, userId, thread.id, now));
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
  // As for sending: not in a closed conversation (the page offers no reactions there either).
  if (found.context.closed || found.other.status === 'deleted' || (await isBlocked(db, userId, found.other.id))) return { ok: false, code: 'not_allowed' };
  const limited = await consumeRateLimit(db, `message-reactions:${userId}`, REACTION_RATE_LIMIT, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };
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
