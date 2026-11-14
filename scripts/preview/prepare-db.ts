/**
 * Preview deploys (deploy/preview/README.md): brings the preview database up to this release. It applies
 * db/migrations, then adds the sample data (db/seeds) when the database has nobody in it yet, so a fresh
 * preview has tasks and helpers to click through. An existing preview database keeps its data, except the
 * demo marketplace (db/seeds/demo), which every deploy writes again with today's dates.
 *
 * scripts/preview/bundle.sh bundles this into one file (prepare-db.cjs), and deploy/preview/deploy.sh runs it
 * from the release folder with DATABASE_URL and FIELD_ENCRYPTION_KEY set, so the VPS needs no dev tools.
 */
import { sql } from 'drizzle-orm';
import { migrateDatabase } from '../../db/scripts/lib';
import { seedDatabase } from '../../db/seeds/seed';
import { seedDemoData } from '../../db/seeds/demo/write';
import { createDb } from '../../src/platform/db/connect';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set.');

  await migrateDatabase(url);
  console.log('migrations applied');

  const { db, pool } = createDb(url, { max: 1 });
  let people = 0;
  try {
    const result = await db.execute<{ n: number }>(sql`select count(*)::int as n from users`);
    people = Number(result.rows[0]?.n ?? 0);
  } finally {
    await pool.end();
  }
  if (people > 0) {
    console.log(`${people} people in the database: sample data left as it is`);
  } else {
    await seedDatabase(url);
    console.log('sample data added (the database was empty)');
  }

  // The demo marketplace (db/seeds/demo), moved up to today on every deploy so the preview always has open work,
  // recent bookings and reviews. It's one transaction; if it fails, the release still goes out.
  try {
    const written = await seedDemoData(url);
    console.log(`demo marketplace refreshed: ${written.markets} markets, ${written.people} people, ${written.tasks} tasks, ${written.offers} offers, ${written.bookings} bookings`);
  } catch (error) {
    console.error('demo marketplace not refreshed (the release goes out anyway):', error);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
