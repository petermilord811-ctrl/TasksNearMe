import { and, eq } from 'drizzle-orm';
import type { ValidateUserInfoResult, ValidateUserInfoSource } from 'better-auth';
import { createEmailProvider } from '@/integrations/email';
import { appUrl } from '@/integrations/oauth';
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { users } from '../schema';
import { noticeSignInAdded, type AddedSignInMethod } from '../sign-in-added';
import { GATE_ERRORS, idTokenClaims, isSocialProvider, providerNames } from './providers';
import { BLOCKED_STATUSES, displayNameOf } from './steps';

/**
 * Better Auth's `user.validateUserInfo`, for Google and Microsoft sign-ins. It runs before one creates an
 * account, joins an existing one, or signs in again:
 * - Creating or joining needs an email the provider confirmed (see `providerEmailConfirmed`). Otherwise
 *   someone could make or take over an account under an address they don't own.
 * - Suspended, banned and closed accounts can't sign in this way either (the email code refuses them too).
 */
export function createProviderGate(db: Db) {
  return async (data: { user: { id?: unknown; emailVerified?: unknown }; source: ValidateUserInfoSource }): Promise<ValidateUserInfoResult | undefined> => {
    if (data.source.method !== 'oauth') return undefined;
    if (data.source.action !== 'sign-in' && data.user.emailVerified !== true) return { error: GATE_ERRORS.emailNotConfirmed };
    if (typeof data.user.id === 'string') {
      const [row] = await db.select({ status: users.status }).from(users).where(eq(users.id, data.user.id)).limit(1);
      if (row && BLOCKED_STATUSES.has(row.status)) return { error: GATE_ERRORS.accountUnavailable };
    }
    return undefined;
  };
}

/**
 * Better Auth's `account.create.before`: while a "Not you?" link holds the account (completion plan 5.23), Google
 * or Microsoft can't be connected to it, from the account page or by signing in with an address it uses. Better
 * Auth then answers `unable_to_link_account`, and signing in with an emailed code still works.
 */
export function createHeldAccountLinkGuard(db: Db) {
  return async (account: { userId: string; providerId: string }): Promise<false | undefined> => {
    if (!isSocialProvider(account.providerId)) return undefined;
    const [row] = await db.select({ held: users.contactHoldAt }).from(users).where(eq(users.id, account.userId)).limit(1);
    return row?.held ? false : undefined;
  };
}

/**
 * Better Auth's `account.create.after` (it runs once the account row is saved): Google or Microsoft was
 * connected to an account. It goes in the audit log, a finished account's email hears about it with a "Not you?"
 * link (sign-in-added.ts, security review SEC15), and when the account has no names yet (a new account), the
 * provider's names prefill the profile step. Names are never overwritten.
 */
export function createProviderConnectedHook(
  db: Db,
  notice: (input: { userId: string; method: AddedSignInMethod }) => Promise<unknown> = (input) =>
    noticeSignInAdded({ db, email: createEmailProvider(db), appUrl: appUrl() }, input, new Date()),
) {
  return async (account: { userId: string; providerId: string; idToken?: string | null }): Promise<void> => {
    if (!isSocialProvider(account.providerId)) return;
    await db.insert(auditLog).values({
      id: newId('aud'),
      actorId: account.userId,
      actorRole: 'user',
      action: 'account.sign_in_connected',
      targetType: 'user',
      targetId: account.userId,
      metadata: { provider: account.providerId },
    });
    await notice({ userId: account.userId, method: { kind: account.providerId === 'google' ? 'google' : 'microsoft' } });
    const claims = idTokenClaims(account.idToken);
    if (!claims) return;
    const { firstName, lastName } = providerNames(claims);
    if (!firstName && !lastName) return;
    await db
      .update(users)
      .set({ firstName, lastName, name: displayNameOf(firstName, lastName) })
      .where(and(eq(users.id, account.userId), eq(users.firstName, ''), eq(users.lastName, '')));
  };
}
