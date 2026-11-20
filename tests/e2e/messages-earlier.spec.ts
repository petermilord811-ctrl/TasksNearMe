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
 * before them in above, without moving the reader. A client made for this test (a copy of Chris) and Jordan, with 130
 * messages about her own task.
 */

async function longConversation(): Promise<{ email: string; threadId: string }> {
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
    const userId = `usr_e2e_long_${run}`;
    const email = `e2e-long-${run}@example.test`;
    const [chris] = await db.select().from(users).where(eq(users.id, 'usr_chris'));
    const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
    const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_jordan'));
    if (!chris || !desk || !offer) throw new Error('The seeded people or the desk are missing');
    await db.insert(users).values({ ...chris, id: userId, email, name: 'Lia L.', firstName: 'Lia', lastName: 'Long', phone: null, phoneVerifiedAt: null });
    const taskId = `tsk_e2e_long_${run}`;
    await db.insert(tasks).values({ ...desk, id: taskId, slug: `e2e-long-${run}`, posterUserId: userId, status: 'open', offerCount: 1, version: 1 });
    const offerId = `off_e2e_long_${run}`;
    await db.insert(offers).values({ ...offer, id: offerId, taskId, status: 'pending', revision: 1, expiresAt: new Date(Date.now() + 2 * 86_400_000) });
    const threadId = `thr_e2e_long_${run}`;
    const start = Date.now() - 200 * 60_000;
    await db.insert(threads).values({ id: threadId, kind: 'offer', linkedId: offerId, taskId, createdAt: new Date(start), lastMessageAt: new Date(start + 130 * 60_000) });
    await db.insert(threadParticipants).values([
      { threadId, userId, lastReadAt: new Date() },
      { threadId, userId: 'usr_jordan', lastReadAt: new Date() },
    ]);
    await db.insert(messages).values(
      Array.from({ length: 130 }, (_, index) => ({
        id: `msg_e2e_long_${run}_${index + 1}`,
        threadId,
        senderUserId: index % 2 ? userId : 'usr_jordan',
        kind: 'text',
        body: index === 0 ? 'The gate code is on the mailbox.' : `Note ${index + 1}`,
        createdAt: new Date(start + (index + 1) * 60_000),
      })),
    );
    return { email, threadId };
  } finally {
    await pool.end();
  }
}

test('a long conversation loads its earlier messages above, keeping the reader in place (sweep MN11)', async ({ page }) => {
  test.setTimeout(120_000);
  const { email, threadId } = await longConversation();
  await devSignIn(page, email);
  await page.goto(`/app/messages/${threadId}`);
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
  await expect(page).toHaveURL(new RegExp(`/app/messages/${threadId}\\?from=`));
  // All 130 now, and nothing more to load.
  await expect(log.getByRole('link', { name: 'Load earlier messages' })).toHaveCount(0);
  // Where the reader was stays put: the message they were looking at hasn't moved on screen.
  const after = await firstShown.boundingBox();
  expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeLessThan(40);
});
