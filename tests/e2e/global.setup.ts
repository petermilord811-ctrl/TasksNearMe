import { test as setup } from '@playwright/test';
import { inArray, like } from 'drizzle-orm';
import { seedDatabase } from '../../db/seeds/seed';
import { offers } from '../../src/modules/offers/schema';
import { taskLocations, tasks } from '../../src/modules/tasks/schema';
import { createDb } from '../../src/platform/db/connect';

/**
 * Before the app e2e projects run:
 * - removes tasks that earlier posting runs created (their titles start with "Assemble a bookshelf (app-"),
 *   so lists of recent tasks don't fill up with test data;
 * - resets the seeded data (open tasks, offers, people), so tests that decline offers or cancel tasks
 *   can run again. The seed is idempotent; new accounts created by tests are left alone.
 */
setup('reset seeded data', async () => {
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
  } finally {
    await pool.end();
  }

  await seedDatabase(url);
});
