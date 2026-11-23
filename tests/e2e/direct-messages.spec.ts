import { expect, test } from '@playwright/test';
import { eq, inArray, or } from 'drizzle-orm';
import { usernames, users } from '../../src/modules/accounts/schema';
import { messages, threadParticipants, threads } from '../../src/modules/messaging/schema';
import { helperProfiles } from '../../src/modules/profiles/schema';
import { sparkPurchases } from '../../src/modules/sparks/schema';
import { outboxEvents } from '../../src/platform/outbox/schema';
import { createDb } from '../../src/platform/db/connect';
import { openAccountGroup } from './support/account';
import { devSignIn } from './support/sign-in';

/**
 * Direct conversations and Sparks (owner, 2026-11-21). A client writes to a helper from the helper's public profile:
 * the first message starts the conversation, contact details stay hidden for the helper, and the client can send a
 * couple more before an answer, with "Send a task request" beside the chat. Then Sparks: a pack bought with the
 * stand-in counts at once and shows as bought, and "Who can message me directly" saves. Everyone here is made for the
 * test (copies of Chris and Jordan, Jordan's profile under its own handle) and removed after it.
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
  clientId: string;
  clientEmail: string;
  helperId: string;
  helperEmail: string;
  handle: string;
}

async function makeCast(): Promise<Cast> {
  const { db, pool } = database();
  try {
    const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const cast: Cast = { clientId: `usr_e2e_dm_${run}`, clientEmail: `e2e-dm-${run}@example.test`, helperId: `usr_e2e_dm_helper_${run}`, helperEmail: `e2e-dm-helper-${run}@example.test`, handle: `e2e-dm-${run}` };
    const [chris] = await db.select().from(users).where(eq(users.id, 'usr_chris'));
    const [jordan] = await db.select().from(users).where(eq(users.id, 'usr_jordan'));
    const [profile] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, 'usr_jordan'));
    if (!chris || !jordan || !profile) throw new Error('The seeded people are missing');
    await db.insert(users).values([
      { ...chris, id: cast.clientId, email: cast.clientEmail, name: 'Lia L.', firstName: 'Lia', lastName: 'Lane', phone: null, phoneVerifiedAt: null, directMessages: 'everyone' },
      { ...jordan, id: cast.helperId, email: cast.helperEmail, name: 'Hal H.', firstName: 'Hal', lastName: 'Hart', phone: null, phoneVerifiedAt: null, directMessages: 'everyone' },
    ]);
    await db.insert(helperProfiles).values({ ...profile, userId: cast.helperId, handle: cast.handle, status: 'active', foundingNumber: null, completedCount: 0 });
    return cast;
  } finally {
    await pool.end();
  }
}

async function removeCast(cast: Cast): Promise<void> {
  const { db, pool } = database();
  try {
    const people = [cast.clientId, cast.helperId];
    const theirs = (await db.select({ id: threadParticipants.threadId }).from(threadParticipants).where(inArray(threadParticipants.userId, people))).map((row) => row.id);
    if (theirs.length) {
      await db.delete(outboxEvents).where(inArray(outboxEvents.aggregateId, theirs));
      await db.delete(messages).where(inArray(messages.threadId, theirs));
      await db.delete(threadParticipants).where(inArray(threadParticipants.threadId, theirs));
      await db.delete(threads).where(or(inArray(threads.id, theirs), inArray(threads.startedByUserId, people)));
    }
    await db.delete(sparkPurchases).where(inArray(sparkPurchases.userId, people));
    // The people stay (sessions and notifications point at them), on no list: the profile goes.
    await db.delete(helperProfiles).where(eq(helperProfiles.userId, cast.helperId));
    await db.update(users).set({ status: 'deleted' }).where(inArray(users.id, people));
  } finally {
    await pool.end();
  }
}

test('a client messages a helper from the profile, the helper reads it masked, and Sparks and the setting work', async ({ page, browser }) => {
  test.setTimeout(240_000);
  const cast = await makeCast();
  try {
    await devSignIn(page, cast.clientEmail);
    await page.goto(`/helpers/${cast.handle}`);
    await page.getByRole('link', { name: 'Message Hal H.' }).first().click();
    await expect(page).toHaveURL(/\/app\/messages\/new\?helper=/, { timeout: 30_000 });
    // A dialog over the profile (2026-11-23, owner: "I hate to redirect to new pages continually … use dialog").
    const dialog = page.getByRole('dialog', { name: 'New message' });
    await expect(dialog.getByRole('heading', { level: 2, name: 'Message Hal H.' })).toBeVisible({ timeout: 30_000 });
    // A newcomer starts 3 a day (2026-11-22; more with Sparks).
    await expect(dialog.getByText('3 new conversations left today (of 3)')).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'Send a task request' })).toBeVisible();

    const box = dialog.getByLabel('Your message');
    await box.fill('Hi Hal! Do you build standing desks? Text me at 512-555-0123.');
    await dialog.getByRole('button', { name: 'Send message' }).click();
    await expect(page).toHaveURL(/\/app\/messages\/thr_/, { timeout: 30_000 });
    const threadPath = new URL(page.url()).pathname;
    const log = page.getByRole('log');
    await expect(log.getByText(/Do you build standing desks/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('You can send 2 more messages until Hal replies.')).toBeVisible();
    await expect(page.getByText('Direct message', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Send a task request' })).toBeVisible();
    // The new-message page now goes straight to this conversation.
    await page.goto(`/app/messages/new?helper=${cast.handle}`);
    await expect(page).toHaveURL(new RegExp(`${threadPath}$`), { timeout: 30_000 });

    // The helper's side: in the inbox as a direct conversation, the phone number hidden.
    const helperContext = await browser.newContext();
    try {
      const helperPage = await helperContext.newPage();
      await devSignIn(helperPage, cast.helperEmail);
      await helperPage.goto(threadPath);
      const helperLog = helperPage.getByRole('log');
      await expect(helperLog.getByText(/Do you build standing desks/)).toBeVisible({ timeout: 30_000 });
      await expect(helperLog.getByText('512-555-0123')).toHaveCount(0);
      await expect(helperPage.getByText('You can send', { exact: false })).toHaveCount(0);
    } finally {
      await helperContext.close();
    }

    // Sparks: a pack with the stand-in, counted at once and shown as bought.
    await page.goto('/app/sparks');
    await expect(page.getByRole('heading', { level: 1, name: 'Sparks' })).toBeVisible({ timeout: 30_000 });
    await expect(async () => {
      await page.getByRole('button', { name: 'Buy 100 for $0.99' }).click({ timeout: 5_000 });
      await expect(page).toHaveURL(/\/app\/sparks\?purchase=spk_/, { timeout: 10_000 });
    }).toPass({ timeout: 60_000 });
    await expect(page.getByText('Thanks! Your Sparks were added.')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('0 earned · 100 bought')).toBeVisible();
    await expect(page.getByRole('img', { name: '100 Sparks, Neighbor, 100 of them bought' })).toBeVisible();

    // Who can message me directly: saved, and still chosen after a reload.
    await page.goto('/app/account');
    await openAccountGroup(page, 'privacy');
    await page.getByRole('radio', { name: /^Nobody/ }).check();
    await expect(page.getByRole('radio', { name: /^Nobody/ })).toBeChecked();
    await expect.poll(async () => {
      await page.reload();
      await openAccountGroup(page, 'privacy');
      return page.getByRole('radio', { name: /^Nobody/ }).isChecked();
    }, { timeout: 30_000 }).toBe(true);
  } finally {
    await removeCast(cast);
  }
});

test('a person finds someone by @username from New message, and chooses their own username', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-mobile', 'one run is enough; phones first');
  test.setTimeout(180_000);
  const cast = await makeCast();
  const { db, pool } = database();
  try {
    const run = cast.handle.replace('e2e-dm-', '').replace(/[^a-z0-9]/g, '');
    const helperName = `hal_${run}`.slice(0, 20);
    await db.insert(usernames).values({ userId: cast.helperId, username: helperName });
    await devSignIn(page, cast.clientEmail);
    await page.goto('/app/messages');
    await page.getByRole('link', { name: 'New message' }).first().click();
    await expect(page).toHaveURL(/\/app\/messages\/new$/, { timeout: 30_000 });
    // A dialog over Messages (2026-11-23): finding the person and the first message happen in it.
    const dialog = page.getByRole('dialog', { name: 'New message' });
    await expect(dialog.getByText('You can start 3 more conversations today (3 a day at your level, Newcomer).')).toBeVisible({ timeout: 30_000 });

    const field = dialog.getByRole('combobox', { name: 'Their username' });
    await field.fill('@nobody_has_this_name');
    await dialog.getByRole('button', { name: 'Find' }).click();
    // Said with one "@", whatever they typed (the box keeps their typing, to fix a typo).
    await expect(dialog.getByRole('alert')).toHaveText('No one we can reach has the username @nobody_has_this_name. Check the spelling.', { timeout: 30_000 });
    // Suggestions as it's typed, any case: the helper, chosen with a tap.
    await field.fill(`@${helperName.toUpperCase()}`);
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await dialog.getByRole('option', { name: /Hal H\./ }).click();
    await expect(dialog.getByRole('heading', { level: 2, name: 'Message Hal H.' })).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByText(`@${helperName}`, { exact: true })).toBeVisible();

    // Their own: shown on the account page, changed there (once in 30 days).
    await page.goto('/app/account');
    await openAccountGroup(page, 'profile');
    const mine = page.getByRole('textbox', { name: 'Username' });
    await expect(mine).toHaveValue(/^lia(_\d+)?$/, { timeout: 30_000 });
    const chosen = `lia_${run}`.slice(0, 20);
    await mine.fill(chosen);
    await page.getByRole('button', { name: 'Save username' }).click();
    await expect(page.getByRole('status').filter({ hasText: `Your username is now @${chosen}.` })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/You can choose another on/)).toBeVisible({ timeout: 30_000 });
    await expect(mine).toBeDisabled();
  } finally {
    await db.delete(usernames).where(inArray(usernames.userId, [cast.clientId, cast.helperId]));
    await pool.end();
    await removeCast(cast);
  }
});

test('on a wide screen New message happens in the chat window: suggestions as the @username is typed, the first message, then the conversation there (2026-11-23)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'the chat window is for wide screens; phones get the dialog');
  test.setTimeout(180_000);
  const cast = await makeCast();
  const { db, pool } = database();
  try {
    const run = cast.handle.replace('e2e-dm-', '').replace(/[^a-z0-9]/g, '');
    const helperName = `hal_${run}`.slice(0, 20);
    await db.insert(usernames).values({ userId: cast.helperId, username: helperName });
    await devSignIn(page, cast.clientEmail);
    await page.goto('/app/bookings');
    await page.getByRole('button', { name: /^Messages(, \d+ unread)?$/ }).click();
    const chat = page.getByRole('dialog', { name: 'Messages' });
    await chat.getByRole('button', { name: 'New message' }).click();
    await expect(chat.getByText('You can start 3 more conversations today (3 a day at your level, Newcomer).')).toBeVisible({ timeout: 30_000 });
    // The start of their username is enough: they're suggested, and a click chooses them.
    await chat.getByRole('combobox', { name: 'Their username' }).fill(helperName.slice(0, -1));
    await chat.getByRole('option', { name: /Hal H\./ }).click();
    await expect(chat.getByRole('heading', { name: 'Message Hal H.' })).toBeVisible({ timeout: 30_000 });
    await chat.getByLabel('Your message').fill('Hi Hal, from the chat window!');
    await chat.getByRole('button', { name: 'Send message' }).click();
    // The new conversation opens in the window; the page behind never moved.
    await expect(chat.getByRole('log').getByText('Hi Hal, from the chat window!')).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/app\/bookings$/);
    // New message again: the helper is suggested with the conversation, and choosing them opens it.
    await chat.getByRole('button', { name: 'New message' }).click();
    await chat.getByRole('combobox', { name: 'Their username' }).fill(helperName);
    await chat.getByRole('option', { name: /Hal H\..*Your conversation/ }).click();
    await expect(chat.getByRole('log').getByText('Hi Hal, from the chat window!')).toBeVisible({ timeout: 30_000 });
  } finally {
    await db.delete(usernames).where(inArray(usernames.userId, [cast.clientId, cast.helperId]));
    await pool.end();
    await removeCast(cast);
  }
});
