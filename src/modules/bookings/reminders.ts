import { and, eq, gt, lte, or } from 'drizzle-orm';
import type { Db } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';
import { bookings } from './schema';

const HOUR = 3_600_000;

/** Reminders to the client before submitted work is approved automatically (blueprint 10 §3.2 T-02). */
export const APPROVAL_REMINDER_HOURS = [24, 4] as const;
export type ApprovalReminderHours = (typeof APPROVAL_REMINDER_HOURS)[number];

/**
 * The reminder due for an approval deadline at `now`: the closest threshold already reached (a runner that
 * was down at 24 h left sends only the 4 h one), and only thresholds shorter than the approval window (a
 * 12 h window gets no 24 h reminder). None once the deadline has passed. `hoursLeft` is what the client reads.
 */
export function approvalReminderDue(
  approvalDueAt: Date,
  submittedAt: Date | null,
  now: Date,
): { threshold: ApprovalReminderHours; hoursLeft: number } | null {
  const left = approvalDueAt.getTime() - now.getTime();
  if (left <= 0) return null;
  const window = submittedAt ? approvalDueAt.getTime() - submittedAt.getTime() : Number.POSITIVE_INFINITY;
  const reached = APPROVAL_REMINDER_HOURS.filter((hours) => left <= hours * HOUR && window > hours * HOUR);
  if (reached.length === 0) return null;
  return { threshold: Math.min(...reached) as ApprovalReminderHours, hoursLeft: Math.max(1, Math.round(left / HOUR)) };
}

/**
 * Reminds clients to approve submitted work 24 h and 4 h before it's approved automatically. The outbox
 * event's id names the booking, the deadline and the threshold, so each reminder is sent once although the
 * job runs every minute, and a new deadline (staff extended the timer) reminds again.
 */
export async function remindApprovalsDue(db: Db, now: Date, scope: { bookingId?: string; posterUserId?: string } = {}): Promise<number> {
  const window = new Date(now.getTime() + Math.max(...APPROVAL_REMINDER_HOURS) * HOUR);
  const conditions = [eq(bookings.status, 'completion_submitted'), gt(bookings.approvalDueAt, now), lte(bookings.approvalDueAt, window)];
  if (scope.bookingId) conditions.push(eq(bookings.id, scope.bookingId));
  if (scope.posterUserId) conditions.push(eq(bookings.posterUserId, scope.posterUserId));
  const due = await db
    .select({
      id: bookings.id,
      taskId: bookings.taskId,
      posterUserId: bookings.posterUserId,
      approvalDueAt: bookings.approvalDueAt,
      submittedAt: bookings.completionSubmittedAt,
    })
    .from(bookings)
    .where(and(...conditions));
  let sent = 0;
  for (const row of due) {
    if (!row.approvalDueAt) continue;
    const reminder = approvalReminderDue(row.approvalDueAt, row.submittedAt, now);
    if (!reminder) continue;
    const inserted = await db
      .insert(outboxEvents)
      .values({
        id: `evt_remind_${row.id}_${row.approvalDueAt.getTime()}_${reminder.threshold}`,
        type: 'booking.approval_reminder',
        aggregateType: 'booking',
        aggregateId: row.id,
        payload: { bookingId: row.id, taskId: row.taskId, posterUserId: row.posterUserId, hours: reminder.hoursLeft, approvalDueAt: row.approvalDueAt.toISOString() },
      })
      .onConflictDoNothing({ target: outboxEvents.id })
      .returning({ id: outboxEvents.id });
    sent += inserted.length;
  }
  return sent;
}

/** Reminders to both people before a confirmed booking starts (blueprint 03 §4: T-24 h and T-2 h). */
export const START_REMINDER_HOURS = [24, 2] as const;
export type StartReminderHours = (typeof START_REMINDER_HOURS)[number];

/**
 * The start reminder due at `now`: the closest threshold reached, and only thresholds shorter than the
 * time between booking and start (a booking made 3 h before gets only the 2 h reminder). None once started.
 */
export function startReminderDue(startAt: Date, confirmedAt: Date | null, now: Date): { threshold: StartReminderHours; hoursLeft: number } | null {
  const left = startAt.getTime() - now.getTime();
  if (left <= 0) return null;
  const lead = confirmedAt ? startAt.getTime() - confirmedAt.getTime() : Number.POSITIVE_INFINITY;
  const reached = START_REMINDER_HOURS.filter((hours) => left <= hours * HOUR && lead > hours * HOUR);
  if (reached.length === 0) return null;
  return { threshold: Math.min(...reached) as StartReminderHours, hoursLeft: Math.max(1, Math.round(left / HOUR)) };
}

/**
 * Reminds the client and the helper 24 h and 2 h before a confirmed booking starts. The outbox event's id
 * names the booking, the start and the threshold, so each reminder goes once, and a new start time (a
 * change request) reminds again.
 */
export async function remindUpcomingBookings(db: Db, now: Date, scope: { userId?: string; bookingId?: string } = {}): Promise<number> {
  const window = new Date(now.getTime() + Math.max(...START_REMINDER_HOURS) * HOUR);
  const conditions = [eq(bookings.status, 'confirmed'), gt(bookings.startAt, now), lte(bookings.startAt, window)];
  if (scope.userId) conditions.push(or(eq(bookings.posterUserId, scope.userId), eq(bookings.helperUserId, scope.userId))!);
  if (scope.bookingId) conditions.push(eq(bookings.id, scope.bookingId));
  const due = await db
    .select({ id: bookings.id, taskId: bookings.taskId, posterUserId: bookings.posterUserId, helperUserId: bookings.helperUserId, startAt: bookings.startAt, confirmedAt: bookings.confirmedAt })
    .from(bookings)
    .where(and(...conditions));
  let sent = 0;
  for (const row of due) {
    const reminder = startReminderDue(row.startAt, row.confirmedAt, now);
    if (!reminder) continue;
    const inserted = await db
      .insert(outboxEvents)
      .values({
        id: `evt_start_${row.id}_${row.startAt.getTime()}_${reminder.threshold}`,
        type: 'booking.start_reminder',
        aggregateType: 'booking',
        aggregateId: row.id,
        payload: { bookingId: row.id, taskId: row.taskId, posterUserId: row.posterUserId, helperUserId: row.helperUserId, hours: reminder.hoursLeft, startAt: row.startAt.toISOString() },
      })
      .onConflictDoNothing({ target: outboxEvents.id })
      .returning({ id: outboxEvents.id });
    sent += inserted.length;
  }
  return sent;
}
