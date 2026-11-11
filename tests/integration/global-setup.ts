import { loadEnv, resetDatabase } from '../../db/scripts/lib';

/** Resets the test database (migrations + seed) once per `npm run test:db`. */
export default async function setup(): Promise<void> {
  loadEnv();
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is not set (see .env.example).');
  await resetDatabase(url);
}
