import { and, desc, eq, inArray } from 'drizzle-orm';
import type { AccountSignInMethods, SocialProvider } from '@/contracts';
import { offeredSocialProviders } from '@/integrations/oauth';
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { accounts, passkeys } from './schema';
import { connectResultFrom, isSocialProvider } from './sign-in/providers';

/**
 * The account page's "Ways to sign in": the email code (always), and Google and Microsoft when offered,
 * each connected or not. `returned` is what Better Auth adds after connecting one: `connect` (the
 * provider, which the action put in the callback address) and `error` (only when it failed).
 */
export async function getSignInMethods(db: Db, user: { id: string; email: string }, returned: { connect?: unknown; error?: unknown } = {}): Promise<AccountSignInMethods> {
  const offered = offeredSocialProviders();
  const rows =
    offered.length > 0
      ? await db
          .select({ providerId: accounts.providerId, createdAt: accounts.createdAt })
          .from(accounts)
          .where(and(eq(accounts.userId, user.id), inArray(accounts.providerId, offered)))
      : [];
  const connectedAt = new Map(rows.map((row) => [row.providerId, row.createdAt]));
  let notice: AccountSignInMethods['notice'];
  if (isSocialProvider(returned.connect) && offered.includes(returned.connect)) {
    const error = typeof returned.error === 'string' ? returned.error : undefined;
    const result = connectResultFrom(error);
    // "Connected" only when it really is (the address alone proves nothing).
    notice = { provider: returned.connect, result: result === 'connected' && !connectedAt.has(returned.connect) ? 'failed' : result };
  }
  const keys = await db.select().from(passkeys).where(eq(passkeys.userId, user.id)).orderBy(desc(passkeys.createdAt));
  return {
    email: user.email,
    providers: offered.map((provider) => {
      const at = connectedAt.get(provider);
      return at ? { provider, connectedAt: at.toISOString() } : { provider };
    }),
    ...(notice ? { notice } : {}),
    passkeys: keys.map((key) => ({ id: key.id, name: key.name ?? '', ...(key.createdAt ? { createdAt: key.createdAt.toISOString() } : {}), backedUp: key.backedUp })),
  };
}

/**
 * Disconnects Google or Microsoft from the account (the email code keeps working). Done here rather than
 * through Better Auth's unlink, which asks for a sign-in within the last day; the action already checked
 * the person's session. Returns false when it wasn't connected.
 */
export async function disconnectSignIn(db: Db, userId: string, provider: SocialProvider): Promise<boolean> {
  return db.transaction(async (tx) => {
    const removed = await tx.delete(accounts).where(and(eq(accounts.userId, userId), eq(accounts.providerId, provider))).returning({ id: accounts.id });
    if (removed.length === 0) return false;
    await tx.insert(auditLog).values({ id: newId('aud'), actorId: userId, actorRole: 'user', action: 'account.sign_in_disconnected', targetType: 'user', targetId: userId, metadata: { provider } });
    return true;
  });
}
