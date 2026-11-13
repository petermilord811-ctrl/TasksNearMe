import { and, eq, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import type { FileStorage } from '@/integrations/storage';
import { sessions, verifications } from '@/modules/accounts/schema';
import { bookingCompletionPhotos, bookingExpenses } from '@/modules/bookings/schema';
import { messages } from '@/modules/messaging/schema';
import { files, taskLocations } from '@/modules/tasks/schema';
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { rateLimits } from '@/platform/rate-limit/schema';

/**
 * Retention timers (blueprint 08 §5; completion plan 3.4), run by the job runner once an hour:
 * - exact addresses: deleted 180 days after the last booking there (or after the task closed, when it was
 *   never booked); never while a task or booking there is open, a support case about it is open, or a
 *   rebooking proposal from it waits. The row stays (tasks point at it), without the address;
 * - messages: a conversation's messages and their attachments, 2 years after its last message;
 * - completion photos and receipts: 2 years after the booking finished;
 * - the audit log: 7 years;
 * - expired sessions and sign-in codes, and old rate-limit windows: housekeeping.
 * Nothing is kept past these while a support case about it is open. Payments, ledger and tax records keep
 * their 7 years (the first fall due in 2033; a sweep is added before then). Each sweep takes a batch, so a
 * backlog clears over a few runs without a long transaction.
 */

export const RETENTION_RULES = { addressDays: 180, messageYears: 2, completionFileYears: 2, auditYears: 7 } as const;

const DAY_MS = 86_400_000;
const YEAR_MS = 365 * DAY_MS;
const OPEN_BOOKING = sql`('scheduled', 'pending_funding', 'confirmed', 'in_progress', 'completion_submitted', 'disputed')`;
const CLOSED_CASE = sql`('resolved', 'closed')`;

export interface RetentionDeps {
  storage: FileStorage;
}

const idsOf = (result: { rows: unknown[] }) => (result.rows as { id: string }[]).map((row) => row.id);

/** Exact addresses no one needs any more. */
export async function sweepAddresses(db: Db, now: Date, { limit = 200, only }: { limit?: number; only?: string[] } = {}): Promise<number> {
  const cutoff = new Date(now.getTime() - RETENTION_RULES.addressDays * DAY_MS);
  const due = idsOf(
    await db.execute(sql`
      select l.id from task_locations l
      where l.deleted_at is null and l.created_at < ${cutoff}
        ${only ? sql`and l.id in ${only}` : sql``}
        and not exists (select 1 from tasks t where t.location_id = l.id and (t.status in ('draft', 'open', 'assigned') or t.updated_at >= ${cutoff}))
        and not exists (
          select 1 from tasks t join bookings b on b.task_id = t.id
          where t.location_id = l.id and (b.status in ${OPEN_BOOKING} or b.updated_at >= ${cutoff} or coalesce(b.completed_at, b.canceled_at, b.start_at) >= ${cutoff})
        )
        and not exists (
          select 1 from tasks t join bookings b on b.task_id = t.id join support_cases c on c.booking_id = b.id
          where t.location_id = l.id and c.status not in ${CLOSED_CASE}
        )
        and not exists (
          select 1 from tasks t join bookings b on b.task_id = t.id join rebook_proposals p on p.from_booking_id = b.id
          where t.location_id = l.id and p.status = 'sent'
        )
        and not exists (
          select 1 from tasks t join booking_series s on s.template_task_id = t.id
          where t.location_id = l.id and s.status in ('active', 'paused')
        )
      limit ${limit}
    `),
  );
  if (due.length === 0) return 0;
  const deleted = await db
    .update(taskLocations)
    .set({ addressEnc: '', deletedAt: now })
    .where(and(inArray(taskLocations.id, due), isNull(taskLocations.deletedAt)))
    .returning({ id: taskLocations.id });
  return deleted.length;
}

async function deleteFiles(db: Db, deps: RetentionDeps, fileIds: string[]): Promise<void> {
  if (fileIds.length === 0) return;
  const rows = await db.select({ id: files.id, storageKey: files.storageKey }).from(files).where(inArray(files.id, fileIds));
  for (const row of rows) await deps.storage.delete(row.storageKey);
  if (rows.length) await db.delete(files).where(inArray(files.id, rows.map((row) => row.id)));
}

/** Conversations quiet for 2 years: their messages and attachments. */
export async function sweepMessages(db: Db, deps: RetentionDeps, now: Date, { limit = 100, only }: { limit?: number; only?: string[] } = {}): Promise<number> {
  const cutoff = new Date(now.getTime() - RETENTION_RULES.messageYears * YEAR_MS);
  const threadIds = idsOf(
    await db.execute(sql`
      select th.id from threads th
      where coalesce(th.last_message_at, th.created_at) < ${cutoff}
        ${only ? sql`and th.id in ${only}` : sql``}
        and exists (select 1 from messages m where m.thread_id = th.id)
        and not exists (
          select 1 from bookings b join support_cases c on c.booking_id = b.id
          where th.task_id is not null and b.task_id = th.task_id and c.status not in ${CLOSED_CASE}
        )
      limit ${limit}
    `),
  );
  if (threadIds.length === 0) return 0;
  const rows = await db.select({ id: messages.id, attachments: messages.attachmentFileIds }).from(messages).where(inArray(messages.threadId, threadIds));
  const attachmentIds = rows.flatMap((row) => (Array.isArray(row.attachments) ? (row.attachments as string[]) : []));
  await db.delete(messages).where(inArray(messages.threadId, threadIds));
  await deleteFiles(db, deps, attachmentIds);
  return rows.length;
}

/**
 * Completion photos and receipts of bookings finished 2 years ago. The photos go entirely; a receipt's
 * image goes but its record stays (an empty storage key), since the expense line it belongs to is part
 * of the money record.
 */
export async function sweepCompletionFiles(db: Db, deps: RetentionDeps, now: Date, { limit = 100, only }: { limit?: number; only?: string[] } = {}): Promise<number> {
  const cutoff = new Date(now.getTime() - RETENTION_RULES.completionFileYears * YEAR_MS);
  const bookingIds = idsOf(
    await db.execute(sql`
      select b.id from bookings b
      where b.status in ('completed', 'canceled') and coalesce(b.completed_at, b.canceled_at, b.updated_at) < ${cutoff}
        ${only ? sql`and b.id in ${only}` : sql``}
        and (
          exists (select 1 from booking_completion_photos p where p.booking_id = b.id)
          or exists (select 1 from booking_expenses e join files f on f.id = e.receipt_file_id where e.booking_id = b.id and f.storage_key <> '')
        )
        and not exists (select 1 from support_cases c where c.booking_id = b.id and c.status not in ${CLOSED_CASE})
      limit ${limit}
    `),
  );
  if (bookingIds.length === 0) return 0;
  const photos = await db.select({ fileId: bookingCompletionPhotos.fileId }).from(bookingCompletionPhotos).where(inArray(bookingCompletionPhotos.bookingId, bookingIds));
  await db.delete(bookingCompletionPhotos).where(inArray(bookingCompletionPhotos.bookingId, bookingIds));
  await deleteFiles(db, deps, photos.map((row) => row.fileId));
  const receiptIds = (await db.select({ fileId: bookingExpenses.receiptFileId }).from(bookingExpenses).where(inArray(bookingExpenses.bookingId, bookingIds))).map((row) => row.fileId);
  const receipts = receiptIds.length ? await db.select({ id: files.id, storageKey: files.storageKey }).from(files).where(and(inArray(files.id, receiptIds), ne(files.storageKey, ''))) : [];
  for (const receipt of receipts) await deps.storage.delete(receipt.storageKey);
  if (receipts.length) await db.update(files).set({ storageKey: '', bytes: 0 }).where(inArray(files.id, receipts.map((row) => row.id)));
  return photos.length + receipts.length;
}

/** Audit entries past 7 years. */
export async function sweepAudit(db: Db, now: Date, limit = 1_000): Promise<number> {
  const cutoff = new Date(now.getTime() - RETENTION_RULES.auditYears * YEAR_MS);
  const due = (await db.select({ id: auditLog.id }).from(auditLog).where(lt(auditLog.at, cutoff.toISOString())).limit(limit)).map((row) => row.id);
  if (due.length === 0) return 0;
  await db.delete(auditLog).where(inArray(auditLog.id, due));
  return due.length;
}

/** Housekeeping: sessions and sign-in codes a day past their expiry, rate-limit windows a week old. */
export async function sweepExpired(db: Db, now: Date): Promise<number> {
  const dayAgo = new Date(now.getTime() - DAY_MS);
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const [a, b, c] = await Promise.all([
    db.delete(sessions).where(lt(sessions.expiresAt, dayAgo)).returning({ id: sessions.id }),
    db.delete(verifications).where(lt(verifications.expiresAt, dayAgo)).returning({ id: verifications.id }),
    db.delete(rateLimits).where(lt(rateLimits.windowStart, weekAgo)).returning({ key: rateLimits.key }),
  ]);
  return a.length + b.length + c.length;
}

export async function runRetention(db: Db, deps: RetentionDeps, now: Date) {
  return {
    addresses: await sweepAddresses(db, now),
    messages: await sweepMessages(db, deps, now),
    completionFiles: await sweepCompletionFiles(db, deps, now),
    audit: await sweepAudit(db, now),
    expired: await sweepExpired(db, now),
  };
}

/** The runner calls every minute; the sweeps run once an hour. */
export const retentionDue = (now: Date) => now.getUTCMinutes() === 23;

/** For tests: is this address gone? */
export async function addressDeleted(db: Db, locationId: string): Promise<boolean> {
  const [row] = await db.select({ deletedAt: taskLocations.deletedAt, addressEnc: taskLocations.addressEnc }).from(taskLocations).where(eq(taskLocations.id, locationId)).limit(1);
  return Boolean(row?.deletedAt) && row?.addressEnc === '';
}
