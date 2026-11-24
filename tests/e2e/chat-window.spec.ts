import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { users } from '../../src/modules/accounts/schema';
import { messages, threadParticipants, threads } from '../../src/modules/messaging/schema';
import { notificationDeliveries, notifications } from '../../src/modules/notifications/schema';
import { offers } from '../../src/modules/offers/schema';
import { supportCaseEvents, supportCaseReads, supportCases } from '../../src/modules/support/schema';
import { tasks } from '../../src/modules/tasks/schema';
import { createDb } from '../../src/platform/db/connect';
import { outboxEvents } from '../../src/platform/outbox/schema';
import { devSignIn } from './support/sign-in';

/**
 * Messages as a chat button and window (2026-11-22, the owner's "Reddit similar chat"), and TasksNearMe Help: the support
 * assistant (the rule-based stand-in, through the `tnm_ai_stand_in` cookie, never a model) and the hand-off to a person,
 * whose reply arrives live. Everything is made for each test and removed after it: a client (a copy of Chris) with two
 * unread messages from a helper (a copy of Jordan) about her own hidden task, and their notification.
 */

interface Made {
  clientId: string;
  email: string;
  threadId: string;
  taskId: string;
  offerId: string;
  notificationId: string;
}

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

async function unreadConversation(): Promise<Made> {
  const { db, pool } = database();
  try {
    const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const clientId = `usr_e2e_chat_${run}`;
    const helperId = `usr_e2e_chat_helper_${run}`;
    const email = `e2e-chat-${run}@example.test`;
    const [chris] = await db.select().from(users).where(eq(users.id, 'usr_chris'));
    const [jordan] = await db.select().from(users).where(eq(users.id, 'usr_jordan'));
    const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
    const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_jordan'));
    if (!chris || !jordan || !desk || !offer) throw new Error('The seeded people or the desk are missing');
    await db.insert(users).values([
      { ...chris, id: clientId, email, name: 'Cleo C.', firstName: 'Cleo', lastName: 'Carter', phone: null, phoneVerifiedAt: null },
      { ...jordan, id: helperId, email: `e2e-chat-helper-${run}@example.test`, name: 'Hal H.', firstName: 'Hal', lastName: 'Hayes', phone: null, phoneVerifiedAt: null },
    ]);
    const taskId = `tsk_e2e_chat_${run}`;
    const title = `Chat window check (e2e ${run})`;
    await db.insert(tasks).values({ ...desk, id: taskId, slug: `e2e-chat-${run}`, title, posterUserId: clientId, status: 'open', offerCount: 1, version: 1, hiddenAt: new Date(), hiddenReason: 'e2e: a conversation’s task' });
    const offerId = `off_e2e_chat_${run}`;
    await db.insert(offers).values({ ...offer, id: offerId, taskId, helperUserId: helperId, status: 'pending', revision: 1, expiresAt: new Date(Date.now() + 2 * 86_400_000) });
    const threadId = `thr_e2e_chat_${run}`;
    const now = Date.now();
    await db.insert(threads).values({ id: threadId, kind: 'offer', linkedId: offerId, taskId, createdAt: new Date(now - 10 * 60_000), lastMessageAt: new Date(now - 60_000) });
    await db.insert(threadParticipants).values([
      { threadId, userId: clientId },
      { threadId, userId: helperId, lastReadAt: new Date(now) },
    ]);
    await db.insert(messages).values([
      { id: `msg_e2e_chat_${run}_1`, threadId, senderUserId: helperId, kind: 'text', body: 'I can bring a drill.', createdAt: new Date(now - 2 * 60_000) },
      { id: `msg_e2e_chat_${run}_2`, threadId, senderUserId: helperId, kind: 'text', body: 'Is the desk box still in the hall?', createdAt: new Date(now - 60_000) },
    ]);
    const notificationId = `ntf_e2e_chat_${run}`;
    await db.insert(notifications).values({ id: notificationId, userId: clientId, type: 'message_received', title, actorName: 'Hal H.', target: { kind: 'thread', threadId }, sourceEventId: `e2e:chat:${run}`, createdAt: new Date(now - 60_000) });
    return { clientId, email, threadId, taskId, offerId, notificationId };
  } finally {
    await pool.end();
  }
}

/** Takes away what the test made: the conversation, notifications, support cases from the assistant, the task. */
async function removeAll(made: Made): Promise<void> {
  const { db, pool } = database();
  try {
    const cases = await db.select({ id: supportCases.id }).from(supportCases).where(eq(supportCases.openedByUserId, made.clientId));
    const caseIds = cases.map((row) => row.id);
    if (caseIds.length > 0) {
      await db.delete(supportCaseEvents).where(inArray(supportCaseEvents.caseId, caseIds));
      await db.delete(supportCaseReads).where(inArray(supportCaseReads.caseId, caseIds));
      await db.delete(supportCases).where(inArray(supportCases.id, caseIds));
    }
    // The job runner may still be delivering a notification (support's reply): wait for it a little, so removing the
    // notification never races its delivery (a foreign key error in the server's log).
    for (let tries = 0; tries < 16; tries += 1) {
      const waiting = await db
        .select({ id: notifications.id })
        .from(notifications)
        .leftJoin(notificationDeliveries, eq(notificationDeliveries.notificationId, notifications.id))
        .where(and(eq(notifications.userId, made.clientId), isNull(notificationDeliveries.id)));
      if (waiting.length === 0) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const own = await db.select({ id: notifications.id }).from(notifications).where(eq(notifications.userId, made.clientId));
    if (own.length > 0) {
      await db.delete(notificationDeliveries).where(inArray(notificationDeliveries.notificationId, own.map((row) => row.id)));
      await db.delete(notifications).where(eq(notifications.userId, made.clientId));
    }
    await db.delete(messages).where(eq(messages.threadId, made.threadId));
    await db.delete(threadParticipants).where(eq(threadParticipants.threadId, made.threadId));
    await db.delete(threads).where(eq(threads.id, made.threadId));
    await db.delete(offers).where(eq(offers.id, made.offerId));
    await db.delete(tasks).where(eq(tasks.id, made.taskId));
  } finally {
    await pool.end();
  }
}

/**
 * Support answers the person on their case, as staff's reply does: a reply to someone waiting for a live chat joins it
 * (2026-11-22), then the message, then the event that tells their pages.
 */
async function supportReplies(made: Made, body: string): Promise<void> {
  const { db, pool } = database();
  try {
    const [row] = await db.select().from(supportCases).where(eq(supportCases.openedByUserId, made.clientId));
    if (!row) throw new Error('No case from the assistant');
    const now = new Date();
    if (row.liveRequestedAt && !row.liveAgentUserId) {
      await db.update(supportCases).set({ liveAgentUserId: 'usr_alex', liveJoinedAt: now }).where(eq(supportCases.id, row.id));
      await db.insert(supportCaseEvents).values({ id: `cev_e2e_join_${Date.now().toString(36)}`, caseId: row.id, kind: 'live', authorUserId: 'usr_alex', partyUserId: made.clientId, meta: { live: 'joined' }, createdAt: new Date(now.getTime() - 1) });
    }
    await db.insert(supportCaseEvents).values({ id: `cev_e2e_${Date.now().toString(36)}`, caseId: row.id, kind: 'message', authorUserId: 'usr_alex', partyUserId: made.clientId, body, createdAt: now });
    await db.update(supportCases).set({ firstResponseAt: now, updatedAt: now }).where(eq(supportCases.id, row.id));
    await db.insert(outboxEvents).values({ id: `evt_e2e_${Date.now().toString(36)}`, type: 'support.replied', aggregateType: 'support_case', aggregateId: row.id, payload: { caseId: row.id, partyUserId: made.clientId, subject: 'Booking' } });
  } finally {
    await pool.end();
  }
}

const chatButton = (page: Page) => page.getByRole('button', { name: /^Messages(, \d+ unread)?$/ });
const chatWindow = (page: Page) => page.getByRole('dialog', { name: 'Messages' });

async function standIn(context: BrowserContext, baseURL: string | undefined) {
  await context.addCookies([{ name: 'tnm_ai_stand_in', value: '1', url: baseURL! }]);
}

test.describe('the chat window (wide screens)', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'app-desktop', 'the window is for wide screens; phones open the Messages page');
  });

  test('the chat button opens the window over the page; a conversation in it stays open from page to page and after a reload', async ({ page }) => {
    test.setTimeout(150_000);
    const made = await unreadConversation();
    try {
      await devSignIn(page, made.email);
      // Messages is the button now, not a tab.
      await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: /^Messages/ })).toHaveCount(0);
      await expect(chatButton(page)).toHaveAccessibleName('Messages, 2 unread');
      await chatButton(page).click();
      const box = chatWindow(page);
      await expect(box).toBeVisible();
      await expect(box.getByRole('link', { name: /TasksNearMe Help/ })).toBeVisible();
      await box.getByRole('list', { name: 'Conversations' }).getByRole('link', { name: /Is the desk box still in the hall\?/ }).click();
      await expect(box.getByRole('log').getByText('Is the desk box still in the hall?')).toBeVisible({ timeout: 30_000 });
      await expect(page).toHaveURL(/\/app$/);

      // Writing in the window: the message shows, and the page behind stays where it was.
      const composer = box.getByRole('textbox', { name: 'Message', exact: true });
      await composer.fill('Yes, it is by the door.');
      await composer.press('Enter');
      await expect(box.getByRole('log').getByText('Yes, it is by the door.')).toBeVisible({ timeout: 30_000 });

      // Another page: the window stays, on the same conversation. A reload brings it back.
      await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Bookings' }).click();
      await expect(page).toHaveURL(/\/app\/bookings$/);
      await expect(box.getByRole('log').getByText('Yes, it is by the door.')).toBeVisible();
      await page.reload();
      await expect(chatWindow(page).getByRole('log').getByText('Yes, it is by the door.')).toBeVisible({ timeout: 30_000 });

      // Esc minimizes to a bar; the bar opens it again; Close goes back to the button, read.
      await chatWindow(page).getByRole('log').focus();
      await page.keyboard.press('Escape');
      const bar = page.getByRole('region', { name: 'Messages, minimized' });
      await expect(bar).toBeVisible();
      await bar.getByRole('button', { name: 'Open messages', exact: true }).click();
      await expect(chatWindow(page)).toBeVisible();
      await chatWindow(page).getByRole('button', { name: 'Close messages' }).click();
      await expect(chatButton(page)).toHaveAccessibleName('Messages', { timeout: 15_000 });
    } finally {
      await removeAll(made);
    }
  });

  test('a link to a conversation opens it in the window instead of leaving the page; Open full page goes to its page', async ({ page }) => {
    test.setTimeout(120_000);
    const made = await unreadConversation();
    try {
      await devSignIn(page, made.email);
      await page.goto('/app/notifications');
      await page.getByRole('link', { name: /Hal H\. sent you a message/ }).first().click();
      await expect(chatWindow(page).getByRole('log').getByText('Is the desk box still in the hall?')).toBeVisible({ timeout: 30_000 });
      await expect(page).toHaveURL(/\/app\/notifications$/);
      await chatWindow(page).getByRole('link', { name: 'Open full page' }).click();
      await expect(page).toHaveURL(new RegExp(`/app/messages/${made.threadId}$`));
      await expect(chatWindow(page)).toHaveCount(0);
      // On Messages' own pages the button steps aside.
      await expect(chatButton(page)).toHaveCount(0);
    } finally {
      await removeAll(made);
    }
  });

  test('TasksNearMe Help: the assistant answers from the help center, one tap connects a person, and their reply arrives live', async ({ page, context, baseURL }) => {
    test.setTimeout(180_000);
    await standIn(context, baseURL);
    const made = await unreadConversation();
    try {
      await devSignIn(page, made.email);
      await chatButton(page).click();
      const box = chatWindow(page);
      await box.getByRole('link', { name: /TasksNearMe Help/ }).click();
      await expect(box.getByText(/Hi Cleo, I'm the TasksNearMe assistant, an AI/)).toBeVisible({ timeout: 30_000 });

      const question = box.getByRole('textbox', { name: 'Your question' });
      await question.fill('When am I charged?');
      await question.press('Enter');
      const log = box.getByRole('log', { name: 'Conversation with TasksNearMe Help' });
      await expect(log.getByRole('link', { name: 'When am I charged?' })).toBeVisible({ timeout: 30_000 });

      await question.fill('My helper never came, I want a refund');
      await question.press('Enter');
      await expect(log.getByText('This needs our support team.')).toBeVisible({ timeout: 30_000 });
      // One tap, no form: the chat goes to support as a live chat (in line, or a reply here when no one is online).
      await log.getByRole('button', { name: 'Talk to a person' }).click();
      // Out of support hours (its days and times in Eastern Time) the same tap leaves the message for support to answer here.
      const waiting = box.getByRole('status').filter({ hasText: /Connecting you to a person from support|No one from support is online right now|Live chat is closed now/ });
      await expect(waiting).toBeVisible({ timeout: 30_000 });
      await expect(log.getByText('My helper never came, I want a refund').first()).toBeVisible();

      // Support replies (as staff's reply does): it shows in the window without a reload, with who joined.
      await supportReplies(made, 'Hi Cleo, this is Alex from support. I paused the payment while I look.');
      await expect(log.getByText('Hi Cleo, this is Alex from support. I paused the payment while I look.')).toBeVisible({ timeout: 45_000 });
      await expect(log.getByText('Alex from support joined the chat.')).toBeVisible();
      await expect(waiting).toHaveCount(0);
    } finally {
      await removeAll(made);
    }
  });
});

test.describe('the chat button on a phone', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'app-mobile', 'phones');
  });

  test('sits above the tab dock and opens Messages, where Help is pinned on top and the assistant answers', async ({ page, context, baseURL }) => {
    test.setTimeout(150_000);
    await standIn(context, baseURL);
    const made = await unreadConversation();
    try {
      await devSignIn(page, made.email);
      const button = page.getByRole('link', { name: 'Messages, 2 unread' });
      await expect(button).toBeVisible();
      const dock = page.getByRole('navigation', { name: 'App navigation' });
      await expect(dock.getByRole('link')).toHaveCount(4);
      const [buttonBox, dockBox] = [await button.boundingBox(), await dock.boundingBox()];
      expect(buttonBox!.y + buttonBox!.height).toBeLessThanOrEqual(dockBox!.y + 1);

      await button.click();
      await expect(page).toHaveURL(/\/app\/messages$/);
      await page.getByRole('link', { name: /TasksNearMe Help/ }).click();
      await expect(page).toHaveURL(/\/app\/messages\/help$/);
      await expect(page.getByRole('heading', { name: 'TasksNearMe Help', level: 1 })).toBeVisible();
      const question = page.getByRole('textbox', { name: 'Your question' });
      await question.fill('Who can see my address?');
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      await expect(page.getByRole('log').getByRole('link', { name: 'Who sees my address?' })).toBeVisible({ timeout: 30_000 });

      // A page whose own bar owns the bottom of the screen has no chat button.
      await page.goto('/app/tasks/new');
      await expect(page.getByRole('link', { name: /^Messages/ })).toHaveCount(0);
    } finally {
      await removeAll(made);
    }
  });
});
