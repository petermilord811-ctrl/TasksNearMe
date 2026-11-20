import { expect, test, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { users } from '../../src/modules/accounts/schema';
import { messages, threadParticipants, threads } from '../../src/modules/messaging/schema';
import { notifications } from '../../src/modules/notifications/schema';
import { offers } from '../../src/modules/offers/schema';
import { tasks } from '../../src/modules/tasks/schema';
import { createDb } from '../../src/platform/db/connect';
import { devSignIn } from './support/sign-in';

/**
 * The Messages and bell badges after reading (sweep MN6). The counts come from the signed-in shell, which stays mounted
 * from page to page, so reading a conversation has to update them itself, on the device in hand and on the person's
 * other ones. A client made for this test (a copy of Chris) has two unread messages from Jordan about her own task and
 * their notification, so her counts are hers alone.
 */

async function unreadConversation(): Promise<{ email: string; threadId: string }> {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // Environment provided by the shell (CI).
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set (see .env.example).');
  const { db, pool } = createDb(url, { max: 1 });
  try {
    const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const userId = `usr_e2e_badges_${run}`;
    const email = `e2e-badges-${run}@example.test`;
    const [chris] = await db.select().from(users).where(eq(users.id, 'usr_chris'));
    const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
    const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_jordan'));
    if (!chris || !desk || !offer) throw new Error('The seeded people or the desk are missing');
    await db.insert(users).values({ ...chris, id: userId, email, name: 'Bea B.', firstName: 'Bea', lastName: 'Baker', phone: null, phoneVerifiedAt: null });
    // Task ids starting with tsk_e2e_ go with the next seed, with everything on them.
    const taskId = `tsk_e2e_badges_${run}`;
    await db.insert(tasks).values({ ...desk, id: taskId, slug: `e2e-badges-${run}`, posterUserId: userId, status: 'open', offerCount: 1, version: 1 });
    const offerId = `off_e2e_badges_${run}`;
    await db.insert(offers).values({ ...offer, id: offerId, taskId, status: 'pending', revision: 1, expiresAt: new Date(Date.now() + 2 * 86_400_000) });
    const threadId = `thr_e2e_badges_${run}`;
    const now = Date.now();
    await db.insert(threads).values({ id: threadId, kind: 'offer', linkedId: offerId, taskId, createdAt: new Date(now - 10 * 60_000), lastMessageAt: new Date(now - 60_000) });
    await db.insert(threadParticipants).values([
      { threadId, userId },
      { threadId, userId: 'usr_jordan', lastReadAt: new Date(now) },
    ]);
    await db.insert(messages).values([
      { id: `msg_e2e_badges_${run}_1`, threadId, senderUserId: 'usr_jordan', kind: 'text', body: 'I can bring a drill.', createdAt: new Date(now - 2 * 60_000) },
      { id: `msg_e2e_badges_${run}_2`, threadId, senderUserId: 'usr_jordan', kind: 'text', body: 'Is the box still in the hall?', createdAt: new Date(now - 60_000) },
    ]);
    await db.insert(notifications).values({ id: `ntf_e2e_badges_${run}`, userId, type: 'message_received', title: desk.title, actorName: 'Jordan T.', target: { kind: 'thread', threadId }, sourceEventId: `e2e:badges:${run}`, createdAt: new Date(now - 60_000) });
    return { email, threadId };
  } finally {
    await pool.end();
  }
}

const messagesLink = (page: Page) => page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: /^Messages/ });
const bell = (page: Page) => page.getByRole('banner').getByRole('link', { name: /^Notifications/ });

test('reading a conversation clears its Messages and bell badges at once, on each of the person’s devices (sweep MN6)', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'app-desktop', 'two devices of one person; the rail shows both badges on wide screens');
  test.setTimeout(150_000);
  const { email } = await unreadConversation();
  const laptopContext = await browser.newContext();
  const phoneContext = await browser.newContext();
  try {
    const laptop = await laptopContext.newPage();
    const phone = await phoneContext.newPage();
    await devSignIn(laptop, email);
    await devSignIn(phone, email);
    for (const page of [laptop, phone]) {
      await expect(messagesLink(page)).toHaveAccessibleName('Messages 2 unread messages');
      await expect(bell(page)).toHaveAccessibleName('Notifications, 1 unread notification');
    }

    // On the laptop: Messages, then the conversation, page to page (the shell stays mounted between them).
    await messagesLink(laptop).click();
    await expect(laptop).toHaveURL(/\/app\/messages$/);
    // By its role: the page before keeps a hidden copy (Next keeps it in an Activity), so a plain href match can pick that.
    await laptop.getByRole('list', { name: 'Conversations' }).getByRole('link', { name: /Is the box still in the hall\?/ }).click();
    await expect(laptop.getByRole('log').getByText('Is the box still in the hall?')).toBeVisible({ timeout: 30_000 });

    // Both badges clear, there and on the phone, without anyone reloading.
    for (const page of [laptop, phone]) {
      await expect(messagesLink(page)).toHaveAccessibleName('Messages', { timeout: 15_000 });
      await expect(bell(page)).toHaveAccessibleName('Notifications', { timeout: 15_000 });
    }
  } finally {
    await laptopContext.close();
    await phoneContext.close();
  }
});
