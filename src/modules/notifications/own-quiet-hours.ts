import { and, eq, gte, inArray, lte, ne } from 'drizzle-orm';
import { quietHoursInputSchema, type ActionResult, type QuietHoursInput, type QuietHoursSetting, type TimeZone } from '@/contracts';
import { validationFailed } from '@/platform/actions/results';
import { users } from '@/modules/accounts/schema';
import { bookings } from '@/modules/bookings/schema';
import { marketTimeZones } from '@/modules/markets/time-zone';
import { threads } from '@/modules/messaging/schema';
import type { Db } from '@/platform/db/connect';
import { quietUntil } from './quiet-hours';
import { notificationQuietHours } from './schema';

/** What the quiet-hours rule (quiet-hours.ts) reads from the database: people's settings, and a conversation's bookings. */

const HOUR = 3_600_000;

/** Each person's quiet hours, when they ever set them (off or on). */
export async function quietHoursOf(db: Db, userIds: readonly string[]): Promise<Map<string, QuietHoursSetting>> {
  if (userIds.length === 0) return new Map();
  const rows = await db.select().from(notificationQuietHours).where(inArray(notificationQuietHours.userId, [...userIds]));
  return new Map(rows.map((row) => [row.userId, { enabled: row.enabled, startsAt: row.startsAt, endsAt: row.endsAt }]));
}

/**
 * The start times of a conversation's bookings that aren't canceled, around now: a booking's own, or a series' visits
 * within a day and a half either way. None for other conversations (direct, offers, invites).
 */
export async function threadBookingStarts(db: Db, threadId: string, now: Date): Promise<Date[]> {
  const [thread] = await db.select({ kind: threads.kind, linkedId: threads.linkedId }).from(threads).where(eq(threads.id, threadId)).limit(1);
  if (!thread || (thread.kind !== 'booking' && thread.kind !== 'series')) return [];
  const rows = await db
    .select({ startAt: bookings.startAt })
    .from(bookings)
    .where(
      and(
        thread.kind === 'booking' ? eq(bookings.id, thread.linkedId) : eq(bookings.seriesId, thread.linkedId),
        ne(bookings.status, 'canceled'),
        ...(thread.kind === 'series' ? [gte(bookings.startAt, new Date(now.getTime() - 36 * HOUR)), lte(bookings.startAt, new Date(now.getTime() + 36 * HOUR))] : []),
      ),
    );
  return rows.map((row) => row.startAt);
}

/**
 * The note above a sender's message box (2026-11-24): until when the recipient's quiet hours keep a new message in the
 * thread from reaching their phone or email. Null when they're off, outside them, or the booking is today or soon.
 */
export async function recipientQuietUntil(db: Db, recipientId: string, threadId: string, now: Date): Promise<Date | null> {
  const quiet = (await quietHoursOf(db, [recipientId])).get(recipientId);
  if (!quiet?.enabled) return null;
  const [person] = await db.select({ homeMarketId: users.homeMarketId }).from(users).where(eq(users.id, recipientId)).limit(1);
  if (!person) return null;
  const timeZone: TimeZone | undefined = (await marketTimeZones(db, [person.homeMarketId])).get(person.homeMarketId);
  if (!timeZone) return null;
  return quietUntil({ type: 'message_received', now, quiet, timeZone, bookingStarts: await threadBookingStarts(db, threadId, now) });
}

/** Saves the person's quiet hours (on or off, and the times). ok `updated`. */
export async function saveQuietHours(db: Db, userId: string, input: QuietHoursInput, now: Date): Promise<ActionResult> {
  const parsed = quietHoursInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const values = { enabled: parsed.data.enabled, startsAt: parsed.data.startsAt, endsAt: parsed.data.endsAt, updatedAt: now };
  await db.insert(notificationQuietHours).values({ userId, ...values }).onConflictDoUpdate({ target: notificationQuietHours.userId, set: values });
  return { ok: true, code: 'updated' };
}
