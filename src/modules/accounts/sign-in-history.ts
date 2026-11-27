import { inArray, lt } from 'drizzle-orm';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { signInEvents } from './schema';

/**
 * Every sign-in, with the address and browser it came from, kept a year (owner, 2026-11-27: staff see "all detected
 * ips", each with its fraud score). Sessions alone lost the address when the person signed out: an account that signed
 * up with Google and signed out showed no address at all. The privacy policy names this record and its year.
 */

export const SIGN_IN_METHODS = ['email_code', 'phone_code', 'google', 'microsoft', 'passkey', 'other'] as const;
export type SignInMethod = (typeof SIGN_IN_METHODS)[number];

/** Kept this long, then deleted by the retention sweep (privacy/retention.ts). */
export const SIGN_IN_HISTORY_DAYS = 365;
const DAY_MS = 86_400_000;

/** What Better Auth hands `session.create.after` about the request (GenericEndpointContext, loosely). */
export interface SessionHookContext {
  path?: string;
  params?: Record<string, unknown> | null;
}

/** How someone signed in, from the endpoint that made the session (`/callback/:id` with the provider's id, …). */
export function signInMethodOf(ctx: SessionHookContext | null | undefined): SignInMethod {
  const path = ctx?.path ?? '';
  const provider = typeof ctx?.params?.id === 'string' ? ctx.params.id : '';
  if (path.startsWith('/callback') || path.startsWith('/sign-in/social') || path.startsWith('/oauth2/callback')) {
    return provider === 'google' || provider === 'microsoft' ? provider : 'other';
  }
  if (path.includes('email-otp')) return 'email_code';
  if (path.startsWith('/phone-number')) return 'phone_code';
  if (path.startsWith('/passkey')) return 'passkey';
  return 'other';
}

/**
 * `session.create.after`: one row per sign-in. Never fails the sign-in: a row it couldn't write is logged and skipped.
 */
export function createSignInRecorder(db: Db) {
  return async (
    session: { id: string; userId: string; ipAddress?: string | null; userAgent?: string | null; createdAt?: Date },
    ctx: SessionHookContext | null,
  ): Promise<void> => {
    try {
      await db.insert(signInEvents).values({
        id: newId('sie'),
        userId: session.userId,
        sessionId: session.id,
        ip: session.ipAddress?.trim().slice(0, 64) || null,
        userAgent: session.userAgent?.trim().slice(0, 512) || null,
        method: signInMethodOf(ctx),
        createdAt: session.createdAt ?? new Date(),
      });
    } catch (error) {
      console.error('[sign-in-history] not recorded:', error instanceof Error ? error.message : error);
    }
  };
}

/** The retention sweep: sign-ins older than a year go (up to `limit` a run). */
export async function sweepSignInEvents(db: Db, now: Date, limit = 5_000): Promise<number> {
  const cutoff = new Date(now.getTime() - SIGN_IN_HISTORY_DAYS * DAY_MS);
  const due = (await db.select({ id: signInEvents.id }).from(signInEvents).where(lt(signInEvents.createdAt, cutoff)).limit(limit)).map((row) => row.id);
  if (due.length === 0) return 0;
  await db.delete(signInEvents).where(inArray(signInEvents.id, due));
  return due.length;
}
