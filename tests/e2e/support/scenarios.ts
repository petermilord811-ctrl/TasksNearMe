import { and, eq } from 'drizzle-orm';
import { devCardRef } from '../../../src/integrations/payments';
import { sessions, users } from '../../../src/modules/accounts/schema';
import { invites } from '../../../src/modules/invites/schema';
import { bookingCompletions, bookingTerms, bookings } from '../../../src/modules/bookings/schema';
import type { NotificationType } from '../../../src/contracts';
import { marketPolicies } from '../../../src/modules/markets/schema';
import { notifications } from '../../../src/modules/notifications/schema';
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
  /** Jordan sent the work now; the client has 72 h to approve. */
  | { kind: 'completion_submitted' }
  | { kind: 'confirmed' }
  /** Jordan was on his way 30 minutes before the start and arrived at it: he can send the work for approval. */
  | { kind: 'in_progress' };

/** The seeded task and offer a scenario copies, and who posted it. */
interface Template {
  taskId: string;
  offerId: string;
  /** The copy's title is this, then ` (e2e <name> <run>)`. */
  title: string;
  posterUserId: string;
  /** A helper whose offer was declined at booking. */
  declinedHelperId?: string;
}

const DESK: Template = { taskId: 'tsk_desk', offerId: 'off_jordan', title: 'Assemble a desk', posterUserId: 'usr_chris', declinedHelperId: 'usr_sam' };
const BOOKCASE: Template = { taskId: 'tsk_bookcase', offerId: 'off_bookcase_jordan', title: 'Assemble a bookcase', posterUserId: 'usr_ruth' };

/**
 * A copy of a seeded task booked with Jordan, in `state`: by default the desk posted by Chris ($60; Sam's offer
 * declined at booking). `startsInMs` places the start (negative: past).
 */
async function scenario(name: string, state: ScenarioState, startsInMs: number, priceCents = 6000, template: Template = DESK): Promise<BookingScenario> {
  const { db, pool } = database();
  try {
    // Unique even for two copies started in the same millisecond (--repeat-each runs them side by side).
    const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const taskId = `tsk_e2e_${name}_${run}`;
    const bookingId = `bkg_e2e_${name}_${run}`;
    const title = `${template.title} (e2e ${name} ${run})`;
    const [seeded] = await db.select().from(tasks).where(eq(tasks.id, template.taskId));
    const [offer] = await db.select().from(offers).where(eq(offers.id, template.offerId));
    if (!seeded || !offer) throw new Error(`The seeded ${template.taskId} or ${template.offerId} is missing`);
    const [policy] = await db.select().from(marketPolicies).where(and(eq(marketPolicies.marketId, seeded.marketId), eq(marketPolicies.status, 'published')));
    if (!policy) throw new Error('No published market policy');

    const now = new Date();
    const start = new Date(now.getTime() + startsInMs);
    const bookedAt = new Date(Math.min(now.getTime(), start.getTime()) - 2 * HOUR);
    const canceled = state.kind === 'canceled';
    const changedAt = canceled && state.reason === 'helper' ? new Date(now.getTime() - HOUR) : now;
    const breakdown = quoteBreakdown(policy.fees, { type: 'fixed', priceCents });

    await db.transaction(async (tx) => {
      await tx.insert(tasks).values({
        ...seeded,
        id: taskId,
        slug: taskId.replaceAll('_', '-'),
        title,
        posterUserId: template.posterUserId,
        status: canceled ? 'canceled' : 'assigned',
        budgetCents: priceCents,
        offerCount: 0,
        version: 1,
        windowStart: start,
        windowEnd: new Date(start.getTime() + 3 * HOUR),
        expiresAt: new Date(start.getTime() + 3 * HOUR),
        publishedAt: bookedAt,
        createdAt: bookedAt,
        updatedAt: changedAt,
      });
      const common = { ...offer, taskId, priceCents, revision: 1, proposedStart: start, expiresAt: start, closedAt: bookedAt, createdAt: bookedAt, updatedAt: bookedAt };
      await tx.insert(offers).values([
        { ...common, id: `off_e2e_${name}_${run}`, status: 'accepted' },
        ...(template.declinedHelperId ? [{ ...common, id: `off_e2e_${name}_${run}_sam`, helperUserId: template.declinedHelperId, status: 'declined' as const }] : []),
      ]);
      await tx.insert(bookings).values({
        id: bookingId,
        taskId,
        offerId: `off_e2e_${name}_${run}`,
        posterUserId: template.posterUserId,
        helperUserId: offer.helperUserId,
        marketId: seeded.marketId,
        policyVersionId: policy.id,
        startAt: start,
        confirmedAt: bookedAt,
        createdAt: bookedAt,
        updatedAt: changedAt,
        ...(canceled
          ? { status: 'canceled', cancelReason: state.reason, canceledBy: state.reason === 'helper' ? 'helper' : 'poster', canceledAt: changedAt }
          : state.kind === 'confirmed'
            ? { status: 'confirmed' }
            : state.kind === 'in_progress'
              ? { status: 'in_progress', onMyWayAt: new Date(start.getTime() - HOUR / 2), arrivedAt: start }
              : { status: 'completion_submitted', arrivedAt: start, completionSubmittedAt: now, approvalDueAt: new Date(now.getTime() + 72 * HOUR) }),
      });
      await tx.insert(bookingTerms).values({
        id: `btm_e2e_${name}_${run}`,
        bookingId,
        version: 1,
        pricingType: 'fixed',
        priceCents,
        breakdown,
        scopeText: seeded.description,
        startAt: start,
        createdAt: bookedAt,
      });
      if (state.kind === 'completion_submitted') await tx.insert(bookingCompletions).values({ bookingId, submittedAt: now, note: 'Desk assembled and leveled.', finalBreakdown: breakdown });
      const paymentId = `pay_e2e_${name}_${run}`;
      await tx.insert(payments).values({
        id: paymentId,
        bookingId,
        purpose: 'booking_funding',
        payerUserId: template.posterUserId,
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

/** Confirmed for `priceCents`, starting in 3 days (a bigger job for staff refunds). */
export function confirmedBooking(name: string, priceCents: number): Promise<BookingScenario> {
  return scenario(name, { kind: 'confirmed' }, 3 * 24 * HOUR, priceCents);
}

/**
 * A copy of Ruth's bookcase with Jordan ($70), started an hour ago with Jordan there: he can send the work for
 * approval. Its own booking for each call, so a test that completes it can be retried or repeated side by side.
 */
export function inProgressBookcase(name: string): Promise<BookingScenario> {
  return scenario(name, { kind: 'in_progress' }, -HOUR, 7000, BOOKCASE);
}

/** A copy of the desk posted by Chris, open with no offers, three days out: a task Jordan can offer on. */
export async function openTask(name: string): Promise<{ taskId: string; title: string }> {
  const { db, pool } = database();
  try {
    const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const taskId = `tsk_e2e_${name}_${run}`;
    const title = `Assemble a desk (e2e ${name} ${run})`;
    const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
    if (!desk) throw new Error('The seeded desk is missing');
    const now = new Date();
    const start = new Date(now.getTime() + 3 * 24 * HOUR);
    const end = new Date(start.getTime() + 3 * HOUR);
    await db.insert(tasks).values({ ...desk, id: taskId, slug: taskId.replaceAll('_', '-'), title, posterUserId: 'usr_chris', status: 'open', offerCount: 0, version: 1, windowStart: start, windowEnd: end, expiresAt: end, publishedAt: now, createdAt: now, updatedAt: now });
    return { taskId, title };
  } finally {
    await pool.end();
  }
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

/** An in-app notification made now, as the dispatcher would; the job runner then emails or texts it. */
export async function notifyNow(userId: string, type: NotificationType, title: string): Promise<void> {
  const { db, pool } = database();
  try {
    const run = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
    await db.insert(notifications).values({ id: `ntf_e2e_${run}`, userId, type, title, actorName: 'Jordan T.', target: { kind: 'messages' }, sourceEventId: `e2e:${run}` });
  } finally {
    await pool.end();
  }
}

/** Suspends (or reinstates) the account with this email, as staff would. */
export async function setAccountStatus(email: string, status: 'active' | 'suspended'): Promise<void> {
  const { db, pool } = database();
  try {
    await db.update(users).set({ status }).where(eq(users.email, email));
  } finally {
    await pool.end();
  }
}

/** A sign-in (session row) for this person from an address, as Better Auth saves one. Returns its id, to remove it. */
export async function addSignIn(userId: string, ipAddress: string, userAgent: string): Promise<string> {
  const { db, pool } = database();
  try {
    const run = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`;
    const id = `ses_e2e_${run}`;
    const now = new Date();
    await db.insert(sessions).values({ id, token: `tok_e2e_${run}`, userId, ipAddress, userAgent, createdAt: now, updatedAt: now, expiresAt: new Date(now.getTime() + 30 * 24 * HOUR) });
    return id;
  } finally {
    await pool.end();
  }
}

export async function removeSignIn(id: string): Promise<void> {
  const { db, pool } = database();
  try {
    await db.delete(sessions).where(eq(sessions.id, id));
  } finally {
    await pool.end();
  }
}

/** Removes open invites on a task, so a retried test that sends one starts clean. */
export async function clearOpenInvites(taskId: string): Promise<void> {
  const { db, pool } = database();
  try {
    await db.delete(invites).where(and(eq(invites.taskId, taskId), eq(invites.status, 'sent')));
  } finally {
    await pool.end();
  }
}

