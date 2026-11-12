import { and, eq } from 'drizzle-orm';
import { devCardRef } from '../../../src/integrations/payments';
import { bookingCompletions, bookingTerms, bookings } from '../../../src/modules/bookings/schema';
import { marketPolicies } from '../../../src/modules/markets/schema';
import { offers } from '../../../src/modules/offers/schema';
import { quoteBreakdown } from '../../../src/modules/payments/fees';
import { payments, refunds } from '../../../src/modules/payments/schema';
import { tasks } from '../../../src/modules/tasks/schema';
import { createDb } from '../../../src/platform/db/connect';

/**
 * Rows an e2e test writes for itself, so it can change them without touching the seeded data other tests
 * read. Task ids start with `tsk_e2e_`: the next seed removes them with everything on them.
 */

const HOUR = 3_600_000;

function database() {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // Environment provided by the shell (CI).
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set (see .env.example).');
  return createDb(url, { max: 1 });
}

export interface BookingScenario {
  taskId: string;
  bookingId: string;
  title: string;
}

type ScenarioState =
  | { kind: 'canceled'; reason: 'helper' | 'helper_no_show' }
  /** Jordan sent the work now; Chris has 72 h to approve. */
  | { kind: 'completion_submitted' };

/**
 * A copy of the desk posted by Chris, booked with Jordan ($60; Sam's offer declined at booking), in
 * `state`. `startsInMs` places the start (negative: past).
 */
async function scenario(name: string, state: ScenarioState, startsInMs: number): Promise<BookingScenario> {
  const { db, pool } = database();
  try {
    const run = Date.now().toString(36);
    const taskId = `tsk_e2e_${name}_${run}`;
    const bookingId = `bkg_e2e_${name}_${run}`;
    const title = `Assemble a desk (e2e ${name} ${run})`;
    const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
    const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_jordan'));
    if (!desk || !offer) throw new Error('The seeded desk is missing');
    const [policy] = await db.select().from(marketPolicies).where(and(eq(marketPolicies.marketId, desk.marketId), eq(marketPolicies.status, 'published')));
    if (!policy) throw new Error('No published market policy');

    const now = new Date();
    const start = new Date(now.getTime() + startsInMs);
    const bookedAt = new Date(Math.min(now.getTime(), start.getTime()) - 2 * HOUR);
    const canceled = state.kind === 'canceled';
    const changedAt = canceled && state.reason === 'helper' ? new Date(now.getTime() - HOUR) : now;
    const breakdown = quoteBreakdown(policy.fees, { type: 'fixed', priceCents: 6000 });

    await db.transaction(async (tx) => {
      await tx.insert(tasks).values({
        ...desk,
        id: taskId,
        slug: taskId.replaceAll('_', '-'),
        title,
        posterUserId: 'usr_chris',
        status: canceled ? 'canceled' : 'assigned',
        offerCount: 0,
        version: 1,
        windowStart: start,
        windowEnd: new Date(start.getTime() + 3 * HOUR),
        expiresAt: new Date(start.getTime() + 3 * HOUR),
        publishedAt: bookedAt,
        createdAt: bookedAt,
        updatedAt: changedAt,
      });
      const common = { ...offer, taskId, revision: 1, proposedStart: start, expiresAt: start, closedAt: bookedAt, createdAt: bookedAt, updatedAt: bookedAt };
      await tx.insert(offers).values([
        { ...common, id: `off_e2e_${name}_${run}`, status: 'accepted' },
        { ...common, id: `off_e2e_${name}_${run}_sam`, helperUserId: 'usr_sam', status: 'declined' },
      ]);
      await tx.insert(bookings).values({
        id: bookingId,
        taskId,
        offerId: `off_e2e_${name}_${run}`,
        posterUserId: 'usr_chris',
        helperUserId: 'usr_jordan',
        marketId: desk.marketId,
        policyVersionId: policy.id,
        startAt: start,
        confirmedAt: bookedAt,
        createdAt: bookedAt,
        updatedAt: changedAt,
        ...(canceled
          ? { status: 'canceled', cancelReason: state.reason, canceledBy: state.reason === 'helper' ? 'helper' : 'poster', canceledAt: changedAt }
          : { status: 'completion_submitted', arrivedAt: start, completionSubmittedAt: now, approvalDueAt: new Date(now.getTime() + 72 * HOUR) }),
      });
      await tx.insert(bookingTerms).values({
        id: `btm_e2e_${name}_${run}`,
        bookingId,
        version: 1,
        pricingType: 'fixed',
        priceCents: 6000,
        breakdown,
        scopeText: desk.description,
        startAt: start,
        createdAt: bookedAt,
      });
      if (!canceled) await tx.insert(bookingCompletions).values({ bookingId, submittedAt: now, note: 'Desk assembled and leveled.', finalBreakdown: breakdown });
      const paymentId = `pay_e2e_${name}_${run}`;
      await tx.insert(payments).values({
        id: paymentId,
        bookingId,
        purpose: 'booking_funding',
        payerUserId: 'usr_chris',
        amountCents: breakdown.posterTotalCents,
        status: canceled ? 'refunded' : 'succeeded',
        provider: 'dev',
        providerRef: `devpi_e2e_${name}_${run}`,
        methodRef: devCardRef('success'),
        methodBrand: 'visa',
        methodLast4: '4242',
        methodExpMonth: 12,
        methodExpYear: 2030,
        idempotencyKey: `e2e:${bookingId}`,
        createdAt: bookedAt,
        updatedAt: changedAt,
      });
      if (canceled) {
        await tx.insert(refunds).values({
          id: `ref_e2e_${name}_${run}`,
          paymentId,
          bookingId,
          amountCents: breakdown.posterTotalCents,
          reason: 'cancellation',
          status: 'succeeded',
          providerRef: `devre_e2e_${name}_${run}`,
          idempotencyKey: `refund:${bookingId}:cancellation`,
          createdAt: changedAt,
        });
      }
    });
    return { taskId, bookingId, title };
  } finally {
    await pool.end();
  }
}

/** Canceled for `reason` and refunded in full. */
export function canceledBooking(name: string, reason: 'helper' | 'helper_no_show', startsInMs: number): Promise<BookingScenario> {
  return scenario(name, { kind: 'canceled', reason }, startsInMs);
}

/** The work was sent for approval just now: approved automatically in 72 h. Started 3 h ago. */
export function submittedBooking(name: string): Promise<BookingScenario> {
  return scenario(name, { kind: 'completion_submitted' }, -3 * HOUR);
}

/** Takes a scenario's task off the board again (a replacement search reopened it). */
export async function closeTask(taskId: string): Promise<void> {
  const { db, pool } = database();
  try {
    await db.update(tasks).set({ status: 'canceled', updatedAt: new Date() }).where(eq(tasks.id, taskId));
  } finally {
    await pool.end();
  }
}
