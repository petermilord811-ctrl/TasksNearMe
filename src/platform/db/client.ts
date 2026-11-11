import 'server-only';
import { createDb, type Db } from './connect';

/** The app's database client. One pool per process (kept across hot reloads in development). */
const globalForDb = globalThis as unknown as { tnmDb?: Db };

export const db: Db = globalForDb.tnmDb ?? createDb(process.env.DATABASE_URL ?? '').db;

if (process.env.NODE_ENV !== 'production') globalForDb.tnmDb = db;
