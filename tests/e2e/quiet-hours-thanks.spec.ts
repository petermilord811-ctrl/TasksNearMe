import { expect, test, type Browser, type Page } from '@playwright/test';
import { and, eq, inArray } from 'drizzle-orm';
import { routes } from '../../src/contracts/routes';
import { users } from '../../src/modules/accounts/schema';
import { bookingCompletions, bookingTerms, bookings } from '../../src/modules/bookings/schema';
import { messages, threadParticipants, threads } from '../../src/modules/messaging/schema';
import { notificationDeliveries, notificationQuietHours, notifications } from '../../src/modules/notifications/schema';
import { offers } from '../../src/modules/offers/schema';
import { helperProfiles } from '../../src/modules/profiles/schema';
import { tasks } from '../../src/modules/tasks/schema';
import { thankYouNotes } from '../../src/modules/thanks/schema';
import { createDb } from '../../src/platform/db/connect';
import { devSignIn } from './support/sign-in';

/**
 * Thank-you notes and quiet hours (2026-11-24, owner's list). A client and a helper made for the test, with a completed
 * booking copied from Maya's wardrobe with Sam. The client sends a note from the booking page; the helper finds it as a
 * card in the booking's conversation and shows it on their profile, where it reads with the client's first name; the
 * client deletes it. Then the helper turns quiet hours on (all day, so the time of the run doesn't matter) and the client,
 * writing to them, sees when they'll get it. Everyone and everything here is removed after.
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

interface Cast {
  run: string;
  clientId: string;
  clientEmail: string;
  helperId: string;
  helperEmail: string;
  handle: string;
  bookingId: string;
  taskId: string;
  offerId: string;
}

async function makeCast(): Promise<Cast> {
  const { db, pool } = database();
  try {
    const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const cast: Cast = {
      run,
      clientId: `usr_e2e_tyn_${run}`,
      clientEmail: `e2e-tyn-${run}@example.test`,
      helperId: `usr_e2e_tyn_helper_${run}`,
      helperEmail: `e2e-tyn-helper-${run}@example.test`,
      handle: `e2e-tyn-${run}`,
      bookingId: `bkg_e2e_tyn_${run}`,
      taskId: `tsk_e2e_tyn_${run}`,
      offerId: `off_e2e_tyn_${run}`,
    };
    const [maya] = await db.select().from(users).where(eq(users.id, 'usr_maya'));
    const [sam] = await db.select().from(users).where(eq(users.id, 'usr_sam'));
    const [profile] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, 'usr_sam'));
    const [task] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_wardrobe'));
    const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_wardrobe_sam'));
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, 'bkg_wardrobe'));
    const terms = await db.select().from(bookingTerms).where(eq(bookingTerms.bookingId, 'bkg_wardrobe'));
    const [completion] = await db.select().from(bookingCompletions).where(eq(bookingCompletions.bookingId, 'bkg_wardrobe'));
    if (!maya || !sam || !profile || !task || !offer || !booking || terms.length === 0 || !completion) throw new Error('The seeded wardrobe booking is missing');
    const now = Date.now();
    await db.insert(users).values([
      { ...maya, id: cast.clientId, email: cast.clientEmail, name: 'Tess N.', firstName: 'Tess', lastName: 'Nolan', phone: null, phoneVerifiedAt: null, locale: 'en', homeMarketId: 'mkt_austin' },
      { ...sam, id: cast.helperId, email: cast.helperEmail, name: 'Hugo P.', firstName: 'Hugo', lastName: 'Price', phone: null, phoneVerifiedAt: null, locale: 'en', homeMarketId: 'mkt_austin' },
    ]);
    await db.insert(helperProfiles).values({ ...profile, userId: cast.helperId, handle: cast.handle, status: 'active', foundingNumber: null });
    await db.insert(tasks).values({ ...task, id: cast.taskId, slug: `${task.slug}-${run}`, posterUserId: cast.clientId });
    await db.insert(offers).values({ ...offer, id: cast.offerId, taskId: cast.taskId, helperUserId: cast.helperId });
    await db.insert(bookings).values({ ...booking, id: cast.bookingId, taskId: cast.taskId, offerId: cast.offerId, posterUserId: cast.clientId, helperUserId: cast.helperId, seriesId: null, status: 'completed', startAt: new Date(now - 3 * 86_400_000), completedAt: new Date(now - 2 * 86_400_000) });
    await db.insert(bookingTerms).values(terms.map((row, index) => ({ ...row, id: `btm_e2e_tyn_${run}_${index}`, bookingId: cast.bookingId })));
    await db.insert(bookingCompletions).values({ ...completion, bookingId: cast.bookingId });
    return cast;
  } finally {
    await pool.end();
  }
}

async function removeCast(cast: Cast): Promise<void> {
  const { db, pool } = database();
  try {
    const people = [cast.clientId, cast.helperId];
    const threadIds = (await db.select({ id: threads.id }).from(threads).where(and(eq(threads.kind, 'booking'), eq(threads.linkedId, cast.bookingId)))).map((row) => row.id);
    await db.delete(thankYouNotes).where(eq(thankYouNotes.bookingId, cast.bookingId));
    if (threadIds.length) {
      await db.delete(messages).where(inArray(messages.threadId, threadIds));
      await db.delete(threadParticipants).where(inArray(threadParticipants.threadId, threadIds));
      await db.delete(threads).where(inArray(threads.id, threadIds));
    }
    await db.delete(notificationDeliveries).where(inArray(notificationDeliveries.userId, people));
    await db.delete(notifications).where(inArray(notifications.userId, people));
    await db.delete(notificationQuietHours).where(inArray(notificationQuietHours.userId, people));
    await db.delete(bookingCompletions).where(eq(bookingCompletions.bookingId, cast.bookingId));
    await db.delete(bookingTerms).where(eq(bookingTerms.bookingId, cast.bookingId));
    await db.delete(bookings).where(eq(bookings.id, cast.bookingId));
    await db.delete(offers).where(eq(offers.id, cast.offerId));
    await db.delete(tasks).where(eq(tasks.id, cast.taskId));
    await db.delete(helperProfiles).where(eq(helperProfiles.userId, cast.helperId));
    // Signing in left sessions behind: the accounts are closed rather than removed, as in the other specs.
    await db.update(users).set({ status: 'deleted' }).where(inArray(users.id, people));
  } finally {
    await pool.end();
  }
}

async function bookingThreadId(cast: Cast): Promise<string> {
  const { db, pool } = database();
  try {
    const [thread] = await db.select({ id: threads.id }).from(threads).where(and(eq(threads.kind, 'booking'), eq(threads.linkedId, cast.bookingId))).limit(1);
    if (!thread) throw new Error('The booking has no conversation yet');
    return thread.id;
  } finally {
    await pool.end();
  }
}

async function signedIn(browser: Browser, email: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await devSignIn(page, email);
  return page;
}

test.describe.configure({ mode: 'serial' });

let cast: Cast;
test.beforeAll(async () => {
  cast = await makeCast();
});
test.afterAll(async () => {
  if (cast) await removeCast(cast);
});

test('a client thanks the helper with a note; the helper shows it on their profile; the client deletes it', async ({ browser }) => {
  test.setTimeout(180_000);
  const note = `Thank you, Hugo! The wardrobe is perfect (${cast.run}).`;

  const client = await signedIn(browser, cast.clientEmail);
  await client.goto(routes.app.booking(cast.bookingId));
  await client.getByRole('button', { name: 'Write a thank-you note' }).click();
  const dialog = client.getByRole('dialog', { name: 'A thank-you note to Hugo P.' });
  await dialog.getByRole('textbox', { name: 'Your note' }).fill(note);
  await dialog.getByRole('button', { name: 'Send note' }).click();
  await expect(dialog).toBeHidden();
  const card = client.getByRole('article', { name: 'Your thank-you note to Hugo P.' }).filter({ visible: true });
  await expect(card).toContainText(note);
  await expect(card).toContainText("Not on Hugo P.'s profile");

  const helper = await signedIn(browser, cast.helperEmail);
  await helper.goto(routes.app.thread(await bookingThreadId(cast)));
  const received = helper.getByRole('article', { name: 'Tess sent you a thank-you note' }).filter({ visible: true });
  await expect(received).toContainText(note);
  await received.getByRole('switch', { name: /Show on my profile/ }).click();
  await expect(received.getByText('Anyone can read it on your profile')).toBeVisible();

  await helper.goto(routes.helperProfile(cast.handle));
  const notes = helper.getByRole('region', { name: 'Thank-you notes' }).or(helper.locator('section[aria-labelledby="helper-thanks-heading"]')).first();
  await expect(notes).toContainText(note);
  // By first name (and the task's neighborhood), never the last name.
  await expect(notes).toContainText('— Tess');
  await expect(notes).not.toContainText('Nolan');

  await client.reload();
  await expect(client.getByRole('article', { name: 'Your thank-you note to Hugo P.' }).filter({ visible: true })).toContainText('Hugo P. shows it on their profile');
  await client.getByRole('article', { name: 'Your thank-you note to Hugo P.' }).filter({ visible: true }).getByRole('button', { name: 'Delete' }).click();
  await client.getByRole('alertdialog', { name: 'Delete your note?' }).getByRole('button', { name: 'Delete note' }).click();
  await expect(client.getByRole('button', { name: 'Write a thank-you note' }).filter({ visible: true })).toBeVisible();

  await helper.goto(routes.helperProfile(cast.handle));
  await expect(helper.getByText(note)).toHaveCount(0);
  await client.context().close();
  await helper.context().close();
});

test("the helper's quiet hours: the client writing to them sees when they'll get it", async ({ browser }) => {
  test.setTimeout(180_000);
  const helper = await signedIn(browser, cast.helperEmail);
  // Phones open the account's groups from the address (plan 9.14b); from 1024 px they're all open.
  await helper.goto(`${routes.app.account()}#account-notifications`);
  const toggle = helper.getByRole('switch', { name: /Quiet hours/ });
  await toggle.click();
  await helper.getByLabel('From', { exact: true }).fill('00:00');
  await helper.getByLabel('Until', { exact: true }).fill('23:59');
  await helper.getByRole('button', { name: 'Save quiet hours' }).click();
  await expect(helper.getByText('Quiet hours saved')).toBeVisible();
  await helper.reload();
  await expect(helper.getByText('On, 00:00 to 23:59')).toBeVisible();

  const client = await signedIn(browser, cast.clientEmail);
  await client.goto(routes.app.thread(await bookingThreadId(cast)));
  await expect(client.getByRole('note').filter({ hasText: "Hugo's quiet hours: they'll see this after" }).filter({ visible: true })).toBeVisible();

  // Turned off, the note is gone.
  await helper.getByRole('switch', { name: /Quiet hours/ }).click();
  await expect(helper.getByText('Quiet hours turned off')).toBeVisible();
  await client.reload();
  await expect(client.getByText("Hugo's quiet hours")).toHaveCount(0);
  await client.context().close();
  await helper.context().close();
});
