import { runSavedSearchDigests } from '@/modules/searches/service';
import { stripeConnectFromEnv } from '@/integrations/payments/stripe-connect';
import { runScheduledTransfers } from '@/modules/payments/connect';
import { cancelStaleCharges } from '@/modules/payments/stale-charges';
import { expireDuePosts } from '@/modules/availability/service';
import { expireDueProposals } from '@/modules/rebook/service';
import { sql } from 'drizzle-orm';
import { autoApproveDue, recordMissingCompletionMoney } from '@/modules/bookings/completion-view';
import { remindApprovalsDue, remindUpcomingBookings } from '@/modules/bookings/reminders';
import { expireUnfundedBookings } from '@/modules/bookings/confirm';
import { chargeDueScheduled, expireUnpaidScheduled } from '@/modules/bookings/scheduled';
import { runSeriesCalendars } from '@/modules/bookings/series';
import { expireCantAccess } from '@/modules/bookings/sheets';
import { deliverNotifications } from '@/modules/notifications/delivery';
import { dispatchNotifications } from '@/modules/notifications/service';
import { sendCityOpenEmails } from '@/modules/marketing/city-open';
import { createPaymentProvider } from '@/integrations/payments';
import { expireDueInvites } from '@/modules/invites/service';
import { expireDueOffers } from '@/modules/offers/helper';
import { publishDueReviews, sendReviewPrompts } from '@/modules/reviews/service';
import { createFileStorage } from '@/integrations/storage';
import { verificationProvidersFor } from '@/modules/verification/providers';
import { runVerificationTimers } from '@/modules/verification/timers';
import { runWelcomeRewards } from '@/modules/rewards/welcome';
import { readPendingDocuments } from '@/modules/verification/auto-check';
import { runPrivacyRequests } from '@/modules/privacy/requests';
import { retentionDue, runRetention } from '@/modules/privacy/retention';
import { createEmailProvider } from '@/integrations/email';
import { documentReaderFromEnv } from '@/integrations/ai/document-reader';
import { idReaderFromEnv } from '@/integrations/ai/id-document-reader';
import { byteCipherFromEnv, fieldCipherFromEnv } from '@/platform/crypto/field-encryption';
import type { Db } from '@/platform/db/connect';
import { expireEndedTasks } from '@/modules/tasks/expiry';
import { pruneCacheTags } from '@/platform/cache/prune';
import { announceChangedPages } from '@/modules/seo/indexnow-job';
import { retryDueWebhooks } from '@/modules/webhooks/inbox';

/**
 * The in-process job runner (blueprint 07: jobs). Every minute it runs the due-work functions that
 * pages also call lazily, so timers fire even when nobody looks: offer and unpaid-hold expiry, regular visits'
 * calendars and the scheduled charges (with their deadlines),
 * can't-access expiry, start and approval reminders, auto-approval, review publishing, verification timers,
 * notifications and their email and text messages, the waitlist's "we're open" emails, privacy requests (data
 * copies, deletions), retention
 * timers (hourly), the welcome gift cards (and their monthly waiting line), and the reading of proofs of address
 * and IDs. Each job is idempotent; a Postgres advisory lock lets only one server instance run them at a time.
 * Booking rewards stay lazy per person for now.
 */

export interface Job {
  name: string;
  run: (db: Db, now: Date) => Promise<unknown>;
}

/** Expiries first, then what they produce (notifications last). */
export const JOBS: Job[] = [
  { name: 'offers.expire', run: (db, now) => expireDueOffers(db, now, {}) },
  { name: 'tasks.expire', run: (db, now) => expireEndedTasks(db, now).then(() => undefined) },
  { name: 'invites.expire', run: (db, now) => expireDueInvites(db, createPaymentProvider(), now) },
  { name: 'availability.expire', run: (db, now) => expireDuePosts(db, now) },
  { name: 'rebook.expire', run: (db, now) => expireDueProposals(db, now) },
  { name: 'bookings.expire_unfunded', run: (db, now) => expireUnfundedBookings(db, now) },
  // Scheduled payments: past the deadline first, then the calendars, then what's due to be charged.
  { name: 'bookings.scheduled_deadlines', run: (db, now) => expireUnpaidScheduled(db, now) },
  { name: 'series.calendars', run: (db, now) => runSeriesCalendars(db, now) },
  { name: 'bookings.scheduled_charges', run: async (db, now) => { const payments = createPaymentProvider(); if (payments) await chargeDueScheduled({ db, payments }, now); } },
  { name: 'bookings.expire_cant_access', run: (db, now) => expireCantAccess(db, now) },
  { name: 'bookings.auto_approve', run: (db, now) => autoApproveDue(db, now) },
  // Completed bookings whose earnings or refund didn't finish (a provider error): run again (booking reviews, money #5).
  { name: 'bookings.completion_money', run: (db, now) => recordMissingCompletionMoney(db, now).then(() => undefined) },
  // Tips and change payments whose charge never answered, given up after an hour (money review #9).
  { name: 'payments.stale_charges', run: (db, now) => cancelStaleCharges(db, now).then(() => undefined) },
  { name: 'bookings.approval_reminders', run: (db, now) => remindApprovalsDue(db, now) },
  { name: 'bookings.start_reminders', run: (db, now) => remindUpcomingBookings(db, now) },
  { name: 'reviews.publish', run: (db, now) => publishDueReviews(db, now) },
  // Asks both people to review a completed booking, and reminds whoever hasn't before the window closes (sweep RV4).
  { name: 'reviews.prompts', run: (db, now) => sendReviewPrompts(db, now) },
  { name: 'verification.timers', run: (db, now) => runVerificationTimers(db, { storage: createFileStorage(), providers: verificationProvidersFor(process.env) }, now) },
  // Welcome gift cards for helpers whose three checks passed, and the month's waiting line (before notifications).
  { name: 'rewards.welcome', run: (db, now) => runWelcomeRewards(db, now) },
  // Saved searches' morning digest (completion plan 7.10): once a day from 8 am, before the dispatch.
  { name: 'searches.digest', run: (db, now) => runSavedSearchDigests(db, now).then(() => undefined) },
  { name: 'notifications.dispatch', run: (db, now) => dispatchNotifications(db, now) },
  { name: 'notifications.deliver', run: (db, now) => deliverNotifications(db, now) },
  // The waitlist of a market that went live hears it's open (completion plan 8.3), a batch a minute.
  { name: 'waitlist.city_open', run: (db, now) => sendCityOpenEmails(db, { email: createEmailProvider(db), appUrl: (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '') }, now) },
  { name: 'privacy.requests', run: (db, now) => runPrivacyRequests(db, { storage: createFileStorage(), cipher: fieldCipherFromEnv(), email: createEmailProvider(db), payments: createPaymentProvider(), appUrl: (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '') }, now) },
  // Webhook events whose processing failed, again on their backoff (completion plan 5.11).
  { name: 'webhooks.retry', run: (db, now) => retryDueWebhooks(db, now) },
  { name: 'retention.sweep', run: (db, now) => (retentionDue(now) ? runRetention(db, { storage: createFileStorage() }, now) : Promise.resolve()) },
  // Shared 'use cache' tag rows a week old (cache-handlers/shared-tags.mjs).
  { name: 'cache.prune_tags', run: async (db, now) => { await pruneCacheTags(db, now); } },
  // Search engines: new or changed public pages to IndexNow, every 15 minutes, on the live site only (src/modules/seo).
  { name: 'seo.indexnow', run: async (_db, now) => { await announceChangedPages(now); } },
  // Last: it waits on Claude (a few seconds a document).
  { name: 'earnings.transfers', run: async (db, now) => { const connect = stripeConnectFromEnv(); if (connect) await runScheduledTransfers(db, connect, now); } },
  {
    name: 'verification.read_documents',
    run: (db, now) => {
      const storage = createFileStorage();
      return readPendingDocuments(db, { storage, cipher: fieldCipherFromEnv(), reader: documentReaderFromEnv(), identity: { storage, files: byteCipherFromEnv(), reader: idReaderFromEnv() } }, now);
    },
  },
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
