import { expect, test, type Page } from '@playwright/test';
import { eq, inArray, or } from 'drizzle-orm';
import { usernames, users } from '../../src/modules/accounts/schema';
import { invites } from '../../src/modules/invites/schema';
import { messages, threadParticipants, threads } from '../../src/modules/messaging/schema';
import { helperProfiles } from '../../src/modules/profiles/schema';
import { tasks } from '../../src/modules/tasks/schema';
import { outboxEvents } from '../../src/platform/outbox/schema';
import { createDb } from '../../src/platform/db/connect';
import { devSignIn } from './support/sign-in';

/**
 * The chat, 2026-11-23 (owner: "plan all and implement"). A stranger's first message waits under Requests; the helper
 * reads it there, with the person it names by @username as a link, translates it, takes a suggested reply, accepts it,
 * pins it and searches it. On wide screens a conversation opens beside the chat window. A task request between two
 * people who talk directly shows as a card in their conversation. Everyone here is made for the test and removed after.
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
}

async function makeCast(): Promise<Cast> {
  const { db, pool } = database();
  try {
    const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const cast: Cast = { run, clientId: `usr_e2e_ct_${run}`, clientEmail: `e2e-ct-${run}@example.test`, helperId: `usr_e2e_ct_helper_${run}`, helperEmail: `e2e-ct-helper-${run}@example.test`, handle: `e2e-ct-${run}` };
    const [chris] = await db.select().from(users).where(eq(users.id, 'usr_chris'));
    const [jordan] = await db.select().from(users).where(eq(users.id, 'usr_jordan'));
    const [profile] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, 'usr_jordan'));
    if (!chris || !jordan || !profile) throw new Error('The seeded people are missing');
    await db.insert(users).values([
      { ...chris, id: cast.clientId, email: cast.clientEmail, name: 'Lia L.', firstName: 'Lia', lastName: 'Lane', phone: null, phoneVerifiedAt: null, directMessages: 'everyone', locale: 'en' },
      { ...jordan, id: cast.helperId, email: cast.helperEmail, name: 'Hal H.', firstName: 'Hal', lastName: 'Hart', phone: null, phoneVerifiedAt: null, directMessages: 'everyone', locale: 'en' },
    ]);
    await db.insert(helperProfiles).values({ ...profile, userId: cast.helperId, handle: cast.handle, status: 'active', foundingNumber: null, completedCount: 0 });
    await db.insert(usernames).values([{ userId: cast.clientId, username: `lia_${run}`.slice(0, 20) }, { userId: cast.helperId, username: `hal_${run}`.slice(0, 20) }]);
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
    await db.delete(invites).where(or(inArray(invites.posterUserId, people), inArray(invites.helperUserId, people)));
    await db.delete(usernames).where(inArray(usernames.userId, people));
    await db.delete(helperProfiles).where(eq(helperProfiles.userId, cast.helperId));
    await db.update(users).set({ status: 'deleted' }).where(inArray(users.id, people));
  } finally {
    await pool.end();
  }
}

/** Jordan's @username in this database (seeds give everyone one). */
async function jordanUsername(): Promise<string> {
  const { db, pool } = database();
  try {
    const [row] = await db.select({ username: usernames.username }).from(usernames).where(eq(usernames.userId, 'usr_jordan'));
    if (!row) throw new Error('Jordan has no username');
    return row.username;
  } finally {
    await pool.end();
  }
}

/** The client writes the first message from the New message page (a hard load: the page itself, not the dialog). */
async function firstMessage(page: Page, cast: Cast, body: string): Promise<string> {
  await devSignIn(page, cast.clientEmail);
  await page.goto(`/app/messages/new?helper=${cast.handle}`);
  await page.getByLabel('Your message').fill(body);
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page).toHaveURL(/\/app\/messages\/thr_/, { timeout: 30_000 });
  return new URL(page.url()).pathname;
}

test('a stranger’s first message waits under Requests; the helper translates it, takes a suggested reply, accepts, pins and searches it', async ({ page, browser, baseURL }) => {
  test.setTimeout(300_000);
  const cast = await makeCast();
  try {
    const jordan = await jordanUsername();
    const threadPath = await firstMessage(page, cast, `Hi Hal! @${jordan} said you assemble standing desks. Could you do mine on Saturday?`);

    const helper = await browser.newContext();
    try {
      // The models' stand-ins, never a real model in tests.
      await helper.addCookies([{ name: 'tnm_ai_stand_in', value: '1', url: baseURL! }]);
      const hal = await helper.newPage();
      await devSignIn(hal, cast.helperEmail);
      await hal.goto('/app/messages');
      // Not in All: under Requests.
      const requests = hal.getByRole('button', { name: /^Requests\s*\(1\)/ });
      await expect(requests).toBeVisible({ timeout: 30_000 });
      await expect(hal.getByRole('list', { name: 'Conversations' }).getByRole('heading', { name: 'Lia L.' })).toHaveCount(0);
      await requests.click();
      await hal.getByRole('list', { name: 'Conversations' }).getByRole('link', { name: /Lia L\./ }).first().click();
      await expect(hal).toHaveURL(new RegExp(`${threadPath}$`), { timeout: 30_000 });

      const banner = hal.getByRole('region', { name: 'Message request' });
      await expect(banner.getByText('Lia wants to message you')).toBeVisible({ timeout: 30_000 });
      // Jordan, named by @username: a link to his profile, shown by name.
      const log = hal.getByRole('log');
      await expect(log.getByRole('link', { name: '@Jordan T.' }).first()).toHaveAttribute('href', /\/helpers\//);
      // Translate: the stand-in marks the reader's language.
      await log.getByRole('button', { name: 'Translate' }).first().click();
      await expect(log.getByText(/^\[EN\] Hi Hal!/)).toBeVisible({ timeout: 30_000 });
      // Suggest replies: a tap fills the box; nothing is sent.
      await hal.getByRole('button', { name: 'Suggest replies' }).click();
      await hal.getByRole('button', { name: 'What day and time work best for you?' }).click();
      await expect(hal.getByRole('textbox', { name: 'Message' })).toHaveValue('What day and time work best for you?');

      await banner.getByRole('button', { name: 'Accept' }).click();
      await expect(banner).toHaveCount(0, { timeout: 30_000 });

      // Pin it from the conversation's menu; Messages shows it on top, marked.
      await hal.getByRole('button', { name: 'Options for your conversation with Lia L.' }).click();
      await hal.getByRole('menuitem', { name: 'Pin to top' }).click();
      await expect(hal.getByText('Pinned to the top')).toBeVisible({ timeout: 30_000 });

      // Search it: the result shows the conversation from that message.
      await hal.getByRole('button', { name: 'Options for your conversation with Lia L.' }).click();
      await hal.getByRole('menuitem', { name: 'Search in conversation' }).click();
      const search = hal.getByRole('dialog', { name: 'Search your messages with Lia L.' });
      await search.getByRole('searchbox', { name: 'Search this conversation' }).fill('standing');
      await search.getByRole('button', { name: 'Search', exact: true }).click();
      await search.getByRole('button', { name: /standing desks/ }).click();
      await expect(hal).toHaveURL(/focus=msg_/, { timeout: 30_000 });

      await hal.goto('/app/messages');
      const pinned = hal.getByRole('list', { name: 'Conversations' }).getByRole('listitem').first();
      await expect(pinned.getByRole('heading', { name: 'Lia L.' })).toBeVisible({ timeout: 30_000 });
      await expect(pinned.getByRole('img', { name: 'Pinned' })).toBeVisible();
      await expect(hal.getByRole('button', { name: /^Requests/ })).toHaveCount(0);
    } finally {
      await helper.close();
    }
  } finally {
    await removeCast(cast);
  }
});

test('on a wide screen a conversation opens beside the chat window, minimizes to a bar and closes', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'side by side is for wide screens');
  test.setTimeout(240_000);
  const cast = await makeCast();
  try {
    await firstMessage(page, cast, 'Hi Hal! Are you around this weekend?');
    await page.goto('/app/bookings');
    await page.locator('[data-chat-launcher="window"]').click();
    const chat = page.getByRole('dialog', { name: 'Messages' });
    await chat.getByRole('button', { name: 'Quick actions for your conversation with Hal H.' }).click();
    await page.getByRole('menuitem', { name: 'Open beside' }).click();
    const docked = page.getByRole('dialog', { name: 'Conversation with Hal H., beside the chat window' });
    await expect(docked.getByRole('log').getByText('Hi Hal! Are you around this weekend?')).toBeVisible({ timeout: 30_000 });
    // It's beside the window, not over it.
    const [chatBox, dockedBox] = await Promise.all([chat.boundingBox(), docked.boundingBox()]);
    expect(dockedBox!.x + dockedBox!.width).toBeLessThanOrEqual(chatBox!.x + 1);
    await docked.getByRole('button', { name: 'Minimize the conversation with Hal H.' }).click();
    const bar = page.getByRole('region', { name: 'Conversation with Hal H., minimized' });
    await expect(bar).toBeVisible();
    await bar.getByRole('button', { name: 'Close the conversation with Hal H.' }).click();
    await expect(bar).toHaveCount(0);
  } finally {
    await removeCast(cast);
  }
});

test('a task request between two people who talk directly shows as a card in their conversation', async ({ page, browser }) => {
  test.setTimeout(240_000);
  const cast = await makeCast();
  const { db, pool } = database();
  try {
    const threadPath = await firstMessage(page, cast, 'Hi Hal! I’ll send you a request for the desk.');
    const threadId = threadPath.split('/').pop()!;
    // The request as the request flow leaves it once the card's hold is in (invites/service.ts), with its line in the
    // conversation (postInDirectThread).
    const [task] = await db.select({ id: tasks.id }).from(tasks).limit(1);
    const inviteId = `inv_e2e_ct_${cast.run}`;
    const start = new Date(Date.now() + 5 * 86_400_000);
    await db.insert(invites).values({ id: inviteId, taskId: task!.id, posterUserId: cast.clientId, helperUserId: cast.helperId, status: 'sent', pricingType: 'fixed', priceCents: 8000, startAt: start, breakdown: { lines: [], totalCents: 8000 } as never, expiresAt: new Date(Date.now() + 86_400_000) });
    await db.insert(messages).values({ id: `msg_e2e_ct_${cast.run}`, threadId, kind: 'status', event: { type: 'invite_sent', params: { inviteId } }, createdAt: new Date() });

    await page.goto(threadPath);
    const clientCard = page.getByRole('article', { name: /^Task request: / });
    await expect(clientCard.getByText('Waiting for Hal')).toBeVisible({ timeout: 30_000 });
    await expect(clientCard.getByText('$80.00')).toBeVisible();
    await expect(clientCard.getByRole('button', { name: 'Cancel request' })).toBeVisible();

    const helper = await browser.newContext();
    try {
      const hal = await helper.newPage();
      await devSignIn(hal, cast.helperEmail);
      await hal.goto(threadPath);
      const card = hal.getByRole('article', { name: /^Task request: / });
      await expect(card.getByText('Waiting for you')).toBeVisible({ timeout: 30_000 });
      await expect(card.getByRole('button', { name: 'Accept' })).toBeVisible();
      await expect(card.getByRole('button', { name: 'Decline' })).toBeVisible();
      await expect(card.getByRole('link', { name: 'Suggest changes' })).toHaveAttribute('href', `/app/offers?invite=${inviteId}`);
    } finally {
      await helper.close();
    }
  } finally {
    await pool.end();
    await removeCast(cast);
  }
});
