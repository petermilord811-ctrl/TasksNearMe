/**
 * npm run db:migrate | db:seed | db:reset   (dev database from .env.local)
 * npm run db:demo
 *   Adds the demo marketplace (db/seeds/demo: Austin and 14 more markets, ~600 people, 1,200 tasks with offers, bookings and reviews) on top of
 *   the seed, or moves it up to today. The preview does this on every deploy. e2e expects the plain seed, so a
 *   dev database with demo data goes back with db:reset.
 * npm run staff:setup-code -- <email> [--admin] [--reset]
 *   A one-time setup code for a staff member's authenticator app (the first admin has nobody to ask).
 *   --admin makes them an admin first, only while there is none. --reset removes their authenticator first.
 */
import { loadEnv, migrateDatabase, resetDatabase } from './lib';
import { seedDatabase } from '../seeds/seed';
import { seedDemoData } from '../seeds/demo/write';
import { bootstrapSetupCode } from '../../src/modules/accounts/staff-authenticator';
import { createDb } from '../../src/platform/db/connect';

loadEnv();
const command = process.argv[2];
const url = process.env.DATABASE_URL ?? '';

const commands: Record<string, () => Promise<void>> = {
  migrate: () => migrateDatabase(url),
  seed: () => seedDatabase(url),
  reset: () => resetDatabase(url),
  demo: async () => {
    const written = await seedDemoData(url);
    console.log(`demo marketplace: ${written.markets} markets, ${written.people} people, ${written.tasks} tasks, ${written.offers} offers, ${written.bookings} bookings`);
  },
  'staff-setup-code': async () => {
    const args = process.argv.slice(3);
    const email = args.find((arg) => !arg.startsWith('--'));
    const secret = process.env.BETTER_AUTH_SECRET ?? '';
    if (!email || !secret) throw new Error('Usage: npm run staff:setup-code -- <email> [--admin] [--reset] (needs BETTER_AUTH_SECRET)');
    const { db, pool } = createDb(url, { max: 1 });
    try {
      const result = await bootstrapSetupCode({ db, secret }, email, { grantAdmin: args.includes('--admin'), reset: args.includes('--reset') }, new Date());
      if (!result.ok) {
        const why = { no_user: 'No account with that email. They sign up first.', not_staff: 'They have no staff role. Add one first (or --admin for the very first admin).', admin_exists: 'There is already an admin: they can give the code on /admin/staff.', already_set_up: 'Their authenticator is in use. Add --reset if they lost it.' }[result.reason];
        throw new Error(why);
      }
      console.log(`Setup code: ${result.setupCode} (works once, until ${result.expiresAt}). They enter it at /admin/verify.`);
    } finally {
      await pool.end();
    }
  },
};

const run = commands[command ?? ''];
if (!run) {
  console.error('Usage: tsx db/scripts/cli.ts <migrate|seed|reset|demo|staff-setup-code>');
  process.exit(1);
}

run()
  .then(() => console.log(`db:${command} done`))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
