import { expect, test } from '@playwright/test';
import { eq, inArray } from 'drizzle-orm';
import { users } from '../../src/modules/accounts/schema';
import { availabilityPosts } from '../../src/modules/availability/schema';
import { directPairKey } from '../../src/modules/messaging/direct-rules';
import { messages, threadParticipants, threads } from '../../src/modules/messaging/schema';
import { helperProfiles } from '../../src/modules/profiles/schema';
import { createDb } from '../../src/platform/db/connect';
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

test('a helper sends day-of updates from the booking\'s conversation, under what they agreed', async ({ page }, testInfo) => {
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
    // Open by default on a wide page; folded on a phone, where open it crowded out the messages (sweep 2026-11-24, C10).
    const toggle = agreed.getByRole('button', { name: /What we agreed/ });
    if (testInfo.project.name === 'app-mobile') {
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await toggle.click();
    }
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
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
  test.skip(testInfo.project.name !== 'app-desktop', 'the + menu and its dialog are checked on desktop; phones share the same code');
  test.setTimeout(180_000);
  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  // A helper of this run's own (a copy of Jordan): other specs change the seeded helpers' state and slots in parallel.
  const helper = { id: `usr_e2e_bct_${run}`, email: `e2e-bct-${run}@example.test`, handle: `e2e-bct-${run}` };
  // And a client of its own (a copy of Chris), for the same reason.
  const client = { id: `usr_e2e_bctc_${run}`, email: `e2e-bctc-${run}@example.test` };
  const slotIds = [`avl_e2e_bct_${run}_1`, `avl_e2e_bct_${run}_2`];
  const threadId = `thr_e2e_bct_${run}`;
  const { db, pool } = database();
  try {
    const [jordan] = await db.select().from(users).where(eq(users.id, 'usr_jordan'));
    const [profile] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, 'usr_jordan'));
    const [chris] = await db.select().from(users).where(eq(users.id, 'usr_chris'));
    if (!jordan || !profile || !chris) throw new Error('The seeded people are missing');
    await db.insert(users).values({ ...chris, id: client.id, email: client.email, name: 'Cora C.', firstName: 'Cora', lastName: 'Cole', phone: null, phoneVerifiedAt: null, directMessages: 'everyone', locale: 'en' });
    await db.insert(users).values({ ...jordan, id: helper.id, email: helper.email, name: 'Theo T.', firstName: 'Theo', lastName: 'Tran', phone: null, phoneVerifiedAt: null, directMessages: 'everyone', locale: 'en' });
    await db.insert(helperProfiles).values({ ...profile, userId: helper.id, handle: helper.handle, status: 'active', foundingNumber: null, completedCount: 0 });
    const at = (ms: number) => new Date(Date.now() + ms);
    await db.insert(availabilityPosts).values(slotIds.map((id, index) => ({
      id, helperUserId: helper.id, marketId: 'mkt_austin', categoryId: 'cat_furniture_assembly', startAt: at(DAY + index * 4 * HOUR), endAt: at(DAY + index * 4 * HOUR + 2 * HOUR),
      pricingType: 'fixed', priceCents: 6000, status: 'active',
    })));
    await db.insert(threads).values({ id: threadId, kind: 'direct', linkedId: directPairKey(client.id, helper.id), startedByUserId: client.id, createdAt: new Date() });
    await db.insert(threadParticipants).values([{ threadId, userId: client.id }, { threadId, userId: helper.id }]);
    await db.insert(messages).values({ id: `msg_e2e_bct_${run}`, threadId, senderUserId: client.id, kind: 'text', body: 'Hi Theo, when are you free?', createdAt: new Date() });

    await devSignIn(page, helper.email);
    await page.goto(`/app/messages/${threadId}`);
    // A tap before the page has hydrated does nothing: open the "+" until its menu shows Share times. A first render
    // without it (seen now and then in parallel runs, cause not found) gets a fresh one; a lasting miss says why.
    const shareItem = page.getByRole('menuitem', { name: /Share times/ });
    let tries = 0;
    await expect(async () => {
      if (await shareItem.isVisible()) return;
      if (tries++ > 0) await page.reload();
      await page.getByRole('button', { name: /More ways to work with/ }).click({ timeout: 10_000 });
      await expect(shareItem).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 90_000 }).catch(async (error: unknown) => {
      const [status] = await db.select({ status: helperProfiles.status }).from(helperProfiles).where(eq(helperProfiles.userId, helper.id));
      const slots = await db.select({ id: availabilityPosts.id, status: availabilityPosts.status, startAt: availabilityPosts.startAt }).from(availabilityPosts).where(inArray(availabilityPosts.id, slotIds));
      throw new Error(`Share times never showed: helper ${JSON.stringify(status)}, slots ${JSON.stringify(slots)}, now ${new Date().toISOString()}`, { cause: error });
    });
    await shareItem.click();
    const dialog = page.getByRole('dialog', { name: /Share times with/ });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Share', exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    const card = page.locator('[data-shared-times]').filter({ has: page.locator(`[data-slot-id="${slotIds[0]}"]`) });
    await expect(card.locator('[data-slot-id]')).toHaveCount(2, { timeout: 30_000 });
    await expect(card.getByText('You shared open times')).toBeVisible();

    await devSignIn(page, client.email);
    await page.goto(`/app/messages/${threadId}`);
    const pick = page.locator(`a[data-slot-id="${slotIds[0]}"]`);
    await expect(pick).toBeVisible({ timeout: 30_000 });
    await pick.click();
    await expect(page).toHaveURL(new RegExp(`/app/helpers/${helper.handle}/request\\?slot=${slotIds[0]}$`), { timeout: 30_000 });
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 30_000 });
  } finally {
    await db.delete(messages).where(eq(messages.threadId, threadId));
    await db.delete(threadParticipants).where(eq(threadParticipants.threadId, threadId));
    await db.delete(threads).where(eq(threads.id, threadId));
    await db.delete(availabilityPosts).where(inArray(availabilityPosts.id, slotIds));
    await db.delete(helperProfiles).where(eq(helperProfiles.userId, helper.id));
    await db.update(users).set({ status: 'deleted' }).where(inArray(users.id, [helper.id, client.id]));
    await pool.end();
  }
});
