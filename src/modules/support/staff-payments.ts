import { and, desc, eq, gte, inArray, or, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import {
  ADMIN_MONEY_TABS,
  type AdminMoneyRow,
  type AdminMoneyTab,
  type AdminMoneyTotals,
  type AdminPaymentsPageData,
  type PriceBreakdown,
} from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { bookingCompletions, bookings, bookingTerms } from '@/modules/bookings/schema';
import { earnings, payouts } from '@/modules/earnings/schema';
import { payments, refunds } from '@/modules/payments/schema';
import { tasks } from '@/modules/tasks/schema';
import type { Db } from '@/platform/db/connect';
import { personSummaryOf } from './staff';

/**
 * Money for staff (UI-034; blueprint 02 `/admin/payments`, 10 §5): charges, refunds, transfers and payouts,
 * and the reconciliation exceptions that need a person. Every staff member can read it.
 */

const PAGE_SIZE = 100;
const DAY = 86_400_000;
/** Earnings go out when a booking completes; two days without them is an exception. */
export const TRANSFER_GRACE_DAYS = 2;

export const parseAdminMoneyTab = (value: unknown): AdminMoneyTab =>
  typeof value === 'string' && (ADMIN_MONEY_TABS as readonly string[]).includes(value) ? (value as AdminMoneyTab) : 'exceptions';

type UserRow = typeof users.$inferSelect;

/** The search: a booking id, or a person's name or email (contains). */
function personMatch(query: string, userId: AnyColumn, bookingId: AnyColumn | null): SQL | undefined {
  if (!query) return undefined;
  const like = `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
  const person = sql`exists (select 1 from ${users} u where u.id = ${userId} and (u.name ilike ${like} or u.email ilike ${like}))`;
  return bookingId ? or(eq(bookingId, query), person) : person;
}

interface Found {
  rows: AdminMoneyRow[];
  count: number;
}

async function people(db: Db, ids: string[]): Promise<Map<string, UserRow>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  return new Map((await db.select().from(users).where(inArray(users.id, unique))).map((user) => [user.id, user]));
}

async function titles(db: Db, bookingIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(bookingIds)];
  if (unique.length === 0) return new Map();
  const rows = await db.select({ id: bookings.id, title: tasks.title }).from(bookings).innerJoin(tasks, eq(tasks.id, bookings.taskId)).where(inArray(bookings.id, unique));
  return new Map(rows.map((row) => [row.id, row.title]));
}

/** Rows to the contract shape (people and booking titles in two queries). */
async function finish(db: Db, raw: (Omit<AdminMoneyRow, 'person' | 'booking'> & { personId: string; bookingId: string | null })[]): Promise<AdminMoneyRow[]> {
  const [byPerson, byBooking] = await Promise.all([people(db, raw.map((row) => row.personId)), titles(db, raw.flatMap((row) => (row.bookingId ? [row.bookingId] : [])))]);
  return raw.flatMap(({ personId, bookingId, ...row }) => {
    const user = byPerson.get(personId);
    if (!user) return [];
    const title = bookingId ? byBooking.get(bookingId) : undefined;
    return [{ ...row, person: personSummaryOf(user), ...(bookingId && title ? { booking: { id: bookingId, title } } : {}) }];
  });
}

async function charges(db: Db, query: string, onlyIds?: string[]): Promise<Found> {
  const where = and(personMatch(query, payments.payerUserId, payments.bookingId), onlyIds ? inArray(payments.id, onlyIds.length ? onlyIds : ['-']) : undefined);
  const [rows, [total]] = await Promise.all([
    db.select().from(payments).where(where).orderBy(desc(payments.createdAt)).limit(PAGE_SIZE),
    db.select({ value: sql<number>`count(*)::int` }).from(payments).where(where),
  ]);
  return {
    rows: await finish(db, rows.map((row) => ({ id: row.id, kind: 'charge' as const, amountCents: row.amountCents, status: row.status as AdminMoneyRow['status'], at: row.createdAt.toISOString(), personId: row.payerUserId, bookingId: row.bookingId, ...(row.providerRef ? { reference: row.providerRef } : {}), detail: row.purpose }))),
    count: total?.value ?? 0,
  };
}

async function refundRows(db: Db, query: string, conditions: SQL[] = []): Promise<Found> {
  const where = and(personMatch(query, payments.payerUserId, refunds.bookingId), ...conditions);
  const [rows, [total]] = await Promise.all([
    db.select({ refund: refunds, payer: payments.payerUserId }).from(refunds).innerJoin(payments, eq(payments.id, refunds.paymentId)).where(where).orderBy(desc(refunds.createdAt)).limit(PAGE_SIZE),
    db.select({ value: sql<number>`count(*)::int` }).from(refunds).innerJoin(payments, eq(payments.id, refunds.paymentId)).where(where),
  ]);
  return {
    rows: await finish(db, rows.map(({ refund, payer }) => ({ id: refund.id, kind: 'refund' as const, amountCents: refund.amountCents, status: refund.status as AdminMoneyRow['status'], at: refund.createdAt.toISOString(), personId: payer, bookingId: refund.bookingId, ...(refund.providerRef ? { reference: refund.providerRef } : {}), detail: refund.reason }))),
    count: total?.value ?? 0,
  };
}

async function transfers(db: Db, query: string): Promise<Found> {
  const where = personMatch(query, earnings.helperUserId, earnings.bookingId);
  const [rows, [total]] = await Promise.all([
    db.select().from(earnings).where(where).orderBy(desc(earnings.createdAt)).limit(PAGE_SIZE),
    db.select({ value: sql<number>`count(*)::int` }).from(earnings).where(where),
  ]);
  return {
    rows: await finish(db, rows.map((row) => ({ id: row.id, kind: 'transfer' as const, amountCents: row.amountCents, status: row.status as AdminMoneyRow['status'], at: (row.transferredAt ?? row.createdAt).toISOString(), personId: row.helperUserId, bookingId: row.bookingId, ...(row.transferRef ? { reference: row.transferRef } : {}), detail: row.kind }))),
    count: total?.value ?? 0,
  };
}

async function payoutRows(db: Db, query: string, conditions: SQL[] = []): Promise<Found> {
  const where = and(personMatch(query, payouts.helperUserId, null), ...conditions);
  const [rows, [total]] = await Promise.all([
    db.select().from(payouts).where(where).orderBy(desc(payouts.createdAt)).limit(PAGE_SIZE),
    db.select({ value: sql<number>`count(*)::int` }).from(payouts).where(where),
  ]);
  return {
    rows: await finish(db, rows.map((row) => ({ id: row.id, kind: 'payout' as const, amountCents: row.amountCents, status: row.status as AdminMoneyRow['status'], at: row.createdAt.toISOString(), personId: row.helperUserId, bookingId: null, ...(row.providerRef ? { reference: row.providerRef } : {}), detail: row.bankLast4 }))),
    count: total?.value ?? 0,
  };
}

/** Everything that doesn't add up, newest first. */
async function exceptions(db: Db, query: string, now: Date): Promise<Found> {
  const graceCutoff = new Date(now.getTime() - TRANSFER_GRACE_DAYS * DAY);
  const [failedRefunds, failedPayouts, missing, unrefunded] = await Promise.all([
    refundRows(db, query, [eq(refunds.status, 'failed')]),
    // Only a failure that is still the helper's latest payout (5.17): once a later payout went out, Stripe sent that
    // money again (with the bank fixed) and nobody needs to act. The payouts tab keeps the history.
    payoutRows(db, query, [eq(payouts.status, 'failed'), sql`not exists (select 1 from ${payouts} later where later.helper_user_id = ${payouts.helperUserId} and later.created_at > ${payouts.createdAt})`]),
    db
      .select({ booking: bookings, terms: bookingTerms.breakdown, final: bookingCompletions.finalBreakdown })
      .from(bookings)
      .innerJoin(bookingTerms, and(eq(bookingTerms.bookingId, bookings.id), eq(bookingTerms.version, bookings.termsVersion)))
      .leftJoin(bookingCompletions, eq(bookingCompletions.bookingId, bookings.id))
      .where(
        and(
          eq(bookings.status, 'completed'),
          sql`${bookings.completedAt} < ${graceCutoff}`,
          sql`not exists (select 1 from ${earnings} e where e.booking_id = ${bookings.id} and e.kind = 'earnings' and e.status in ('transferred', 'paid_out'))`,
          personMatch(query, bookings.helperUserId, bookings.id),
        ),
      )
      .orderBy(desc(bookings.completedAt))
      .limit(PAGE_SIZE),
    db
      .select({ payment: payments })
      .from(payments)
      .innerJoin(bookings, eq(bookings.id, payments.bookingId))
      .where(
        and(
          eq(bookings.status, 'canceled'),
          eq(payments.purpose, 'booking_funding'),
          eq(payments.status, 'succeeded'),
          sql`not exists (select 1 from ${refunds} r where r.payment_id = ${payments.id})`,
          sql`not exists (select 1 from ${earnings} e where e.booking_id = ${bookings.id} and e.kind = 'cancellation_compensation')`,
          personMatch(query, payments.payerUserId, payments.bookingId),
        ),
      )
      .orderBy(desc(payments.createdAt))
      .limit(PAGE_SIZE),
  ]);
  const missingRows = await finish(
    db,
    missing.map(({ booking, terms, final }) => {
      const breakdown: PriceBreakdown = final ?? terms;
      return { id: booking.id, kind: 'transfer' as const, amountCents: breakdown.helperEarningsCents, status: 'pending' as const, at: (booking.completedAt ?? booking.updatedAt).toISOString(), personId: booking.helperUserId, bookingId: booking.id, detail: 'earnings', exception: 'transfer_missing' as const };
    }),
  );
  const unrefundedRows = await finish(
    db,
    unrefunded.map(({ payment }) => ({ id: payment.id, kind: 'charge' as const, amountCents: payment.amountCents, status: 'succeeded' as const, at: payment.createdAt.toISOString(), personId: payment.payerUserId, bookingId: payment.bookingId, ...(payment.providerRef ? { reference: payment.providerRef } : {}), detail: payment.purpose, exception: 'canceled_not_refunded' as const })),
  );
  const rows = [
    ...failedRefunds.rows.map((row) => ({ ...row, exception: 'refund_failed' as const })),
    ...failedPayouts.rows.map((row) => ({ ...row, exception: 'payout_failed' as const })),
    ...missingRows,
    ...unrefundedRows,
  ].sort((a, b) => b.at.localeCompare(a.at));
  return { rows: rows.slice(0, PAGE_SIZE), count: failedRefunds.count + failedPayouts.count + missing.length + unrefunded.length };
}

async function totals(db: Db, now: Date): Promise<AdminMoneyTotals> {
  const since = new Date(now.getTime() - 30 * DAY);
  const sum = (column: SQL) => sql<number>`coalesce(sum(${column}), 0)::int`;
  const [[charged], [refunded], [transferred], [paidOut]] = await Promise.all([
    db.select({ value: sum(sql`${payments.amountCents}`) }).from(payments).where(and(inArray(payments.status, ['succeeded', 'partially_refunded', 'refunded']), gte(payments.createdAt, since))),
    db.select({ value: sum(sql`${refunds.amountCents}`) }).from(refunds).where(and(eq(refunds.status, 'succeeded'), gte(refunds.createdAt, since))),
    db.select({ value: sum(sql`${earnings.amountCents}`) }).from(earnings).where(and(inArray(earnings.status, ['transferred', 'paid_out']), gte(earnings.createdAt, since))),
    db.select({ value: sum(sql`${payouts.amountCents}`) }).from(payouts).where(and(eq(payouts.status, 'paid'), gte(payouts.createdAt, since))),
  ]);
  return { chargedCents: charged?.value ?? 0, refundedCents: refunded?.value ?? 0, transferredCents: transferred?.value ?? 0, paidOutCents: paidOut?.value ?? 0 };
}

/** `routes.admin.payments({ tab, q })`. */
export async function getAdminPayments(db: Db, input: { tab: AdminMoneyTab; query: string }, now: Date): Promise<AdminPaymentsPageData> {
  const query = input.query.trim().slice(0, 120);
  const [found, sums] = await Promise.all([
    Promise.all([exceptions(db, query, now), charges(db, query), refundRows(db, query), transfers(db, query), payoutRows(db, query)]),
    totals(db, now),
  ]);
  const byTab: Record<AdminMoneyTab, Found> = { exceptions: found[0], charges: found[1], refunds: found[2], transfers: found[3], payouts: found[4] };
  return {
    tab: input.tab,
    query,
    rows: byTab[input.tab].rows,
    counts: Object.fromEntries(ADMIN_MONEY_TABS.map((tab) => [tab, byTab[tab].count])) as Record<AdminMoneyTab, number>,
    totals: sums,
  };
}

