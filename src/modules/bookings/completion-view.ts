import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';
import type { CompletionView } from '@/contracts';
import { photoFromFile } from '@/modules/files/uploads';
import { categories } from '@/modules/markets/schema';
import { files, tasks } from '@/modules/tasks/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { earnings } from '@/modules/earnings/schema';
import { recordCompletionMoney } from '@/modules/earnings/service';
import { refunds } from '@/modules/payments/schema';
import { realRowsOnly } from '@/shared/sample-data';
import { bookingThreadLink, postEvent } from '@/modules/messaging/service';
import { outboxEvents } from '@/platform/outbox/schema';
import { checklistView } from './checklist';
import { bookingCompletionPhotos, bookingCompletions, bookingExpenses, bookings, bookingTerms } from './schema';

/**
 * The submitted work as the booking page shows it, and the automatic approval when the client's
 * window ends. Shared by the booking page (hub.ts) and the completion flow (completion.ts).
 */

/** Submissions nobody answered are approved when the window ends (lazily, until the job runner exists). */
export async function autoApproveDue(db: Db, now: Date, scope: { bookingId?: string } = {}): Promise<void> {
  const conditions = [eq(bookings.status, 'completion_submitted'), lte(bookings.approvalDueAt, now)];
  if (scope.bookingId) conditions.push(eq(bookings.id, scope.bookingId));
  // The approval in one transaction (the booking, its conversation's line, the task, the event), so a server that stops
  // halfway (a crash, a deploy) can't leave a completed booking whose task, line and notices never come: the next run
  // doesn't find it again (when things break, 2026-11-21). The money comes after, outside it: it calls the payment
  // provider, and a transaction shouldn't wait on that.
  const approved = await db.transaction(async (tx) => {
    const rows = await tx
      .update(bookings)
      .set({ status: 'completed', completedVia: 'auto', completedAt: now, updatedAt: now })
      .where(and(...conditions))
      .returning({ id: bookings.id, taskId: bookings.taskId, posterUserId: bookings.posterUserId, helperUserId: bookings.helperUserId });
    if (rows.length === 0) return rows;
    for (const booking of rows) await postEvent(tx, bookingThreadLink(booking), 'status', { type: 'auto_approved' }, now);
    await tx.update(tasks).set({ status: 'completed', updatedAt: now }).where(inArray(tasks.id, rows.map((row) => row.taskId)));
    await tx.insert(outboxEvents).values(
      rows.map((row) => ({
        id: newId('evt'),
        type: 'booking.completed',
        aggregateType: 'booking',
        aggregateId: row.id,
        payload: { bookingId: row.id, taskId: row.taskId, via: 'auto' },
      })),
    );
    return rows;
  });
  // One booking's provider error, or a server that stops here, never strands the rest (booking reviews, money #5): the
  // sweep below records what's missing.
  for (const booking of approved) {
    try {
      await recordCompletionMoney(db, booking.id, now);
    } catch (error) {
      console.error(`[bookings] completion money for ${booking.id} failed; the sweep retries it`, error);
    }
  }
}

/**
 * Completed bookings whose money didn't finish (booking reviews, money #5): no earnings row yet, or a refund of unused
 * hours, allowance or a settlement owed and not made. `recordCompletionMoney` is idempotent, so each is run again,
 * oldest first, one at a time, with an error logged and left for the next run. Bookings completed in the last two
 * minutes are left to their own request; seed and demo bookings (ids not in the generated form) are never touched.
 */
export async function recordMissingCompletionMoney(db: Db, now: Date, limit = 25): Promise<number> {
  const settled = new Date(now.getTime() - 2 * 60_000);
  const rows = await db
    .select({ id: bookings.id })
    .from(bookings)
    .innerJoin(bookingCompletions, eq(bookingCompletions.bookingId, bookings.id))
    .where(
      and(
        eq(bookings.status, 'completed'),
        lte(bookings.completedAt, settled),
        // Real bookings only: seed and demo rows were written complete, and a payout must never be invented for them.
        realRowsOnly(bookings.id),
        sql`(
          (coalesce((${bookingCompletions.finalBreakdown} ->> 'helperEarningsCents')::int, 0) > 0
            and not exists (select 1 from ${earnings} e where e.booking_id = ${bookings.id} and e.kind = 'earnings'))
          or (coalesce((${bookingCompletions.finalBreakdown} ->> 'posterRefundCents')::int, 0) > 0
            and not exists (select 1 from ${refunds} r where r.booking_id = ${bookings.id} and r.reason in ('unused_cap', 'unused_allowance', 'dispute_settlement') and r.status <> 'failed'))
        )`,
      ),
    )
    .orderBy(asc(bookings.completedAt))
    .limit(limit);
  let done = 0;
  for (const row of rows) {
    try {
      await recordCompletionMoney(db, row.id, now);
      done += 1;
    } catch (error) {
      console.error(`[bookings] completion money for ${row.id} failed again`, error);
    }
  }
  return done;
}

/** The submitted work for the booking page (both people). */
export async function completionViewOf(db: Db, bookingId: string): Promise<CompletionView | null> {
  const [completion] = await db.select().from(bookingCompletions).where(eq(bookingCompletions.bookingId, bookingId)).limit(1);
  if (!completion) return null;
  const [terms] = await db
    .select({ hoursCap: bookingTerms.hoursCap, categorySlug: categories.slug })
    .from(bookingTerms)
    .innerJoin(bookings, and(eq(bookings.id, bookingTerms.bookingId), eq(bookings.termsVersion, bookingTerms.version)))
    .innerJoin(tasks, eq(tasks.id, bookings.taskId))
    .innerJoin(categories, eq(categories.id, tasks.categoryId))
    .where(eq(bookingTerms.bookingId, bookingId))
    .limit(1);
  const checklist = terms ? checklistView(terms.categorySlug, completion.checklist) : undefined;
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
    ...(completion.hoursWorked !== null && terms?.hoursCap ? { hoursCap: terms.hoursCap } : {}),
    expenses: expenseRows.map(({ expense, file }) => ({
      id: expense.id,
      description: expense.description,
      amountCents: expense.amountCents,
      receipt: photoFromFile(file),
    })),
    finalBreakdown: completion.finalBreakdown,
    ...(checklist ? { checklist } : {}),
  };
}
