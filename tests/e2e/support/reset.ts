import type { APIRequestContext } from '@playwright/test';
import { eq, inArray, like } from 'drizzle-orm';
import { seedDatabase } from '../../../db/seeds/seed';
import { offers } from '../../../src/modules/offers/schema';
import { taskLocations, tasks } from '../../../src/modules/tasks/schema';
import { helperServices, helperWorkSamples } from '../../../src/modules/profiles/schema';
import { addressVerifications, backgroundChecks, identityVerifications, payoutAccounts } from '../../../src/modules/verification/schema';
import { agreements } from '../../../src/modules/accounts/schema';
import { createDb } from '../../../src/platform/db/connect';

/**
 * Before and after the app e2e projects run (setup and teardown), so the dev server they share never keeps
 * test data on its pages (the landing page lists recent tasks):
 * - removes tasks that earlier posting runs created (their titles start with "Assemble a bookshelf (app-"),
 *   so lists of recent tasks don't fill up with test data;
 * - removes offers on the shelves task, where the helper e2e sends one each run;
 * - resets Priya's onboarding (services, work samples, verification), since e2e onboards her;
 * - resets the seeded data (open tasks, offers, people), so tests that decline offers or cancel tasks
 *   can run again. The seed is idempotent; new accounts created by tests are left alone;
 * - clears the app's cached public pages (`POST /dev/cache`), which would still show the old data.
 */
export async function resetE2eData(request: APIRequestContext): Promise<void> {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // Environment provided by the shell (CI).
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set (see .env.example).');

  const { db, pool } = createDb(url, { max: 1 });
  try {
    const leftovers = await db
      .select({ id: tasks.id, locationId: tasks.locationId })
      .from(tasks)
      .where(like(tasks.title, 'Assemble a bookshelf (app-%'));
    if (leftovers.length > 0) {
      const ids = leftovers.map((task) => task.id);
      const locationIds = leftovers.flatMap((task) => (task.locationId ? [task.locationId] : []));
      await db.transaction(async (tx) => {
        await tx.delete(offers).where(inArray(offers.taskId, ids));
        await tx.delete(tasks).where(inArray(tasks.id, ids));
        if (locationIds.length > 0) await tx.delete(taskLocations).where(inArray(taskLocations.id, locationIds));
      });
    }
    // The helper e2e sends a fresh offer on the shelves task each run.
    await db.delete(offers).where(eq(offers.taskId, 'tsk_shelves'));
    // Priya (a draft helper in the seed) goes through onboarding in e2e: start her from scratch.
    const priya = 'usr_priya';
    await db.transaction(async (tx) => {
      await tx.delete(helperServices).where(eq(helperServices.userId, priya));
      await tx.delete(helperWorkSamples).where(eq(helperWorkSamples.userId, priya));
      await tx.delete(identityVerifications).where(eq(identityVerifications.userId, priya));
      await tx.delete(payoutAccounts).where(eq(payoutAccounts.userId, priya));
      await tx.delete(backgroundChecks).where(eq(backgroundChecks.userId, priya));
      await tx.delete(addressVerifications).where(eq(addressVerifications.userId, priya));
      await tx.delete(agreements).where(eq(agreements.userId, priya));
    });
  } finally {
    await pool.end();
  }

  await seedDatabase(url);

  // The dev server may outlive many runs: drop its cached public pages so they show the reseeded data.
  const cleared = await request.post('/dev/cache');
  if (!cleared.ok()) throw new Error(`Clearing the app cache failed: ${cleared.status()}`);
}
