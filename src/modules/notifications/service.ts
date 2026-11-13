import { and, asc, count, desc, eq, isNull } from 'drizzle-orm';
import type {
  AccountPageData,
  AccountProfileInput,
  ActionResult,
  AttentionTarget,
  NotificationsPageData,
  NotificationType,
  NotificationView,
} from '@/contracts';
import { accountProfileInputSchema, NOTIFICATION_CHANNELS, NOTIFICATION_TOPICS } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { remindApprovalsDue, remindUpcomingBookings } from '@/modules/bookings/reminders';
import { bookingSeries, bookings } from '@/modules/bookings/schema';
import { offers } from '@/modules/offers/schema';
import { avatarPhoto, MAX_PHOTO_BYTES } from '@/modules/files/photos';
import { initialsOf } from '@/modules/profiles/queries';
import { helperProfiles } from '@/modules/profiles/schema';
import { tasks } from '@/modules/tasks/schema';
import { validationFailed } from '@/platform/actions/results';
import { getSignInMethods } from '@/modules/accounts/sign-in-methods';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { invites } from '@/modules/invites/schema';
import { rebookProposals } from '@/modules/rebook/schema';
import { outboxEvents } from '@/platform/outbox/schema';
import { isLockedPreference, preferenceOn } from './delivery-domain';
import { privacyViewOf } from '@/modules/privacy/requests';
import { pushSetup } from './push';
import { notificationPreferences, notifications } from './schema';
import { verificationNotificationFor } from './verification-plan';
import { helpersToAlert, replacementHelpers } from '@/modules/offers/task-alerts';

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
    case 'task.reopened': {
      // Find a replacement: earlier offerers (never the helper who canceled) can offer again, and the most reliable
      // helpers the task suits hear a client needs someone (automated replacement matching, blueprint 01 P2).
      const taskId = text(p.taskId);
      if (!taskId) return [];
      const helpers = Array.isArray(p.helperUserIds) ? p.helperUserIds.filter((id): id is string => typeof id === 'string') : [];
      const canceled = text(p.canceledHelperUserId);
      const title = await taskTitle(db, taskId);
      const target = { kind: 'find_work_task', taskId } as AttentionTarget;
      const others = await replacementHelpers(db, taskId, [...helpers, ...(canceled ? [canceled] : [])], new Date(event.createdAt));
      const poster = text(p.posterUserId);
      return [
        ...helpers.map((userId) => ({ userId, type: 'task_reopened' as const, target, title })),
        ...others.map((userId) => ({ userId, type: 'replacement_needed' as const, target, title })),
        // When it happened on its own (the helper canceled), the client hears their task is open again.
        ...(p.automatic === true && poster ? [{ userId: poster, type: 'replacement_search_started' as const, target: { kind: 'task', taskId } as AttentionTarget, title, actorName: await nameOf(db, canceled) }] : []),
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
    case 'booking.approval_reminder':
    case 'booking.start_reminder':
    case 'booking.canceled':
    case 'booking.tipped':
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
        case 'booking.start_reminder': {
          const extra: Partial<Planned> = typeof p.hours === 'number' ? { params: { hours: p.hours } } : {};
          return [forPoster('booking_reminder', extra), forHelper('booking_reminder', extra)];
        }
        case 'booking.approval_reminder': {
          const hours = typeof p.hours === 'number' ? p.hours : undefined;
          return [forPoster('approval_reminder', hours ? { params: { hours } } : {})];
        }
        case 'booking.canceled':
          return [forPoster('booking_canceled'), forHelper('booking_canceled')];
        case 'booking.tipped': {
          const cents = typeof p.amountCents === 'number' ? p.amountCents : undefined;
          return [forHelper('tip_received', cents ? { params: { amountCents: cents } } : {})];
        }
        case 'earnings.transferred': {
          const cents = typeof p.earningsCents === 'number' ? p.earningsCents : undefined;
          return [forHelper('earnings_transferred', { target: { kind: 'earnings' }, actorName: undefined, ...(cents ? { params: { amountCents: cents } } : {}) })];
        }
        default:
          return [forPoster('review_published'), forHelper('review_published')];
      }
    }
    case 'change.proposed': {
      const bookingId = text(p.bookingId);
      const proposer = text(p.proposedByUserId);
      const ctx = await bookingContext(db, bookingId);
      if (!ctx || !bookingId || !proposer) return [];
      const other = ctx.posterUserId === proposer ? ctx.helperUserId : ctx.posterUserId;
      return [{ userId: other, type: 'change_proposed' as const, target: { kind: 'booking', bookingId } as AttentionTarget, title: ctx.title, actorName: await nameOf(db, proposer) }];
    }
    case 'change.applied': {
      const bookingId = text(p.bookingId);
      const ctx = await bookingContext(db, bookingId);
      if (!ctx || !bookingId) return [];
      return [ctx.posterUserId, ctx.helperUserId].map((userId) => ({ userId, type: 'change_applied' as const, target: { kind: 'booking', bookingId } as AttentionTarget, title: ctx.title }));
    }
    case 'rebook.proposed':
    case 'rebook.accepted':
    case 'rebook.declined': {
      const proposalId = text(p.proposalId);
      const helperId = text(p.helperUserId);
      const posterId = text(p.posterUserId);
      if (!proposalId || !helperId || !posterId) return [];
      const [proposal] = await db.select({ fromBookingId: rebookProposals.fromBookingId, bookingId: rebookProposals.bookingId }).from(rebookProposals).where(eq(rebookProposals.id, proposalId)).limit(1);
      const title = (await bookingContext(db, proposal?.fromBookingId))?.title;
      if (event.type === 'rebook.proposed') {
        return [{ userId: posterId, type: 'rebook_proposed' as const, target: { kind: 'proposal', proposalId } as AttentionTarget, title, actorName: await nameOf(db, helperId) }];
      }
      const actorName = await nameOf(db, posterId);
      const bookingId = text(p.bookingId) ?? proposal?.bookingId ?? undefined;
      if (event.type === 'rebook.accepted') {
        return bookingId ? [{ userId: helperId, type: 'rebook_accepted' as const, target: { kind: 'booking', bookingId } as AttentionTarget, title, actorName }] : [];
      }
      return [{ userId: helperId, type: 'rebook_declined' as const, target: { kind: 'proposal', proposalId } as AttentionTarget, title, actorName }];
    }
    case 'invite.sent':
    case 'invite.countered':
    case 'invite.accepted': {
      const inviteId = text(p.inviteId);
      const posterId = text(p.posterUserId);
      const helperId = text(p.helperUserId);
      if (!inviteId || !posterId || !helperId) return [];
      const [invite] = await db.select({ taskId: invites.taskId, bookingId: invites.bookingId }).from(invites).where(eq(invites.id, inviteId)).limit(1);
      const title = await taskTitle(db, invite?.taskId);
      if (event.type === 'invite.sent') {
        return [{ userId: helperId, type: 'invite_received' as const, target: { kind: 'invite', inviteId } as AttentionTarget, title, actorName: await nameOf(db, posterId) }];
      }
      const actorName = await nameOf(db, helperId);
      if (event.type === 'invite.countered') {
        return invite?.taskId ? [{ userId: posterId, type: 'invite_countered' as const, target: { kind: 'task', taskId: invite.taskId } as AttentionTarget, title, actorName }] : [];
      }
      const bookingId = text(p.bookingId) ?? invite?.bookingId ?? undefined;
      return bookingId ? [{ userId: posterId, type: 'invite_accepted' as const, target: { kind: 'booking', bookingId } as AttentionTarget, title, actorName }] : [];
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
    case 'task.posted': {
      // Helpers the new task suits (src/modules/offers/task-alerts.ts).
      const taskId = text(p.taskId);
      if (!taskId) return [];
      const [task] = await db.select({ title: tasks.title, budgetCents: tasks.budgetCents }).from(tasks).where(eq(tasks.id, taskId)).limit(1);
      if (!task) return [];
      const helpers = await helpersToAlert(db, taskId, new Date(event.createdAt));
      return helpers.map((userId) => ({
        userId,
        type: 'task_match' as const,
        target: { kind: 'find_work_task', taskId } as AttentionTarget,
        title: task.title,
        ...(task.budgetCents ? { params: { amountCents: task.budgetCents } } : {}),
      }));
    }
    case 'series.started':
    case 'series.paused':
    case 'series.resumed':
    case 'series.stopped':
    case 'series.visit_skipped': {
      // Regular visits (blueprint 03 §7): the other person hears what one of them did; both hear what the system did.
      const seriesId = text(p.seriesId);
      if (!seriesId) return [];
      const [series] = await db
        .select({ posterUserId: bookingSeries.posterUserId, helperUserId: bookingSeries.helperUserId, title: tasks.title })
        .from(bookingSeries)
        .innerJoin(tasks, eq(tasks.id, bookingSeries.templateTaskId))
        .where(eq(bookingSeries.id, seriesId))
        .limit(1);
      if (!series) return [];
      const target: AttentionTarget = { kind: 'series', seriesId };
      const [posterName, helperName] = await Promise.all([nameOf(db, series.posterUserId), nameOf(db, series.helperUserId)]);
      const by = text(p.by);
      const toHelper = (type: NotificationType, params?: NotificationView['params']): Planned => ({ userId: series.helperUserId, type, target, title: series.title, actorName: posterName, ...(params ? { params } : {}) });
      const toPoster = (type: NotificationType, params?: NotificationView['params']): Planned => ({ userId: series.posterUserId, type, target, title: series.title, actorName: helperName, ...(params ? { params } : {}) });
      switch (event.type) {
        case 'series.started':
          return [toHelper('series_started')];
        case 'series.paused': {
          const until = text(p.until);
          return [toHelper('series_paused', until ? { day: until } : undefined)];
        }
        case 'series.resumed':
          return by === 'system' ? [toHelper('series_resumed', { by: 'system' }), toPoster('series_resumed', { by: 'system' })] : [toHelper('series_resumed', { by: 'poster' })];
        case 'series.stopped': {
          const endsOn = text(p.endsOn);
          if (by === 'poster') return [toHelper('series_stopped', { by: 'poster' })];
          if (by === 'helper') return [toPoster('series_stopped', { by: 'helper', ...(endsOn ? { day: endsOn } : {}) })];
          return [toHelper('series_stopped', { by: 'system' }), toPoster('series_stopped', { by: 'system' })];
        }
        default: {
          const start = text(p.start);
          const params = (who: 'poster' | 'helper' | 'payment'): NotificationView['params'] => ({ by: who, ...(start ? { at: start } : {}) });
          if (by === 'poster') return [toHelper('series_visit_skipped', params('poster'))];
          if (by === 'helper') return [toPoster('series_visit_skipped', params('helper'))];
          return [toHelper('series_visit_skipped', params('payment')), toPoster('series_visit_skipped', params('payment'))];
        }
      }
    }
    case 'booking.funding_failed': {
      // A scheduled charge didn't go through: the client can still pay on the booking page until `payBy`.
      const booking = await bookingContext(db, text(p.bookingId) ?? event.aggregateId);
      if (!booking) return [];
      const payBy = text(p.payBy);
      return [{ userId: booking.posterUserId, type: 'scheduled_payment_failed' as const, target: { kind: 'booking', bookingId: booking.id } as AttentionTarget, title: booking.title, ...(payBy ? { params: { at: payBy } } : {}) }];
    }
    case 'verification.updated': {
      const planned = verificationNotificationFor(p);
      return planned ? [planned] : [];
    }
    case 'privacy.export_ready': {
      const userId = text(p.userId);
      return userId ? [{ userId, type: 'data_export_ready' as const, target: { kind: 'account' } as AttentionTarget }] : [];
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

/**
 * `/app/notifications`: the latest 50, newest first. The viewer's approval reminders due now are made first
 * (the job runner makes everyone's every minute), so the page never waits for the next run.
 */
export async function getNotificationsPage(db: Db, userId: string, now: Date): Promise<NotificationsPageData> {
  await remindApprovalsDue(db, now, { posterUserId: userId });
  await remindUpcomingBookings(db, now, { userId });
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

const isLocked = isLockedPreference;

/** `returned`: what Better Auth adds after connecting Google or Microsoft (see getSignInMethods). */
export async function getAccountPage(db: Db, userId: string, returned: { connect?: unknown; error?: unknown } = {}, now: Date = new Date()): Promise<AccountPageData | null> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;
  const [prefRows, [profile], privacy, signIn] = await Promise.all([
    db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)),
    db.select({ status: helperProfiles.status }).from(helperProfiles).where(eq(helperProfiles.userId, userId)).limit(1),
    privacyViewOf(db, userId, now),
    getSignInMethods(db, { id: user.id, email: user.email }, returned),
  ]);
  const stored = new Map(prefRows.map((row) => [`${row.topic}:${row.channel}`, row.enabled === 'true']));
  return {
    profile: {
      firstName: user.firstName,
      lastName: user.lastName,
      displayName: user.name,
      initials: initialsOf(user.firstName, user.lastName) || user.email.charAt(0).toUpperCase(),
      email: user.email,
      ...(user.avatarFileId ? { photo: avatarPhoto(user.avatarFileId, user.name) } : {}),
    },
    maxPhotoMegabytes: Math.round(MAX_PHOTO_BYTES / (1024 * 1024)),
    ...(user.phone ? { phone: { last4: user.phone.slice(-4), verified: user.phoneVerifiedAt !== null } } : {}),
    signIn,
    preferences: NOTIFICATION_TOPICS.flatMap((topic) =>
      NOTIFICATION_CHANNELS.map((channel) => {
        const locked = isLocked(topic, channel);
        const enabled = preferenceOn(stored, topic, channel);
        return { topic, channel, enabled, locked };
      }),
    ),
    helper: { status: (profile?.status as AccountPageData['helper']['status'] | undefined) ?? 'none' },
    privacy,
    ...(pushSetup() ? { push: pushSetup()! } : {}),
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
