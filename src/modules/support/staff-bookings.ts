import { and, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  ADMIN_BOOKING_FILTERS,
  type AdminBookingFilter,
  type AdminBookingFlag,
  type AdminBookingRow,
  type AdminBookingsPageData,
  type BookingStatus,
  type CategorySlug,
  type PriceBreakdown,
} from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { bookingCompletions, bookings, bookingTerms } from '@/modules/bookings/schema';
import { earnings } from '@/modules/earnings/schema';
import { categories } from '@/modules/markets/schema';
import { payments } from '@/modules/payments/schema';
import { tasks } from '@/modules/tasks/schema';
import type { Db } from '@/platform/db/connect';
import { supportCases } from './schema';
import { personSummaryOf } from './staff';

/**
 * The staff bookings list (UI-033; blueprint 02 admin, 08 §4): every booking, with the flags that need
 * staff attention, a filter tab and a search. Any staff member may read it.
 */

const PAGE_SIZE = 50;
const DAY = 86_400_000;
/** Money charged more than this long ago without reaching the helper needs a look (blueprint 10 §5). */
export const FUNDS_HELD_DAYS = 21;

const UPCOMING: BookingStatus[] = ['pending_funding', 'confirmed', 'in_progress', 'completion_submitted'];
const FINISHED: BookingStatus[] = ['completed', 'canceled'];

export const parseAdminBookingFilter = (value: unknown): AdminBookingFilter =>
  typeof value === 'string' && (ADMIN_BOOKING_FILTERS as readonly string[]).includes(value) ? (value as AdminBookingFilter) : 'attention';

interface Facts {
  status: BookingStatus;
  flags: AdminBookingFlag[];
}

const inFilter = (filter: AdminBookingFilter, facts: Facts): boolean =>
  filter === 'all'
    ? true
    : filter === 'attention'
      ? facts.flags.length > 0
      : filter === 'upcoming'
        ? UPCOMING.includes(facts.status)
        : FINISHED.includes(facts.status);

/** `routes.admin.bookings({ filter, q })`: newest start first, 50 rows; counts per tab for the same search. */
export async function getAdminBookings(db: Db, input: { filter: AdminBookingFilter; query: string }, now: Date): Promise<AdminBookingsPageData> {
  const query = input.query.trim().slice(0, 120);
  const poster = alias(users, 'poster');
  const helper = alias(users, 'helper');
  const fundsCutoff = new Date(now.getTime() - FUNDS_HELD_DAYS * DAY);

  const openCase = sql<boolean>`exists (select 1 from ${supportCases} c where c.booking_id = ${bookings.id} and c.status not in ('resolved', 'closed'))`;
  const paymentFailed = sql<boolean>`(${bookings.status} = 'pending_funding' and exists (select 1 from ${payments} p where p.booking_id = ${bookings.id} and p.purpose = 'booking_funding' and p.status = 'failed'))`;
  const fundsHeld = sql<boolean>`(${bookings.confirmedAt} < ${fundsCutoff} and ${bookings.status} <> 'canceled' and not exists (select 1 from ${earnings} e where e.booking_id = ${bookings.id} and e.kind = 'earnings' and e.status in ('transferred', 'paid_out')))`;
  const approvalOverdue = sql<boolean>`(${bookings.status} = 'completion_submitted' and ${bookings.approvalDueAt} < ${now})`;

  const conditions: SQL[] = [];
  if (query) {
    const like = `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    conditions.push(or(eq(bookings.id, query), ilike(tasks.title, like), ilike(poster.name, like), ilike(poster.email, like), ilike(helper.name, like), ilike(helper.email, like))!);
  }

  const all = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      startAt: bookings.startAt,
      openCase,
      paymentFailed,
      fundsHeld,
      approvalOverdue,
    })
    .from(bookings)
    .innerJoin(tasks, eq(tasks.id, bookings.taskId))
    .innerJoin(poster, eq(poster.id, bookings.posterUserId))
    .innerJoin(helper, eq(helper.id, bookings.helperUserId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(bookings.startAt), desc(bookings.id));

  const facts = new Map<string, Facts>();
  for (const row of all) {
    const flags: AdminBookingFlag[] = [];
    if (row.status === 'disputed') flags.push('disputed');
    if (row.openCase) flags.push('open_case');
    if (row.approvalOverdue) flags.push('approval_overdue');
    if (row.fundsHeld) flags.push('funds_held');
    if (row.paymentFailed) flags.push('payment_failed');
    facts.set(row.id, { status: row.status as BookingStatus, flags });
  }
  const counts = Object.fromEntries(ADMIN_BOOKING_FILTERS.map((filter) => [filter, all.filter((row) => inFilter(filter, facts.get(row.id)!)).length])) as Record<AdminBookingFilter, number>;
  const pageIds = all.filter((row) => inFilter(input.filter, facts.get(row.id)!)).slice(0, PAGE_SIZE).map((row) => row.id);

  const details = pageIds.length
    ? await db
        .select({ booking: bookings, title: tasks.title, slug: categories.slug, poster, helper, terms: bookingTerms.breakdown, final: bookingCompletions.finalBreakdown })
        .from(bookings)
        .innerJoin(tasks, eq(tasks.id, bookings.taskId))
        .innerJoin(categories, eq(categories.id, tasks.categoryId))
        .innerJoin(poster, eq(poster.id, bookings.posterUserId))
        .innerJoin(helper, eq(helper.id, bookings.helperUserId))
        .innerJoin(bookingTerms, and(eq(bookingTerms.bookingId, bookings.id), eq(bookingTerms.version, bookings.termsVersion)))
        .leftJoin(bookingCompletions, eq(bookingCompletions.bookingId, bookings.id))
        .where(inArray(bookings.id, pageIds))
    : [];
  const byId = new Map(details.map((row) => [row.booking.id, row]));
  const rows: AdminBookingRow[] = pageIds.flatMap((id) => {
    const row = byId.get(id);
    if (!row) return [];
    const breakdown: PriceBreakdown = row.final ?? row.terms;
    return [
      {
        id,
        title: row.title,
        categorySlug: row.slug as CategorySlug,
        status: row.booking.status as BookingStatus,
        start: row.booking.startAt.toISOString(),
        client: personSummaryOf(row.poster),
        helper: personSummaryOf(row.helper),
        totalCents: breakdown.posterTotalCents,
        flags: facts.get(id)!.flags,
      },
    ];
  });
  return { filter: input.filter, query, rows, counts };
}
