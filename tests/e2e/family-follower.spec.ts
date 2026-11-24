import { expect, test, type Browser, type Page } from '@playwright/test';
import { and, eq, inArray } from 'drizzle-orm';
import { routes } from '../../src/contracts/routes';
import { usernames, users } from '../../src/modules/accounts/schema';
import { bookingTerms, bookings } from '../../src/modules/bookings/schema';
import { bookingFollowers } from '../../src/modules/followers/schema';
import { messages, threadParticipants, threads } from '../../src/modules/messaging/schema';
import { notificationDeliveries, notifications } from '../../src/modules/notifications/schema';
import { offers } from '../../src/modules/offers/schema';
import { helperProfiles } from '../../src/modules/profiles/schema';
import { tasks } from '../../src/modules/tasks/schema';
import { createDb } from '../../src/platform/db/connect';
import { outboxEvents } from '../../src/platform/outbox/schema';
import { devSignIn } from './support/sign-in';

/**
 * Family followers (2026-11-24, owner's chat ideas). A client, a helper and the client's daughter made for the test,
 * with a confirmed booking copied from Maya's wardrobe with Sam. The client adds her daughter from the booking page by
 * email; the helper sees who follows in the conversation; the daughter finds it under "Bookings you follow", reads the
 * booking (no money, no actions) and the conversation (read-only), and the client removes her from the conversation's ⋯
 * menu. Everyone and everything here is removed after; the seeded people are never changed.
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
  followerId: string;
  followerEmail: string;
  bookingId: string;
  taskId: string;
  offerId: string;
  title: string;
}

async function makeCast(): Promise<Cast> {
  const { db, pool } = database();
  try {
    const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const cast: Cast = {
      run,
      clientId: `usr_e2e_ffw_${run}`,
      clientEmail: `e2e-ffw-${run}@example.test`,
      helperId: `usr_e2e_ffw_helper_${run}`,
      helperEmail: `e2e-ffw-helper-${run}@example.test`,
      followerId: `usr_e2e_ffw_lia_${run}`,
      followerEmail: `e2e-ffw-lia-${run}@example.test`,
      bookingId: `bkg_e2e_ffw_${run}`,
      taskId: `tsk_e2e_ffw_${run}`,
      offerId: `off_e2e_ffw_${run}`,
      title: '',
    };
    const [maya] = await db.select().from(users).where(eq(users.id, 'usr_maya'));
    const [sam] = await db.select().from(users).where(eq(users.id, 'usr_sam'));
    const [profile] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, 'usr_sam'));
    const [task] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_wardrobe'));
    const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_wardrobe_sam'));
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, 'bkg_wardrobe'));
    const terms = await db.select().from(bookingTerms).where(eq(bookingTerms.bookingId, 'bkg_wardrobe'));
    if (!maya || !sam || !profile || !task || !offer || !booking || terms.length === 0) throw new Error('The seeded wardrobe booking is missing');
    cast.title = `${task.title} (${run})`;
    const now = Date.now();
    const start = new Date(now + 2 * 86_400_000);
    await db.insert(users).values([
      { ...maya, id: cast.clientId, email: cast.clientEmail, name: 'Fay W.', firstName: 'Fay', lastName: 'Ward', phone: null, phoneVerifiedAt: null, locale: 'en', homeMarketId: 'mkt_austin' },
      { ...sam, id: cast.helperId, email: cast.helperEmail, name: 'Hugo W.', firstName: 'Hugo', lastName: 'West', phone: null, phoneVerifiedAt: null, locale: 'en', homeMarketId: 'mkt_austin' },
      { ...maya, id: cast.followerId, email: cast.followerEmail, name: 'Lia W.', firstName: 'Lia', lastName: 'Ward', phone: null, phoneVerifiedAt: null, locale: 'en', homeMarketId: 'mkt_austin' },
    ]);
    await db.insert(helperProfiles).values({ ...profile, userId: cast.helperId, handle: `e2e-ffw-${run}`, status: 'active', foundingNumber: null });
    await db.insert(tasks).values({ ...task, id: cast.taskId, title: cast.title, slug: `${task.slug}-${run}`, posterUserId: cast.clientId });
    await db.insert(offers).values({ ...offer, id: cast.offerId, taskId: cast.taskId, helperUserId: cast.helperId });
    await db.insert(bookings).values({ ...booking, id: cast.bookingId, taskId: cast.taskId, offerId: cast.offerId, posterUserId: cast.clientId, helperUserId: cast.helperId, seriesId: null, status: 'confirmed', confirmedAt: new Date(now - 86_400_000), startAt: start, completedAt: null, canceledAt: null, cancelReason: null, onMyWayAt: null, arrivedAt: null, completionSubmittedAt: null, approvalDueAt: null, completedVia: null });
    await db.insert(bookingTerms).values(terms.map((row, index) => ({ ...row, id: `btm_e2e_ffw_${run}_${index}`, bookingId: cast.bookingId, startAt: start })));
    return cast;
  } finally {
    await pool.end();
  }
}

async function removeCast(cast: Cast): Promise<void> {
  const { db, pool } = database();
  try {
    const people = [cast.clientId, cast.helperId, cast.followerId];
    const threadIds = (await db.select({ id: threads.id }).from(threads).where(and(eq(threads.kind, 'booking'), eq(threads.linkedId, cast.bookingId)))).map((row) => row.id);
    await db.delete(bookingFollowers).where(eq(bookingFollowers.bookingId, cast.bookingId));
    if (threadIds.length) {
      await db.delete(messages).where(inArray(messages.threadId, threadIds));
      await db.delete(threadParticipants).where(inArray(threadParticipants.threadId, threadIds));
      await db.delete(threads).where(inArray(threads.id, threadIds));
    }
    await db.delete(outboxEvents).where(eq(outboxEvents.aggregateId, cast.bookingId));
    await db.delete(notificationDeliveries).where(inArray(notificationDeliveries.userId, people));
    await db.delete(notifications).where(inArray(notifications.userId, people));
    await db.delete(bookingTerms).where(eq(bookingTerms.bookingId, cast.bookingId));
    await db.delete(bookings).where(eq(bookings.id, cast.bookingId));
    await db.delete(offers).where(eq(offers.id, cast.offerId));
    await db.delete(tasks).where(eq(tasks.id, cast.taskId));
    await db.delete(helperProfiles).where(eq(helperProfiles.userId, cast.helperId));
    await db.delete(usernames).where(inArray(usernames.userId, people));
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

test('a client lets her daughter follow a booking; the helper sees it; the daughter reads along, read-only', async ({ browser }) => {
  test.setTimeout(240_000);

  // The client adds her daughter by email from the booking page.
  const client = await signedIn(browser, cast.clientEmail);
  await client.goto(routes.app.booking(cast.bookingId));
  const family = client.locator('section[aria-labelledby="booking-family"]');
  await family.getByRole('button', { name: 'Add a family member' }).click();
  const dialog = client.getByRole('dialog', { name: 'Family members' });
  await expect(dialog).toContainText("never see your address or payments");
  await dialog.getByRole('textbox', { name: 'Their username or email' }).fill(cast.followerEmail.toUpperCase());
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Remove Lia W.' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();
  await expect(family).toContainText('Lia W. follows this booking as your family');

  // The helper always sees who follows, in the conversation's note and as a status line.
  const threadId = await bookingThreadId(cast);
  const helper = await signedIn(browser, cast.helperEmail);
  await helper.goto(routes.app.thread(threadId));
  await expect(helper.locator('[data-family-note="helper"]').filter({ visible: true })).toContainText("Fay W.'s family member Lia W. follows this booking");
  await expect(helper.getByText('Lia W. now follows this booking (family)').filter({ visible: true }).first()).toBeVisible();
  await expect(helper.locator('[data-family-note]').filter({ visible: true })).not.toContainText(cast.followerEmail);

  // The daughter hears once, finds it under "Bookings you follow", and reads it without money or actions.
  const follower = await signedIn(browser, cast.followerEmail);
  await follower.goto(routes.app.notifications());
  await expect(follower.getByText(`Fay W. added you to follow a booking: ${cast.title}`).first()).toBeVisible();
  await follower.goto(routes.app.bookings());
  const followed = follower.locator('section[aria-labelledby="bookings-following"]');
  await expect(followed).toContainText("Fay W.'s booking");
  await followed.getByRole('link', { name: cast.title }).click();
  await expect(follower).toHaveURL(new RegExp(routes.app.booking(cast.bookingId)));
  const page = follower.locator('[data-followed-booking]');
  await expect(page).toContainText("You're following Fay W.'s booking, with Hugo helping");
  await expect(page).toContainText('The exact address stays between Fay W. and the helper.');
  // No money of the booking's: the helper's public card may show their own prices, so only the page's own sections.
  await expect(page.locator('section[aria-labelledby="followed-when"]')).not.toContainText('$');
  await expect(page.getByText(/Payments|Total|Refund/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Cancel|Pay|Approve|Review/ })).toHaveCount(0);

  // The conversation, read-only: no message box, and the way it says so.
  await follower.goto(routes.app.thread(threadId));
  await expect(follower.getByText("You're following this booking (read-only)").filter({ visible: true }).first()).toBeVisible();
  await expect(follower.locator('[data-family-note="following"]').filter({ visible: true }).first()).toContainText("You're following Fay W.'s booking (read-only)");
  await expect(follower.getByRole('textbox', { name: 'Message', exact: true }).filter({ visible: true })).toHaveCount(0);
  await follower.goto(routes.app.messages());
  await expect(follower.locator('[data-following-mark]').filter({ visible: true }).first()).toBeVisible();

  // The client removes her from the conversation's ⋯ menu; the booking is gone for her.
  await client.goto(routes.app.thread(threadId));
  await client.getByRole('button', { name: 'Options for your conversation with Hugo W.' }).filter({ visible: true }).first().click();
  await client.getByRole('menuitem', { name: 'Add a family member' }).click();
  const menuDialog = client.getByRole('dialog', { name: 'Family members' });
  await menuDialog.getByRole('button', { name: 'Remove Lia W.' }).click();
  await expect(menuDialog).toContainText("Lia W. doesn't follow this booking any more.");
  await follower.goto(routes.app.booking(cast.bookingId));
  await expect(follower.locator('[data-followed-booking]')).toHaveCount(0);

  await client.context().close();
  await helper.context().close();
  await follower.context().close();
});
