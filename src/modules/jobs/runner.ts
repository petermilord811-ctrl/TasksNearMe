import { expireDuePosts } from '@/modules/availability/service';
import { expireDueProposals } from '@/modules/rebook/service';
import { sql } from 'drizzle-orm';
import { autoApproveDue } from '@/modules/bookings/completion-view';
import { expireUnfundedBookings } from '@/modules/bookings/confirm';
import { expireCantAccess } from '@/modules/bookings/sheets';
import { dispatchNotifications } from '@/modules/notifications/service';
import { createPaymentProvider } from '@/integrations/payments';
import { expireDueInvites } from '@/modules/invites/service';
import { expireDueOffers } from '@/modules/offers/helper';
import { publishDueReviews } from '@/modules/reviews/service';
import type { Db } from '@/platform/db/connect';

/**
 * The in-process job runner (blueprint 07: jobs). Every minute it runs the due-work functions that
 * pages also call lazily, so timers fire even when nobody looks: offer and unpaid-hold expiry,
 * can't-access expiry, auto-approval, review publishing, and notifications. Each job is idempotent; a
 * Postgres advisory lock lets only one server instance run them at a time. Payouts and rewards stay
 * lazy per person for now.
 */

export interface Job {
  name: string;
  run: (db: Db, now: Date) => Promise<unknown>;
}

/** Expiries first, then what they produce (notifications last). */
export const JOBS: Job[] = [
  { name: 'offers.expire', run: (db, now) => expireDueOffers(db, now, {}) },
  { name: 'invites.expire', run: (db, now) => expireDueInvites(db, createPaymentProvider(), now) },
  { name: 'availability.expire', run: (db, now) => expireDuePosts(db, now) },
  { name: 'rebook.expire', run: (db, now) => expireDueProposals(db, now) },
  { name: 'bookings.expire_unfunded', run: (db, now) => expireUnfundedBookings(db, now) },
  { name: 'bookings.expire_cant_access', run: (db, now) => expireCantAccess(db, now) },
  { name: 'bookings.auto_approve', run: (db, now) => autoApproveDue(db, now) },
  { name: 'reviews.publish', run: (db, now) => publishDueReviews(db, now) },
  { name: 'notifications.dispatch', run: (db, now) => dispatchNotifications(db, now) },
];

const LOCK_KEY = 72_200_001;

/**
 * Runs every job once, unless another instance holds the lock. The lock is a transaction-level advisory
 * lock held on one connection while the jobs use others, so it ends with the transaction even if a job
 * throws. One failing job doesn't stop the rest.
 */
export async function runDueJobs(db: Db, now: Date, jobs: Job[] = JOBS): Promise<{ ran: boolean; failed: string[] }> {
  return db.transaction(async (tx) => {
    const result = await tx.execute(sql`select pg_try_advisory_xact_lock(${LOCK_KEY}) as locked`);
    const locked = (result.rows[0] as { locked?: boolean } | undefined)?.locked === true;
    if (!locked) return { ran: false, failed: [] };
    const failed: string[] = [];
    for (const job of jobs) {
      try {
        await job.run(db, now);
      } catch (error) {
        failed.push(job.name);
        console.error(`[jobs] ${job.name} failed`, error);
      }
    }
    return { ran: true, failed };
  });
}

const RUNNER = Symbol.for('tasksnearme.jobRunner');

/** Starts the runner once per server process (dev reloads keep the first one). */
export function startJobRunner(db: Db, intervalMs = 60_000): void {
  const holder = globalThis as unknown as Record<symbol, NodeJS.Timeout | undefined>;
  if (holder[RUNNER]) return;
  const tick = () => {
    runDueJobs(db, new Date()).catch((error: unknown) => console.error('[jobs] run failed', error));
  };
  holder[RUNNER] = setInterval(tick, intervalMs);
  holder[RUNNER].unref();
  setTimeout(tick, 10_000).unref();
  console.info(`[jobs] runner started (every ${Math.round(intervalMs / 1000)} s)`);
}
