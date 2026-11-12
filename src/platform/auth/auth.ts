import 'server-only';
import { db } from '@/platform/db/client';
import { createAuth, type Auth } from './config';

/**
 * The app's Better Auth instance (one per process). Development keeps it across Fast Refresh, but builds a
 * new one when the config changed (a re-run `config.ts` brings a new `createAuth`), so a config edit applies
 * without restarting the server.
 */
const globalForAuth = globalThis as unknown as { tnmAuth?: { auth: Auth; factory: typeof createAuth } };

export const auth: Auth = globalForAuth.tnmAuth?.factory === createAuth ? globalForAuth.tnmAuth.auth : createAuth(db);

if (process.env.NODE_ENV !== 'production') globalForAuth.tnmAuth = { auth, factory: createAuth };
