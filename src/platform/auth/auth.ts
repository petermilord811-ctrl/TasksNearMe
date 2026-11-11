import 'server-only';
import { db } from '@/platform/db/client';
import { createAuth, type Auth } from './config';

/** The app's Better Auth instance (one per process). */
const globalForAuth = globalThis as unknown as { tnmAuth?: Auth };

export const auth: Auth = globalForAuth.tnmAuth ?? createAuth(db);

if (process.env.NODE_ENV !== 'production') globalForAuth.tnmAuth = auth;
