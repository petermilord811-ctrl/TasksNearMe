/**
 * npm run db:migrate | db:seed | db:reset   (dev database from .env.local)
 */
import { loadEnv, migrateDatabase, resetDatabase } from './lib';
import { seedDatabase } from '../seeds/seed';

loadEnv();
const command = process.argv[2];
const url = process.env.DATABASE_URL ?? '';

const commands: Record<string, () => Promise<void>> = {
  migrate: () => migrateDatabase(url),
  seed: () => seedDatabase(url),
  reset: () => resetDatabase(url),
};

const run = commands[command ?? ''];
if (!run) {
  console.error('Usage: tsx db/scripts/cli.ts <migrate|seed|reset>');
  process.exit(1);
}

run()
  .then(() => console.log(`db:${command} done`))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
