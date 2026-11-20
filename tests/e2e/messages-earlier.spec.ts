import { expect, test } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { users } from '../../src/modules/accounts/schema';
import { messages, threadParticipants, threads } from '../../src/modules/messaging/schema';
import { offers } from '../../src/modules/offers/schema';
import { tasks } from '../../src/modules/tasks/schema';
import { createDb } from '../../src/platform/db/connect';
import { devSignIn } from './support/sign-in';

/**
 * A long conversation (sweep MN11): it opens at its latest 100 messages, and "Load earlier messages" brings the ones
 * before them in above, without moving the reader. Everything here is made for this test and removed after it: a client
 * (a copy of Chris), a helper (a copy of Jordan), her task (its own title, hidden from the boards) with his offer, and
 * 130 messages. Nothing lands on a public board or in a seeded person's lists.
 */

interface Made {
  email: string;
  threadId: string;
  taskId: string;
  offerId: string;
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

async function longConversation(): Promise<Made> {
  const { db, pool } = database();
  try {
    const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const clientId = `usr_e2e_long_${run}`;
    const helperId = `usr_e2e_long_helper_${run}`;
    const email = `e2e-long-${run}@example.test`;
    const [chris] = await db.select().from(users).where(eq(users.id, 'usr_chris'));
    const [jordan] = await db.select().from(users).where(eq(users.id, 'usr_jordan'));
    const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
    const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_jordan'));
    if (!chris || !jordan || !desk || !offer) throw new Error('The seeded people or the desk are missing');
    await db.insert(users).values([
      { ...chris, id: clientId, email, name: 'Lia L.', firstName: 'Lia', lastName: 'Long', phone: null, phoneVerifiedAt: null },
      { ...jordan, id: helperId, email: `e2e-long-helper-${run}@example.test`, name: 'Hal H.', firstName: 'Hal', lastName: 'Hill', phone: null, phoneVerifiedAt: null },
    ]);
    const taskId = `tsk_e2e_long_${run}`;
    await db.insert(tasks).values({
      ...desk,
      id: taskId,
      slug: `e2e-long-${run}`,
      title: `Long conversation (e2e ${run})`,
      posterUserId: clientId,
      status: 'open',
      offerCount: 1,
      version: 1,
      // Off every board while it exists: other specs read the boards by title.
      hiddenAt: new Date(),
      hiddenReason: 'e2e: a conversation’s task',
    });
    const offerId = `off_e2e_long_${run}`;
    await db.insert(offers).values({ ...offer, id: offerId, taskId, helperUserId: helperId, status: 'pending', revision: 1, expiresAt: new Date(Date.now() + 2 * 86_400_000) });
    const threadId = `thr_e2e_long_${run}`;
    const start = Date.now() - 200 * 60_000;
    await db.insert(threads).values({ id: threadId, kind: 'offer', linkedId: offerId, taskId, createdAt: new Date(start), lastMessageAt: new Date(start + 130 * 60_000) });
    await db.insert(threadParticipants).values([
      { threadId, userId: clientId, lastReadAt: new Date() },
      { threadId, userId: helperId, lastReadAt: new Date() },
    ]);
    await db.insert(messages).values(
      Array.from({ length: 130 }, (_, index) => ({
        id: `msg_e2e_long_${run}_${index + 1}`,
        threadId,
        senderUserId: index % 2 ? clientId : helperId,
        kind: 'text',
        body: index === 0 ? 'The gate code is on the mailbox.' : `Note ${index + 1}`,
        createdAt: new Date(start + (index + 1) * 60_000),
      })),
    );
    return { email, threadId, taskId, offerId };
  } finally {
    await pool.end();
  }
}

/** Takes the conversation, the offer and the task away again (the two people stay, on no list). */
async function removeConversation(made: Made): Promise<void> {
  const { db, pool } = database();
  try {
    await db.delete(messages).where(eq(messages.threadId, made.threadId));
    await db.delete(threadParticipants).where(eq(threadParticipants.threadId, made.threadId));
    await db.delete(threads).where(eq(threads.id, made.threadId));
    await db.delete(offers).where(eq(offers.id, made.offerId));
    await db.delete(tasks).where(eq(tasks.id, made.taskId));
  } finally {
    await pool.end();
  }
}

test('a long conversation loads its earlier messages above, keeping the reader in place (sweep MN11)', async ({ page }) => {
  test.setTimeout(120_000);
  const made = await longConversation();
  try {
    await devSignIn(page, made.email);
    await page.goto(`/app/messages/${made.threadId}`);
    const log = page.getByRole('log');
    await expect(log.getByText('Note 130', { exact: true })).toBeVisible({ timeout: 30_000 });
    // The latest 100: Note 31 is the first; the very first message isn't there yet.
    await expect(log.getByText('Note 31', { exact: true })).toBeAttached();
    await expect(log.getByText('Note 30', { exact: true })).toHaveCount(0);
    await expect(log.getByText('The gate code is on the mailbox.')).toHaveCount(0);

    const earlier = log.getByRole('link', { name: 'Load earlier messages' });
    await earlier.scrollIntoViewIfNeeded();
    const firstShown = log.getByText('Note 31', { exact: true });
    const before = await firstShown.boundingBox();
    await earlier.click();
    await expect(log.getByText('The gate code is on the mailbox.')).toBeAttached({ timeout: 30_000 });
    await expect(page).toHaveURL(new RegExp(`/app/messages/${made.threadId}\\?from=`));
    // All 130 now, and nothing more to load.
    await expect(log.getByRole('link', { name: 'Load earlier messages' })).toHaveCount(0);
    // Where the reader was stays put: the message they were looking at hasn't moved on screen.
    const after = await firstShown.boundingBox();
    expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeLessThan(40);
  } finally {
    await removeConversation(made);
  }
});
