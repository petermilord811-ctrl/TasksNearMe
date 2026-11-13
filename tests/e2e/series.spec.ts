import { expect, test } from '@playwright/test';
import { eq, inArray, or } from 'drizzle-orm';
import { bookingSeries, bookingTerms, bookings } from '../../src/modules/bookings/schema';
import { threadParticipants, threads, messages } from '../../src/modules/messaging/schema';
import { paymentMethods, payments } from '../../src/modules/payments/schema';
import { rebookProposals } from '../../src/modules/rebook/schema';
import { tasks } from '../../src/modules/tasks/schema';
import { createDb } from '../../src/platform/db/connect';
import { devSignIn } from './support/sign-in';

/**
 * Regular visits (blueprint 03 §7): Jordan proposes Ben's yard again every week from a completed booking; Ben accepts
 * and pays the first visit, lands on the series page with the next visits on the calendar, skips one and stops the
 * rest. The completed booking is made here and everything is removed afterwards.
 */

const PAST = 'bkg_e2e_series';
const PAST_TASK = 'tsk_e2e_series';

function database() {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // Environment provided by the shell (CI).
  }
  return createDb(process.env.DATABASE_URL ?? '', { max: 1 });
}

let cardsBefore: string[] = [];

test.beforeAll(async () => {
  const { db, pool } = database();
  try {
    await cleanUp(db);
    cardsBefore = (await db.select({ id: paymentMethods.id }).from(paymentMethods).where(eq(paymentMethods.userId, 'usr_ben'))).map((row) => row.id);
    const [yard] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_yard'));
    // A seeded $60 fixed booking's terms (the dresser), with the market's fees.
    const [terms] = await db.select().from(bookingTerms).where(eq(bookingTerms.bookingId, 'bkg_dresser')).limit(1);
    if (!yard || !terms) throw new Error('The seeded yard task or the dresser booking is missing');
    const when = new Date(Date.now() - 14 * 86_400_000);
    await db.insert(tasks).values({ ...yard, id: PAST_TASK, slug: `${PAST_TASK}-slug`, status: 'completed', windowStart: when, windowEnd: new Date(when.getTime() + 2 * 3_600_000), offerCount: 0, version: 1 });
    const [policyBooking] = await db.select({ policyVersionId: bookings.policyVersionId }).from(bookings).limit(1);
    await db.insert(bookings).values({ id: PAST, taskId: PAST_TASK, posterUserId: 'usr_ben', helperUserId: 'usr_jordan', marketId: 'mkt_austin', policyVersionId: policyBooking!.policyVersionId, status: 'completed', completedVia: 'poster', startAt: when, confirmedAt: when, completedAt: new Date(when.getTime() + 3 * 3_600_000) });
    await db.insert(bookingTerms).values({ id: `btm_${PAST}`, bookingId: PAST, version: 1, pricingType: 'fixed', priceCents: 6000, breakdown: terms.breakdown, scopeText: yard.description, startAt: when });
  } finally {
    await pool.end();
  }
});

test.afterAll(async () => {
  const { db, pool } = database();
  try {
    await cleanUp(db);
    const cards = await db.select({ id: paymentMethods.id }).from(paymentMethods).where(eq(paymentMethods.userId, 'usr_ben'));
    const added = cards.map((row) => row.id).filter((id) => !cardsBefore.includes(id));
    if (added.length) await db.delete(paymentMethods).where(inArray(paymentMethods.id, added));
  } finally {
    await pool.end();
  }
});

/** Removes the series made from the e2e booking: its visits, their tasks, payments and conversation, and the proposal. */
async function cleanUp(db: ReturnType<typeof createDb>['db']) {
  const proposals = await db.select({ id: rebookProposals.id, bookingId: rebookProposals.bookingId, taskId: rebookProposals.taskId }).from(rebookProposals).where(eq(rebookProposals.fromBookingId, PAST));
  const series = await db.select({ id: bookingSeries.id }).from(bookingSeries).where(inArray(bookingSeries.proposalId, proposals.length ? proposals.map((row) => row.id) : ['none']));
  const seriesIds = series.map((row) => row.id);
  const visits = seriesIds.length ? await db.select({ id: bookings.id, taskId: bookings.taskId }).from(bookings).where(inArray(bookings.seriesId, seriesIds)) : [];
  const bookingIds = [...new Set([...visits.map((row) => row.id), ...proposals.flatMap((row) => (row.bookingId ? [row.bookingId] : [])), PAST])];
  const taskIds = [...new Set([...visits.map((row) => row.taskId), ...proposals.flatMap((row) => (row.taskId ? [row.taskId] : [])), PAST_TASK])];
  const threadRows = await db.select({ id: threads.id }).from(threads).where(or(inArray(threads.linkedId, seriesIds.length ? seriesIds : ['none']), inArray(threads.linkedId, bookingIds)));
  if (threadRows.length) {
    const ids = threadRows.map((row) => row.id);
    await db.delete(messages).where(inArray(messages.threadId, ids));
    await db.delete(threadParticipants).where(inArray(threadParticipants.threadId, ids));
    await db.delete(threads).where(inArray(threads.id, ids));
  }
  await db.delete(payments).where(inArray(payments.bookingId, bookingIds));
  await db.delete(bookingTerms).where(inArray(bookingTerms.bookingId, bookingIds));
  await db.delete(rebookProposals).where(eq(rebookProposals.fromBookingId, PAST));
  await db.delete(bookings).where(inArray(bookings.id, bookingIds));
  if (seriesIds.length) await db.delete(bookingSeries).where(inArray(bookingSeries.id, seriesIds));
  await db.delete(tasks).where(inArray(tasks.id, taskIds));
}

test('a helper proposes regular visits; the client pays the first, skips one and stops the rest', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'changes shared data; desktop only');
  test.setTimeout(240_000);

  await devSignIn(page, 'jordan@example.test');
  await page.goto(`/app/bookings/${PAST}/rebook`);
  await expect(page.getByRole('heading', { level: 1, name: 'Propose a booking' })).toBeVisible({ timeout: 30_000 });
  // Three days from now at 9:00 in Austin, every week.
  const first = new Date(Date.now() + 3 * 86_400_000);
  const firstDay = first.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  const weekday = first.toLocaleDateString('en-US', { timeZone: 'America/Chicago', weekday: 'long' });
  await page.getByLabel('Date').fill(firstDay);
  await page.getByLabel('Start time').fill('09:00');
  await page.getByRole('radio', { name: 'Every week' }).click();
  await expect(page.getByText(`Every week on ${weekday} at 9:00 am.`, { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Send proposal' }).click();
  await expect(page).toHaveURL(/\/app\/clients$/, { timeout: 30_000 });

  await devSignIn(page, 'ben@example.test');
  await page.getByRole('link', { name: /Jordan T\. proposed a booking: Rake and bag front-yard leaves/ }).first().click();
  await expect(page).toHaveURL(/\/app\/proposals\/[^/]+$/, { timeout: 30_000 });
  await expect(page.getByText(`Every week on ${weekday} at 9:00 am`)).toBeVisible();
  // The card is kept for the later visits: no "save" choice.
  await expect(page.getByRole('checkbox', { name: /Save this card/ })).toHaveCount(0);
  await page.getByRole('checkbox', { name: /I agree to the/ }).click();
  await page.getByRole('button', { name: /^Accept and pay/ }).click();
  await expect(page).toHaveURL(/\/app\/series\/srs_[^/]+$/, { timeout: 30_000 });

  // The series page: the first visit paid, the next three on the calendar.
  await expect(page.getByText(`Every week on ${weekday} at 9:00 am`).first()).toBeVisible();
  await expect(page.getByText('Booked and paid', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('On the calendar', { exact: true })).toHaveCount(3);

  // Skip the second visit (nothing is charged for it).
  await page.getByRole('button', { name: 'Skip' }).first().click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Skip visit' }).click();
  await expect(page.getByText('You skipped it', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('On the calendar', { exact: true })).toHaveCount(2);

  // Stop the rest: the visits not paid yet go.
  await page.getByRole('button', { name: 'Stop regular visits' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Stop regular visits' }).click();
  await expect(page.getByText('Stopped', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('On the calendar', { exact: true })).toHaveCount(0);
});
