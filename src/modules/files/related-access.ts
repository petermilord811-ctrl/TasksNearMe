import { and, eq, ne, or, sql } from 'drizzle-orm';
import { users } from '@/modules/accounts/schema';
import { bookingCompletionPhotos, bookingExpenses, bookings } from '@/modules/bookings/schema';
import { canViewMessageFile } from '@/modules/messaging/service';
import { supportCases } from '@/modules/support/schema';
import { loadHelperState } from '@/modules/offers/helper';
import { taskPhotos, tasks } from '@/modules/tasks/schema';
import type { Db } from '@/platform/db/connect';

/**
 * File access that depends on what the file belongs to (ui-contract §5), on top of `canViewFile`
 * (owner, staff, public work samples):
 * - task photos: helpers bookable in at least one category while the task is open, and the task's
 *   booked helper while the booking lasts (not after it's canceled);
 * - evidence and receipts: both people on the booking they were sent with (completion photos,
 *   receipts, photos in a problem report);
 * - message photos: the people in the thread.
 */
/**
 * A profile photo is public (anyone, signed in or not) while it's its owner's current photo: helpers' show on
 * their public profile. A replaced or removed photo goes back to owner and staff only.
 */
export async function isCurrentProfilePhoto(db: Db, file: { id: string; kind: string; ownerUserId: string }): Promise<boolean> {
  if (file.kind !== 'avatar') return false;
  const [owner] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, file.ownerUserId), eq(users.avatarFileId, file.id))).limit(1);
  return owner !== undefined;
}

export async function canViewRelatedFile(db: Db, file: { id: string; kind: string }, userId: string, now: Date): Promise<boolean> {
  if (file.kind === 'evidence' || file.kind === 'receipt') return isBookingParticipantFor(db, file.id, userId);
  if (file.kind === 'message') return canViewMessageFile(db, file.id, userId);
  if (file.kind !== 'task_photo') return false;
  const [task] = await db
    .select({ id: tasks.id, status: tasks.status, windowEnd: tasks.windowEnd })
    .from(taskPhotos)
    .innerJoin(tasks, eq(tasks.id, taskPhotos.taskId))
    .where(eq(taskPhotos.fileId, file.id))
    .limit(1);
  if (!task) return false;
  const [booked] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(and(eq(bookings.taskId, task.id), eq(bookings.helperUserId, userId), ne(bookings.status, 'canceled')))
    .limit(1);
  if (booked) return true;
  if (task.status !== 'open' || task.windowEnd <= now) return false;
  const helper = await loadHelperState(db, userId, now);
  return helper.setup.bookable;
}

async function isBookingParticipantFor(db: Db, fileId: string, userId: string): Promise<boolean> {
  const participant = or(eq(bookings.posterUserId, userId), eq(bookings.helperUserId, userId));
  const [photo] = await db
    .select({ id: bookings.id })
    .from(bookingCompletionPhotos)
    .innerJoin(bookings, eq(bookings.id, bookingCompletionPhotos.bookingId))
    .where(and(eq(bookingCompletionPhotos.fileId, fileId), participant))
    .limit(1);
  if (photo) return true;
  const [receipt] = await db
    .select({ id: bookings.id })
    .from(bookingExpenses)
    .innerJoin(bookings, eq(bookings.id, bookingExpenses.bookingId))
    .where(and(eq(bookingExpenses.receiptFileId, fileId), participant))
    .limit(1);
  if (receipt) return true;
  const [reported] = await db
    .select({ id: bookings.id })
    .from(supportCases)
    .innerJoin(bookings, eq(bookings.id, supportCases.bookingId))
    .where(and(eq(supportCases.type, 'dispute'), sql`${supportCases.fileIds} @> ${JSON.stringify([fileId])}::jsonb`, participant))
    .limit(1);
  return Boolean(reported);
}
