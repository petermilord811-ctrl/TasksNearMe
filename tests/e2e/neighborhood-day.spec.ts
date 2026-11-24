import { randomInt, randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { and, eq, inArray } from 'drizzle-orm';
import { PEOPLE, type SeedPerson } from '../../db/seeds/data/people';
import { seedVerification, upsertPeople } from '../../db/seeds/seed';
import { availabilityPosts, neighborhoodDays } from '../../src/modules/availability/schema';
import { invites } from '../../src/modules/invites/schema';
import { helperProfiles } from '../../src/modules/profiles/schema';
import { taskLocations, tasks } from '../../src/modules/tasks/schema';
import { messages, threadParticipants, threads } from '../../src/modules/messaging/schema';
import { createDb } from '../../src/platform/db/connect';
import { clearHelperOnboarding } from './support/fresh-helper';
import { marketDate } from './support/post-task';
import { devSignIn } from './support/sign-in';

/**
 * Neighborhood days (2026-11-24, owner: "implement others all one by one"): a helper opens a day of visits in East
 * Austin with a neighbor price; a neighbor finds it on Neighbors, picks a visit in the request dialog (an ordinary
 * slot request), and the card fills up; the helper cancels the visits still open. The helper and the neighbor are
 * copies of seeded Jordan and Ben made for this run, with a task of the neighbor's own; everything goes back in finally.
 */

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

interface Cast { token: string; helper: SeedPerson; neighbor: SeedPerson; taskId: string; taskTitle: string }

/** A bookable copy of Jordan (East Austin, furniture at $45), a copy of Ben, and Ben's copy's furniture task in East Austin on `date`. */
async function makeCast(date: string): Promise<Cast> {
  const jordan = PEOPLE.find((person) => person.id === 'usr_jordan');
  const ben = PEOPLE.find((person) => person.id === 'usr_ben');
  if (!jordan?.helper || !ben) throw new Error('Seeded Jordan or Ben is missing');
  const token = randomUUID().replaceAll('-', '').slice(0, 8);
  // Not a founding helper: those numbers are Jordan's and the seeded cohort's.
  const { foundingNumber: _founding, ...profile } = jordan.helper;
  const helper: SeedPerson = {
    ...jordan,
    id: `usr_e2e_nday_h_${token}`,
    email: `nday-helper-${token}@example.test`,
    lastName: `Sample${token}`,
    phone: `+1512555${randomInt(3000, 10_000)}`,
    homeMarketId: 'mkt_austin',
    helper: { ...profile, handle: `nday-${token}` },
  };
  const neighbor: SeedPerson = { ...ben, id: `usr_e2e_nday_n_${token}`, email: `nday-neighbor-${token}@example.test`, lastName: `Sample${token}`, phone: `+1512555${randomInt(3000, 10_000)}`, homeMarketId: 'mkt_austin' };
  const taskId = `tsk_e2e_nday_${token}`;
  const taskTitle = `Assemble a dresser ${token}`;
  const { db, pool } = database();
  try {
    await db.transaction(async (tx) => {
      await upsertPeople(tx, [helper, neighbor]);
      // The ID, address, background and payout rows behind Jordan's badges, so the copy is bookable as he is.
      await seedVerification(tx, [helper]);
    });
    const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
    const [place] = await db.select().from(taskLocations).where(eq(taskLocations.id, desk!.locationId!));
    await db.insert(taskLocations).values({ ...place!, id: `loc_e2e_nday_${token}`, ownerUserId: neighbor.id, areaId: 'area_east_austin' });
    const start = new Date(`${date}T21:00:00.000Z`);
    await db.insert(tasks).values({
      ...desk!,
      id: taskId,
      slug: `nday-dresser-${token}`,
      title: taskTitle,
      posterUserId: neighbor.id,
      status: 'open',
      offerCount: 0,
      version: 1,
      requestKey: null,
      locationId: `loc_e2e_nday_${token}`,
      publicAreaId: 'area_east_austin',
      // 3 pm to 9 pm Austin time that day.
      windowStart: start,
      windowEnd: new Date(start.getTime() + 6 * 3_600_000),
      expiresAt: new Date(start.getTime() + 6 * 3_600_000),
    });
  } finally {
    await pool.end();
  }
  return { token, helper, neighbor, taskId, taskTitle };
}

/** Everything the run made goes back: the days and visits canceled, requests closed, the task canceled, the helper a draft. */
async function retire(cast: Cast): Promise<void> {
  const { db, pool } = database();
  try {
    const days = await db.select({ id: neighborhoodDays.id }).from(neighborhoodDays).where(eq(neighborhoodDays.helperUserId, cast.helper.id));
    const ids = days.map((day) => day.id);
    if (ids.length) {
      const slots = await db.select({ id: availabilityPosts.id }).from(availabilityPosts).where(inArray(availabilityPosts.dayId, ids));
      if (slots.length) await db.update(invites).set({ status: 'declined', updatedAt: new Date() }).where(and(inArray(invites.slotId, slots.map((slot) => slot.id)), inArray(invites.status, ['authorizing', 'sent', 'countered'])));
      await db.update(availabilityPosts).set({ status: 'canceled', canceledAt: new Date() }).where(inArray(availabilityPosts.dayId, ids));
      await db.update(neighborhoodDays).set({ status: 'canceled', canceledAt: new Date() }).where(inArray(neighborhoodDays.id, ids));
    }
    // The neighbor's request goes, with its conversation: the shared reset deletes scratch tasks, and a request still
    // pointing at one stops it (the teardown's reseed failed on this, 2026-11-24).
    const asked = await db.select({ id: invites.id }).from(invites).where(eq(invites.taskId, cast.taskId));
    if (asked.length) {
      const threadIds = (await db.select({ id: threads.id }).from(threads).where(and(eq(threads.kind, 'invite'), inArray(threads.linkedId, asked.map((row) => row.id))))).map((row) => row.id);
      if (threadIds.length) {
        await db.delete(messages).where(inArray(messages.threadId, threadIds));
        await db.delete(threadParticipants).where(inArray(threadParticipants.threadId, threadIds));
        await db.delete(threads).where(inArray(threads.id, threadIds));
      }
      await db.delete(invites).where(inArray(invites.id, asked.map((row) => row.id)));
    }
    await db.update(tasks).set({ status: 'canceled' }).where(eq(tasks.id, cast.taskId));
    await db.transaction(async (tx) => {
      await clearHelperOnboarding(tx, cast.helper.id);
      await tx.update(helperProfiles).set({ status: 'draft', idVerifiedAt: null, addressVerifiedAt: null, payoutsReadyAt: null, backgroundCheckedAt: null }).where(eq(helperProfiles.userId, cast.helper.id));
    });
  } finally {
    await pool.end();
  }
}

test('a helper opens a neighborhood day, a neighbor picks a visit, and the helper cancels the rest', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'one run of the whole journey; the card and form previews cover phones');
  test.setTimeout(240_000);
  const date = marketDate(5);
  const cast = await makeCast(date);
  const helperName = `${cast.helper.firstName} ${cast.helper.lastName.charAt(0)}.`;
  try {
    // The helper opens the day: East Austin, furniture, two visits, $65 usually and $50 for neighbors.
    await devSignIn(page, cast.helper.email);
    await page.goto('/app/availability');
    const form = page.getByRole('form', { name: 'Open a neighborhood day' });
    await expect(form).toBeVisible({ timeout: 30_000 });
    await form.getByLabel('Neighborhood').selectOption('east-austin');
    await form.getByLabel('Kind of work').selectOption('furniture-assembly');
    await form.getByLabel('Date').fill(date);
    await form.getByLabel('Starts').nth(0).selectOption('17:00');
    await form.getByLabel('Ends').nth(0).selectOption('18:00');
    await form.getByLabel('Starts').nth(1).selectOption('18:30');
    await form.getByLabel('Ends').nth(1).selectOption('19:30');
    await form.getByLabel('Your price per visit').fill('65');
    await form.getByRole('checkbox', { name: 'Offer a neighbor price' }).click();
    await form.getByLabel('Neighbor price per visit').fill('50');
    await form.getByRole('button', { name: 'Open the day' }).click();
    await expect(page.getByText('Your neighborhood day is open. Neighbors see it now.')).toBeVisible({ timeout: 30_000 });
    const mine = page.getByRole('region', { name: 'Your neighborhood days' }).getByRole('article').first();
    await expect(mine).toContainText('East Austin', { timeout: 30_000 });
    await expect(mine).toContainText('2 of 2 visits open');
    await expect(mine).toContainText('$50.00 a visit');

    // The neighbor finds it on Neighbors for East Austin and picks the 5 pm visit: the request dialog opens on it.
    await devSignIn(page, cast.neighbor.email);
    await page.goto('/app/community?area=east-austin');
    const strip = page.getByRole('region', { name: 'Neighborhood days' });
    const card = strip.getByRole('article').filter({ hasText: `${helperName}'s neighborhood day` });
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card).toContainText('usually $65.00');
    await card.getByRole('link', { name: /^Pick the 5:00 pm/ }).click();
    await expect(page).toHaveURL(new RegExp(`/app/helpers/nday-${cast.token}/request\\?slot=avl_`), { timeout: 30_000 });
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('[aria-current="true"]')).toContainText('5:00 pm', { timeout: 30_000 });
    await dialog.getByRole('radio', { name: new RegExp(cast.taskTitle) }).click();
    await dialog.getByRole('radio', { name: 'Approved' }).click();
    await dialog.getByRole('checkbox', { name: /I agree to the/ }).click();
    await dialog.getByRole('button', { name: 'Send request' }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });

    // The card fills up: one visit taken, one open.
    await page.goto('/app/community?area=east-austin');
    const after = page.getByRole('region', { name: 'Neighborhood days' }).getByRole('article').filter({ hasText: `${helperName}'s neighborhood day` });
    await expect(after).toContainText('1 of 2 visits open', { timeout: 30_000 });
    await expect(after).toContainText('Taken');
    await expect(after).toContainText('Filling up');

    // The helper cancels the visits still open; the request is declined with them.
    await devSignIn(page, cast.helper.email);
    await page.goto('/app/availability');
    const day = page.getByRole('region', { name: 'Your neighborhood days' }).getByRole('article').first();
    await expect(day).toContainText('1 of 2 visits open', { timeout: 30_000 });
    await day.getByRole('button', { name: 'Cancel open visits' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel open visits' }).click();
    await expect(page.getByText('The open visits are canceled.').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('region', { name: 'Your neighborhood days' }).getByRole('article').first()).toContainText('Canceled', { timeout: 30_000 });
  } finally {
    await retire(cast);
  }
});
