import { expect, test, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { users } from '../../src/modules/accounts/schema';
import { messages, threadParticipants, threads } from '../../src/modules/messaging/schema';
import { notificationDeliveries, notifications } from '../../src/modules/notifications/schema';
import { offers } from '../../src/modules/offers/schema';
import { tasks } from '../../src/modules/tasks/schema';
import { createDb } from '../../src/platform/db/connect';
import { devSignIn } from './support/sign-in';

/**
 * The Messages and bell badges after reading (sweep MN6). The counts come from the signed-in shell, which stays mounted
 * from page to page, so reading a conversation has to update them itself, on the device in hand and on the person's
 * other ones. Everything here is made for this test and removed after it: a client (a copy of Chris) with two unread
 * messages from a helper (a copy of Jordan) about her own task (its own title, hidden from the boards) and their
 * notification, so her counts are hers alone and nothing lands on a public board or in a seeded person's lists.
 */

interface Made {
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
    const clientId = `usr_e2e_badges_${run}`;
    const helperId = `usr_e2e_badges_helper_${run}`;
    const email = `e2e-badges-${run}@example.test`;
    const [chris] = await db.select().from(users).where(eq(users.id, 'usr_chris'));
    const [jordan] = await db.select().from(users).where(eq(users.id, 'usr_jordan'));
    const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
    const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_jordan'));
    if (!chris || !jordan || !desk || !offer) throw new Error('The seeded people or the desk are missing');
    await db.insert(users).values([
      { ...chris, id: clientId, email, name: 'Bea B.', firstName: 'Bea', lastName: 'Baker', phone: null, phoneVerifiedAt: null },
      { ...jordan, id: helperId, email: `e2e-badges-helper-${run}@example.test`, name: 'Jay J.', firstName: 'Jay', lastName: 'Jones', phone: null, phoneVerifiedAt: null },
    ]);
    const taskId = `tsk_e2e_badges_${run}`;
    const title = `Badge check (e2e ${run})`;
    await db.insert(tasks).values({
      ...desk,
      id: taskId,
      slug: `e2e-badges-${run}`,
      title,
      posterUserId: clientId,
      status: 'open',
      offerCount: 1,
      version: 1,
      // Off every board while it exists: other specs read the boards by title.
      hiddenAt: new Date(),
      hiddenReason: 'e2e: a conversation’s task',
    });
    const offerId = `off_e2e_badges_${run}`;
    await db.insert(offers).values({ ...offer, id: offerId, taskId, helperUserId: helperId, status: 'pending', revision: 1, expiresAt: new Date(Date.now() + 2 * 86_400_000) });
    const threadId = `thr_e2e_badges_${run}`;
    const now = Date.now();
    await db.insert(threads).values({ id: threadId, kind: 'offer', linkedId: offerId, taskId, createdAt: new Date(now - 10 * 60_000), lastMessageAt: new Date(now - 60_000) });
    await db.insert(threadParticipants).values([
      { threadId, userId: clientId },
      { threadId, userId: helperId, lastReadAt: new Date(now) },
    ]);
    await db.insert(messages).values([
      { id: `msg_e2e_badges_${run}_1`, threadId, senderUserId: helperId, kind: 'text', body: 'I can bring a drill.', createdAt: new Date(now - 2 * 60_000) },
      { id: `msg_e2e_badges_${run}_2`, threadId, senderUserId: helperId, kind: 'text', body: 'Is the box still in the hall?', createdAt: new Date(now - 60_000) },
    ]);
    const notificationId = `ntf_e2e_badges_${run}`;
    await db.insert(notifications).values({ id: notificationId, userId: clientId, type: 'message_received', title, actorName: 'Jay J.', target: { kind: 'thread', threadId }, sourceEventId: `e2e:badges:${run}`, createdAt: new Date(now - 60_000) });
    return { email, threadId, taskId, offerId, notificationId };
  } finally {
    await pool.end();
  }
}

/** Takes the conversation, its notification, the offer and the task away again (the two people stay, on no list). */
async function removeConversation(made: Made): Promise<void> {
  const { db, pool } = database();
  try {
    await db.delete(notificationDeliveries).where(eq(notificationDeliveries.notificationId, made.notificationId));
    await db.delete(notifications).where(eq(notifications.id, made.notificationId));
    await db.delete(messages).where(eq(messages.threadId, made.threadId));
    await db.delete(threadParticipants).where(eq(threadParticipants.threadId, made.threadId));
    await db.delete(threads).where(eq(threads.id, made.threadId));
    await db.delete(offers).where(eq(offers.id, made.offerId));
    await db.delete(tasks).where(eq(tasks.id, made.taskId));
  } finally {
    await pool.end();
  }
}

// Messages is the chat button since 2026-11-22: its name carries the unread count.
const chatButton = (page: Page) => page.getByRole('button', { name: /^Messages(, \d+ unread)?$/ });
const bell = (page: Page) => page.getByRole('banner').getByRole('link', { name: /^Notifications/ });

test('reading a conversation clears its Messages and bell badges at once, on each of the person’s devices (sweep MN6)', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'two devices of one person; both badges show on wide screens');
  test.setTimeout(150_000);
  const made = await unreadConversation();
  const laptopContext = await browser.newContext();
  const phoneContext = await browser.newContext();
  try {
    const laptop = await laptopContext.newPage();
    const phone = await phoneContext.newPage();
    await devSignIn(laptop, made.email);
    await devSignIn(phone, made.email);
    for (const page of [laptop, phone]) {
      await expect(chatButton(page)).toHaveAccessibleName('Messages, 2 unread');
      await expect(bell(page)).toHaveAccessibleName('Notifications, 1 unread notification');
    }

    // On the laptop: the Messages page, then the conversation, page to page (the shell stays mounted between them).
    await laptop.goto('/app/messages');
    // By its role: the page before keeps a hidden copy (Next keeps it in an Activity), so a plain href match can pick that.
    await laptop.getByRole('list', { name: 'Conversations' }).getByRole('link', { name: /Is the box still in the hall\?/ }).click();
    await expect(laptop.getByRole('log').getByText('Is the box still in the hall?')).toBeVisible({ timeout: 30_000 });

    // Both badges clear, on the phone without anyone reloading, and on the laptop once it leaves Messages (the chat
    // button steps aside on Messages' own pages).
    await expect(chatButton(phone)).toHaveAccessibleName('Messages', { timeout: 15_000 });
    await expect(bell(phone)).toHaveAccessibleName('Notifications', { timeout: 15_000 });
    await expect(bell(laptop)).toHaveAccessibleName('Notifications', { timeout: 15_000 });
    await laptop.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Home' }).click();
    await expect(chatButton(laptop)).toHaveAccessibleName('Messages', { timeout: 15_000 });
  } finally {
    await laptopContext.close();
    await phoneContext.close();
    await removeConversation(made);
  }
});
