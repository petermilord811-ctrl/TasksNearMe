import { and, eq, gt, lte } from 'drizzle-orm';
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
