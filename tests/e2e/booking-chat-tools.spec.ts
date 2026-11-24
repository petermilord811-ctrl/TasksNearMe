import { expect, test } from '@playwright/test';
import { and, eq, inArray, like, sql } from 'drizzle-orm';
import { availabilityPosts } from '../../src/modules/availability/schema';
import { directPairKey } from '../../src/modules/messaging/direct-rules';
import { messages, threadParticipants, threads } from '../../src/modules/messaging/schema';
import { createDb } from '../../src/platform/db/connect';
import { rateLimits } from '../../src/platform/rate-limit/schema';
import { moveClock, resetClock } from './support/clock';
import { confirmedBooking } from './support/scenarios';
import { devSignIn } from './support/sign-in';

/**
 * A booking's conversation and shared times, 2026-11-24 (owner: "implement others all one by one"). Jordan, an hour before
 * a booking, sees what he and Chris agreed on top of their conversation (his earnings, never Chris's total) and sends
 * "On my way" and "Running late" from chips above the composer; their lines show in the conversation. In a direct
 * conversation he shares two of his open times; Chris picks one and the request dialog opens with that time chosen.
 * Each run makes its own booking, conversation lines and slots, and removes the slots and lines after.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

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

/** The booking's conversation, as its Message button would make it. */
async function bookingThread(bookingId: string, taskId: string): Promise<string> {
  const { db, pool } = database();
  try {
    const id = `thr_e2e_${bookingId.slice(4)}`;
    await db.insert(threads).values({ id, kind: 'booking', linkedId: bookingId, taskId, createdAt: new Date() }).onConflictDoNothing();
    await db.insert(threadParticipants).values([{ threadId: id, userId: 'usr_chris' }, { threadId: id, userId: 'usr_jordan' }]).onConflictDoNothing();
    return id;
  } finally {
    await pool.end();
  }
}

test('a helper sends day-of updates from the booking\'s conversation, under what they agreed', async ({ page }) => {
  test.setTimeout(150_000);
  const booking = await confirmedBooking('bct', 6000);
  const threadId = await bookingThread(booking.bookingId, booking.taskId);
  await devSignIn(page, 'jordan@example.test');
  // An hour before the start (the booking starts in three days).
  await moveClock(page, 3 * DAY - HOUR);
  try {
    await page.goto(`/app/messages/${threadId}`);
    const agreed = page.getByRole('region', { name: 'What we agreed' });
    await expect(agreed).toBeVisible({ timeout: 30_000 });
    await expect(agreed.getByRole('button', { name: /What we agreed/ })).toHaveAttribute('aria-expanded', 'true');
    // Jordan's own money: his $60.00 earnings, never Chris's $63.00 total.
    await expect(agreed.getByText('You earn')).toBeVisible();
    await expect(agreed.getByText('$60.00', { exact: true })).toBeVisible();
    await expect(agreed.getByText('$63.00')).toHaveCount(0);

    const chips = page.getByRole('group', { name: 'Booking updates' });
    await expect(chips.getByRole('button')).toHaveText(['On my way', 'Running late']);
    await chips.getByRole('button', { name: 'On my way' }).click();
    const log = page.getByRole('log');
    await expect(log.getByText('On the way', { exact: true })).toBeVisible({ timeout: 30_000 });
    // I've arrived opens 30 minutes before the start: an hour ahead, Running late is what's left.
    await expect(chips.getByRole('button')).toHaveText(['Running late'], { timeout: 30_000 });

    await chips.getByRole('button', { name: 'Running late' }).click();
    await page.getByRole('radio', { name: '10 min' }).click();
    // The popover's Send (the message box has one too).
    await page.getByRole('dialog').getByRole('button', { name: 'Send', exact: true }).click();
    await expect(log.getByText('Running 10 minutes late')).toBeVisible({ timeout: 30_000 });
  } finally {
    await resetClock(page);
  }
});

test('a helper shares two open times; the client picks one and the request opens with it', async ({ page }, testInfo) => {
  // Jordan's soonest open times are this run's; two runs side by side would each choose the other's.
  test.skip(testInfo.project.name !== 'app-desktop', "shares Jordan's open times; desktop only");
  test.setTimeout(180_000);
  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const slotIds = [`avl_e2e_bct_${run}_1`, `avl_e2e_bct_${run}_2`];
  const { db, pool } = database();
  let threadId = '';
  try {
    // Two times Jordan posted, sooner than any seeded one, so the dialog chooses them first.
    const at = (ms: number) => new Date(Date.now() + ms);
    await db.insert(availabilityPosts).values(slotIds.map((id, index) => ({
      id, helperUserId: 'usr_jordan', marketId: 'mkt_austin', categoryId: 'cat_furniture_assembly', startAt: at(DAY + index * 4 * HOUR - Math.floor(Math.random() * HOUR)), endAt: at(DAY + index * 4 * HOUR + 2 * HOUR),
      pricingType: 'fixed', priceCents: 6000, status: 'active',
    })));
    await db.delete(rateLimits).where(like(rateLimits.key, '%share-times:usr_jordan%'));
    const pair = directPairKey('usr_chris', 'usr_jordan');
    const [existing] = await db.select({ id: threads.id }).from(threads).where(and(eq(threads.kind, 'direct'), eq(threads.linkedId, pair))).limit(1);
    threadId = existing?.id ?? `thr_e2e_bct_${run}`;
    if (!existing) {
      await db.insert(threads).values({ id: threadId, kind: 'direct', linkedId: pair, startedByUserId: 'usr_chris', createdAt: new Date() });
      await db.insert(threadParticipants).values([{ threadId, userId: 'usr_chris' }, { threadId, userId: 'usr_jordan' }]);
      await db.insert(messages).values({ id: `msg_e2e_bct_${run}`, threadId, senderUserId: 'usr_chris', kind: 'text', body: 'Hi Jordan, when are you free?', createdAt: new Date() });
    }

    await devSignIn(page, 'jordan@example.test');
    await page.goto(`/app/messages/${threadId}`);
    // A tap before the page has hydrated does nothing: open the "+" until its menu shows.
    const shareItem = page.getByRole('menuitem', { name: /Share times/ });
    await expect(async () => {
      if (await shareItem.isVisible()) return;
      await page.getByRole('button', { name: /More ways to work with/ }).click({ timeout: 10_000 });
      await expect(shareItem).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 90_000 });
    await shareItem.click();
    const dialog = page.getByRole('dialog', { name: /Share times with/ });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Share', exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    const mine = (selector: string) => page.locator('[data-shared-times]').filter({ has: page.locator(`[data-slot-id="${slotIds[0]}"]`) }).locator(selector);
    await expect(mine('[data-slot-id]')).toHaveCount(2, { timeout: 30_000 });
    await expect(page.locator('[data-shared-times]').filter({ has: page.locator(`[data-slot-id="${slotIds[0]}"]`) }).getByText('You shared open times')).toBeVisible();

    await devSignIn(page, 'chris@example.test');
    await page.goto(`/app/messages/${threadId}`);
    const pick = page.locator(`a[data-slot-id="${slotIds[0]}"]`);
    await expect(pick).toBeVisible({ timeout: 30_000 });
    await pick.click();
    await expect(page).toHaveURL(new RegExp(`/app/helpers/jordan-t/request\\?slot=${slotIds[0]}$`), { timeout: 30_000 });
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 30_000 });
  } finally {
    if (threadId) await db.delete(messages).where(and(eq(messages.threadId, threadId), sql`${messages.event}->>'type' = 'times_shared'`, sql`${messages.event}::text like ${`%${slotIds[0]}%`}`));
    await db.delete(availabilityPosts).where(inArray(availabilityPosts.id, slotIds));
    await pool.end();
  }
});
