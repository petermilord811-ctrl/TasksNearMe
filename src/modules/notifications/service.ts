import { and, asc, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import type {
  AccountPageData,
  AccountProfileInput,
  ActionResult,
  AttentionTarget,
  NotificationChannel,
  NotificationsPageData,
  NotificationTopic,
  NotificationType,
  NotificationView,
} from '@/contracts';
import { accountProfileInputSchema, NOTIFICATION_CHANNELS, NOTIFICATION_TOPICS } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { bookings } from '@/modules/bookings/schema';
import { offers } from '@/modules/offers/schema';
import { helperProfiles } from '@/modules/profiles/schema';
import { tasks } from '@/modules/tasks/schema';
import { validationFailed } from '@/platform/actions/results';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { outboxEvents } from '@/platform/outbox/schema';
import { notificationPreferences, notifications, privacyRequests } from './schema';

/**
 * Notifications from outbox events (the dispatcher), the notifications page, and the account page
 * (profile, preferences, privacy requests). Until the job runner exists, the dispatcher runs lazily when
 * a person opens a page that shows notifications.
 */

type EventRow = typeof outboxEvents.$inferSelect;
type Payload = Record<string, unknown>;

interface Planned {
  userId: string;
  type: NotificationType;
  target: AttentionTarget;
  title?: string;
  actorName?: string;
  params?: NotificationView['params'];
}

const text = (value: unknown) => (typeof value === 'string' ? value : undefined);

async function nameOf(db: Db, userId: string | undefined): Promise<string | undefined> {
  if (!userId) return undefined;
  const [user] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  return user?.name;
}

async function taskTitle(db: Db, taskId: string | undefined): Promise<string | undefined> {
  if (!taskId) return undefined;
  const [task] = await db.select({ title: tasks.title }).from(tasks).where(eq(tasks.id, taskId)).limit(1);
  return task?.title;
}

async function bookingContext(db: Db, bookingId: string | undefined) {
  if (!bookingId) return null;
  const [row] = await db
    .select({ id: bookings.id, posterUserId: bookings.posterUserId, helperUserId: bookings.helperUserId, title: tasks.title })
    .from(bookings)
    .innerJoin(tasks, eq(tasks.id, bookings.taskId))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  return row ?? null;
}

/** Who hears about an event, and how. */
async function plan(db: Db, event: EventRow): Promise<Planned[]> {
  const p = event.payload as Payload;
  switch (event.type) {
    case 'offer.submitted':
    case 'offer.revised': {
      const poster = text(p.posterUserId);
      const taskId = text(p.taskId);
      if (!poster || !taskId) return [];
      const [offer] = await db.select({ priceCents: offers.priceCents }).from(offers).where(eq(offers.id, event.aggregateId)).limit(1);
      return [
        {
          userId: poster,
          type: event.type === 'offer.submitted' ? 'offer_received' : 'offer_updated',
          target: { kind: 'task', taskId },
          title: await taskTitle(db, taskId),
          actorName: await nameOf(db, text(p.helperUserId)),
          ...(offer?.priceCents ? { params: { amountCents: offer.priceCents } } : {}),
        },
      ];
    }
    case 'offer.declined': {
      const helper = text(p.helperUserId);
      const taskId = text(p.taskId);
      return helper && taskId ? [{ userId: helper, type: 'offer_declined', target: { kind: 'find_work_task', taskId }, title: await taskTitle(db, taskId) }] : [];
    }
    case 'booking.confirmed':
    case 'booking.on_my_way':
    case 'booking.arrived':
    case 'booking.completion_submitted':
    case 'booking.completed':
    case 'booking.disputed':
    case 'booking.canceled':
    case 'earnings.transferred':
    case 'reviews.published': {
      const booking = await bookingContext(db, text(p.bookingId) ?? event.aggregateId);
      if (!booking) return [];
      const target: AttentionTarget = { kind: 'booking', bookingId: booking.id };
      const helperName = await nameOf(db, booking.helperUserId);
      const posterName = await nameOf(db, booking.posterUserId);
      const forHelper = (type: NotificationType, extra: Partial<Planned> = {}): Planned => ({ userId: booking.helperUserId, type, target, title: booking.title, actorName: posterName, ...extra });
      const forPoster = (type: NotificationType, extra: Partial<Planned> = {}): Planned => ({ userId: booking.posterUserId, type, target, title: booking.title, actorName: helperName, ...extra });
      switch (event.type) {
        case 'booking.confirmed':
          return [forHelper('booking_confirmed')];
        case 'booking.on_my_way':
          return [forPoster('helper_on_the_way')];
        case 'booking.arrived':
          return [forPoster('helper_arrived')];
        case 'booking.completion_submitted':
          return [forPoster('work_submitted')];
        case 'booking.completed':
          return [forHelper('work_approved')];
        case 'booking.disputed':
          return [forHelper('problem_reported')];
        case 'booking.canceled':
          return [forPoster('booking_canceled'), forHelper('booking_canceled')];
        case 'earnings.transferred': {
          const cents = typeof p.earningsCents === 'number' ? p.earningsCents : undefined;
          return [forHelper('earnings_transferred', { target: { kind: 'earnings' }, actorName: undefined, ...(cents ? { params: { amountCents: cents } } : {}) })];
        }
        default:
          return [forPoster('review_published'), forHelper('review_published')];
      }
    }
    case 'support.replied': {
      const caseId = text(p.caseId);
      const userId = text(p.partyUserId);
      if (!caseId || !userId) return [];
      return [{ userId, type: 'support_replied' as const, target: { kind: 'support_case', caseId } as AttentionTarget, title: text(p.subject) }];
    }
    case 'support.resolved': {
      const caseId = text(p.caseId);
      const recipients = Array.isArray(p.recipientIds) ? (p.recipientIds as string[]) : [];
      if (!caseId) return [];
      return recipients.map((userId) => ({ userId, type: 'case_resolved' as const, target: { kind: 'support_case', caseId } as AttentionTarget, title: text(p.subject) }));
    }
    case 'message.sent': {
      const threadId = text(p.threadId);
      const recipients = Array.isArray(p.recipientIds) ? (p.recipientIds as string[]) : [];
      if (!threadId) return [];
      const title = await taskTitle(db, text(p.taskId));
      const actorName = await nameOf(db, text(p.senderUserId));
      return recipients.map((userId) => ({ userId, type: 'message_received' as const, target: { kind: 'thread', threadId } as AttentionTarget, title, actorName }));
    }
    default:
      return [];
  }
}

/** Turns undispatched outbox events into notifications (idempotent), oldest first. */
export async function dispatchNotifications(db: Db, now: Date, limit = 200): Promise<number> {
  const pending = await db.select().from(outboxEvents).where(isNull(outboxEvents.dispatchedAt)).orderBy(asc(outboxEvents.createdAt)).limit(limit);
  let made = 0;
  for (const event of pending) {
    const planned = await plan(db, event);
    for (const item of planned) {
      // Several unread messages in one thread make one notification.
      if (item.type === 'message_received' && item.target.kind === 'thread') {
        const threadId = item.target.threadId;
        const unread = await db
          .select({ id: notifications.id, target: notifications.target })
          .from(notifications)
          .where(and(eq(notifications.userId, item.userId), eq(notifications.type, 'message_received'), isNull(notifications.readAt)));
        if (unread.some((row) => row.target.kind === 'thread' && row.target.threadId === threadId)) continue;
      }
      const inserted = await db
        .insert(notifications)
        .values({
          id: newId('ntf'),
          userId: item.userId,
          type: item.type,
          title: item.title ?? null,
          actorName: item.actorName ?? null,
          params: item.params ?? null,
          target: item.target,
          sourceEventId: event.id,
          createdAt: new Date(event.createdAt),
        })
        .onConflictDoNothing({ target: [notifications.sourceEventId, notifications.userId] })
        .returning({ id: notifications.id });
      made += inserted.length;
    }
    await db.update(outboxEvents).set({ dispatchedAt: now.toISOString() }).where(eq(outboxEvents.id, event.id));
  }
  return made;
}

export async function unreadNotificationCount(db: Db, userId: string): Promise<number> {
  const [row] = await db.select({ value: count() }).from(notifications).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.value ?? 0;
}

/** `/app/notifications`: the latest 50, newest first. */
export async function getNotificationsPage(db: Db, userId: string, now: Date): Promise<NotificationsPageData> {
  await dispatchNotifications(db, now);
  const rows = await db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(50);
  return {
    notifications: rows.map((row) => ({
      id: row.id,
      type: row.type as NotificationType,
      ...(row.title ? { title: row.title } : {}),
      ...(row.actorName ? { actorName: row.actorName } : {}),
      ...(row.params ? { params: row.params } : {}),
      target: row.target,
      createdAt: row.createdAt.toISOString(),
      ...(row.readAt ? { readAt: row.readAt.toISOString() } : {}),
    })),
    unreadCount: await unreadNotificationCount(db, userId),
  };
}

export async function markNotificationRead(db: Db, userId: string, notificationId: string, now: Date): Promise<ActionResult> {
  await db.update(notifications).set({ readAt: now }).where(and(eq(notifications.id, String(notificationId)), eq(notifications.userId, userId), isNull(notifications.readAt)));
  return { ok: true, code: 'updated' };
}

export async function markAllNotificationsRead(db: Db, userId: string, now: Date): Promise<ActionResult> {
  await db.update(notifications).set({ readAt: now }).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return { ok: true, code: 'updated' };
}

// ---- The account page -------------------------------------------------------------------------------

/** Receipts and safety messages always go by email. */
const LOCKED: { topic: NotificationTopic; channel: NotificationChannel }[] = [
  { topic: 'bookings', channel: 'email' },
  { topic: 'payments', channel: 'email' },
];
const DEFAULT_ON: Record<NotificationTopic, NotificationChannel[]> = {
  bookings: ['email', 'sms'],
  messages: ['email'],
  offers: ['email'],
  payments: ['email'],
  tips_and_news: [],
};
const isLocked = (topic: string, channel: string) => LOCKED.some((item) => item.topic === topic && item.channel === channel);

export async function getAccountPage(db: Db, userId: string): Promise<AccountPageData | null> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;
  const [prefRows, [profile], requests] = await Promise.all([
    db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)),
    db.select({ status: helperProfiles.status }).from(helperProfiles).where(eq(helperProfiles.userId, userId)).limit(1),
    db.select().from(privacyRequests).where(and(eq(privacyRequests.userId, userId), eq(privacyRequests.status, 'requested'))).orderBy(desc(privacyRequests.createdAt)),
  ]);
  const stored = new Map(prefRows.map((row) => [`${row.topic}:${row.channel}`, row.enabled === 'true']));
  const exportRequest = requests.find((r) => r.kind === 'export');
  const deletionRequest = requests.find((r) => r.kind === 'deletion');
  return {
    profile: { firstName: user.firstName, lastName: user.lastName, displayName: user.name, email: user.email },
    ...(user.phone ? { phone: { last4: user.phone.slice(-4), verified: user.phoneVerifiedAt !== null } } : {}),
    preferences: NOTIFICATION_TOPICS.flatMap((topic) =>
      NOTIFICATION_CHANNELS.map((channel) => {
        const locked = isLocked(topic, channel);
        const enabled = locked || (stored.get(`${topic}:${channel}`) ?? DEFAULT_ON[topic].includes(channel));
        return { topic, channel, enabled, locked };
      }),
    ),
    helper: { status: (profile?.status as AccountPageData['helper']['status'] | undefined) ?? 'none' },
    privacy: {
      ...(exportRequest ? { exportRequestedAt: exportRequest.createdAt.toISOString() } : {}),
      ...(deletionRequest ? { deletionRequestedAt: deletionRequest.createdAt.toISOString() } : {}),
    },
  };
}

export async function saveAccountProfile(db: Db, userId: string, input: AccountProfileInput, now: Date): Promise<ActionResult> {
  const parsed = accountProfileInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const { firstName, lastName } = parsed.data;
  await db.update(users).set({ firstName, lastName, name: `${firstName} ${lastName.charAt(0).toUpperCase()}.`, updatedAt: now }).where(eq(users.id, userId));
  return { ok: true, code: 'saved' };
}

export async function saveNotificationPreference(db: Db, userId: string, input: { topic: string; channel: string; enabled: boolean }, now: Date): Promise<ActionResult> {
  if (!(NOTIFICATION_TOPICS as readonly string[]).includes(input.topic) || !(NOTIFICATION_CHANNELS as readonly string[]).includes(input.channel)) {
    return { ok: false, code: 'validation_failed' };
  }
  if (isLocked(input.topic, input.channel)) return { ok: false, code: 'not_allowed' };
  const values = { userId, topic: input.topic, channel: input.channel, enabled: input.enabled ? 'true' : 'false', updatedAt: now };
  await db
    .insert(notificationPreferences)
    .values(values)
    .onConflictDoUpdate({ target: [notificationPreferences.userId, notificationPreferences.topic, notificationPreferences.channel], set: { enabled: values.enabled, updatedAt: now } });
  return { ok: true, code: 'updated' };
}

/** A copy of the data (support emails it within 30 days). Asking again while one is open changes nothing. */
export async function requestDataExport(db: Db, userId: string, now: Date): Promise<ActionResult> {
  const [open] = await db.select({ id: privacyRequests.id }).from(privacyRequests).where(and(eq(privacyRequests.userId, userId), eq(privacyRequests.kind, 'export'), eq(privacyRequests.status, 'requested'))).limit(1);
  if (!open) await db.insert(privacyRequests).values({ id: newId('prv'), userId, kind: 'export', status: 'requested', createdAt: now });
  return { ok: true, code: 'submitted' };
}

/** Account deletion; not while bookings are open or money is on its way. */
export async function requestAccountDeletion(db: Db, userId: string, now: Date): Promise<ActionResult> {
  const [open] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(
        inArray(bookings.status, ['pending_funding', 'confirmed', 'in_progress', 'completion_submitted', 'disputed']),
        // Either side of the booking.
        eq(bookings.posterUserId, userId),
      ),
    )
    .limit(1);
  const [helping] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(and(inArray(bookings.status, ['pending_funding', 'confirmed', 'in_progress', 'completion_submitted', 'disputed']), eq(bookings.helperUserId, userId)))
    .limit(1);
  if (open || helping) return { ok: false, code: 'not_allowed' };
  const [existing] = await db.select({ id: privacyRequests.id }).from(privacyRequests).where(and(eq(privacyRequests.userId, userId), eq(privacyRequests.kind, 'deletion'), eq(privacyRequests.status, 'requested'))).limit(1);
  if (!existing) await db.insert(privacyRequests).values({ id: newId('prv'), userId, kind: 'deletion', status: 'requested', createdAt: now });
  return { ok: true, code: 'submitted' };
}
