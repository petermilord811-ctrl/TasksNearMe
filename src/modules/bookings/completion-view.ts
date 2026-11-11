import { and, asc, eq, inArray, lte } from 'drizzle-orm';
import type { CompletionView } from '@/contracts';
import { photoFromFile } from '@/modules/files/uploads';
import { files, tasks } from '@/modules/tasks/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { bookingThreadLink, postEvent } from '@/modules/messaging/service';
import { outboxEvents } from '@/platform/outbox/schema';
import { bookingCompletionPhotos, bookingCompletions, bookingExpenses, bookings } from './schema';

/**
 * The submitted work as the booking page shows it, and the automatic approval when the client's
 * window ends. Shared by the booking page (hub.ts) and the completion flow (completion.ts).
 */

/** Submissions nobody answered are approved when the window ends (lazily, until the job runner exists). */
export async function autoApproveDue(db: Db, now: Date, scope: { bookingId?: string } = {}): Promise<void> {
  const conditions = [eq(bookings.status, 'completion_submitted'), lte(bookings.approvalDueAt, now)];
  if (scope.bookingId) conditions.push(eq(bookings.id, scope.bookingId));
  const approved = await db
    .update(bookings)
    .set({ status: 'completed', completedVia: 'auto', completedAt: now, updatedAt: now })
    .where(and(...conditions))
    .returning({ id: bookings.id, taskId: bookings.taskId, posterUserId: bookings.posterUserId, helperUserId: bookings.helperUserId });
  if (approved.length === 0) return;
  for (const booking of approved) await postEvent(db, bookingThreadLink(booking), 'status', { type: 'auto_approved' }, now);
  await db.update(tasks).set({ status: 'completed', updatedAt: now }).where(inArray(tasks.id, approved.map((row) => row.taskId)));
  await db.insert(outboxEvents).values(
    approved.map((row) => ({
      id: newId('evt'),
      type: 'booking.completed',
      aggregateType: 'booking',
      aggregateId: row.id,
      payload: { bookingId: row.id, taskId: row.taskId, via: 'auto' },
    })),
  );
}

/** The submitted work for the booking page (both people). */
export async function completionViewOf(db: Db, bookingId: string): Promise<CompletionView | null> {
  const [completion] = await db.select().from(bookingCompletions).where(eq(bookingCompletions.bookingId, bookingId)).limit(1);
  if (!completion) return null;
  const [photoRows, expenseRows] = await Promise.all([
    db
      .select({ file: files })
      .from(bookingCompletionPhotos)
      .innerJoin(files, eq(files.id, bookingCompletionPhotos.fileId))
      .where(eq(bookingCompletionPhotos.bookingId, bookingId))
      .orderBy(asc(bookingCompletionPhotos.position)),
    db
      .select({ expense: bookingExpenses, file: files })
      .from(bookingExpenses)
      .innerJoin(files, eq(files.id, bookingExpenses.receiptFileId))
      .where(eq(bookingExpenses.bookingId, bookingId))
      .orderBy(asc(bookingExpenses.position)),
  ]);
  return {
    submittedAt: completion.submittedAt.toISOString(),
    ...(completion.note ? { note: completion.note } : {}),
    photos: photoRows.map(({ file }) => photoFromFile(file)),
    ...(completion.hoursWorked !== null ? { hoursWorked: completion.hoursWorked } : {}),
    expenses: expenseRows.map(({ expense, file }) => ({
      id: expense.id,
      description: expense.description,
      amountCents: expense.amountCents,
      receipt: photoFromFile(file),
    })),
    finalBreakdown: completion.finalBreakdown,
  };
}
