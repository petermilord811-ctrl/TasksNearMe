import { eq } from 'drizzle-orm';
import { bookingChatActionInputSchema, type ActionResult, type BookingChatActionInput, type LateByMinutes } from '@/contracts';
import { threads } from '@/modules/messaging/schema';
import { validationFailed } from '@/platform/actions/results';
import type { Db } from '@/platform/db/connect';
import { runBookingAction } from './hub';
import { reportRunningLate } from './sheets';

/**
 * A day-of chip in a booking's conversation (2026-11-24): the booking page's own action on the conversation's booking,
 * with its rules and its status line (on the way, running late, arrived, the client's "I'm here"). Only the booking's
 * two people (anyone else: not found); `submit_completion` answers with the completion form, as on the booking page.
 */
export async function runBookingChatAction(db: Db, userId: string, threadId: string, input: BookingChatActionInput, now: Date): Promise<ActionResult> {
  const parsed = bookingChatActionInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const [thread] = await db.select({ kind: threads.kind, bookingId: threads.linkedId }).from(threads).where(eq(threads.id, String(threadId))).limit(1);
  if (!thread || thread.kind !== 'booking') return { ok: false, code: 'not_found' };
  const { action, minutes } = parsed.data;
  // The booking page's sheet for this one (it asks by how many minutes); every other chip is its single tap.
  if (action === 'running_late') return reportRunningLate(db, userId, thread.bookingId, minutes as LateByMinutes, now);
  return runBookingAction(db, userId, thread.bookingId, action, now);
}
