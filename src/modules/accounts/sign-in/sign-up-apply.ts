import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { after } from 'next/server';
import { createEmailProvider } from '@/integrations/email';
import { signUpInviteFor } from '@/modules/beta/server';
import type { Db } from '@/platform/db/connect';
import { accounts, users } from '../schema';
import { CURRENT_TERMS_VERSION } from '../terms';
import { sendWelcomeEmail } from '../welcome';
import { modeForIntent, signUpIntentApplies } from './sign-up-domain';
import { clearPendingSignUp, readPendingSignUp } from './sign-up-pending';
import { displayNameOf, profileComplete } from './steps';

/**
 * Right after the email code (verifyEmailCode, completion plan 9.6): a new account takes what `/sign-up` gathered for
 * this email, so the profile step doesn't ask again, and the welcome email goes out as it does after that step. The
 * terms count as accepted when the person ticked them on the form. During a private beta the invite comes first: the
 * names and the side of the app go on the account now, and the profile step, prefilled, asks for 18+ and the terms
 * after the invite. An account that had already finished sign-up is left as it is. A code for another email ends what
 * was kept, like any other sign-in (aa's sweep S8).
 */
export async function applyPendingSignUp(db: Db, userId: string, email: string, now: Date): Promise<'applied' | 'named' | 'none'> {
  const pending = await readPendingSignUp();
  if (!pending) return 'none';
  const details = pending.details;
  if (!details || details.email !== email) {
    await clearPendingSignUp();
    return 'none';
  }
  const [user] = await db
    .select({
      firstName: users.firstName,
      lastName: users.lastName,
      adultAttestedAt: users.adultAttestedAt,
      termsAcceptedAt: users.termsAcceptedAt,
      phoneVerifiedAt: users.phoneVerifiedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user || profileComplete(user)) {
    await clearPendingSignUp();
    return 'none';
  }
  const named = {
    firstName: details.firstName,
    lastName: details.lastName,
    name: displayNameOf(details.firstName, details.lastName),
    mode: modeForIntent(pending.intent),
    updatedAt: now,
  };
  if (await signUpInviteFor(db, userId)) {
    await db.update(users).set(named).where(eq(users.id, userId));
    return 'named';
  }
  const agreedAt = new Date(details.agreedAt);
  await db
    .update(users)
    .set({
      ...named,
      adultAttestedAt: sql`coalesce(${users.adultAttestedAt}, ${agreedAt.toISOString()}::timestamptz)`,
      termsAcceptedAt: agreedAt,
      termsVersion: CURRENT_TERMS_VERSION,
    })
    .where(eq(users.id, userId));
  await clearPendingSignUp();
  after(() => sendWelcomeEmail(db, createEmailProvider(db), userId, now).catch((error: unknown) => console.error('[welcome]', error)));
  return 'applied';
}

/**
 * After the profile step (saveProfile): the side of the app the person chose on `/sign-up`, also when they came through
 * Google or Microsoft, but only for the account that flow reached (sign-up-domain.ts `signUpIntentApplies`): the form's
 * email, or an account that linked the provider once its button was pressed. Either way the choice is used up.
 */
export async function applySignUpIntent(db: Db, userId: string, now: Date): Promise<void> {
  const pending = await readPendingSignUp();
  if (!pending) return;
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  const links = pending.via
    ? await db
        .select({ provider: accounts.providerId, createdAt: accounts.createdAt })
        .from(accounts)
        .where(and(eq(accounts.userId, userId), eq(accounts.providerId, pending.via.provider)))
    : [];
  const account = { email: user?.email ?? '', links: links.map((link) => ({ provider: link.provider, linkedAt: link.createdAt.getTime() })) };
  if (user && signUpIntentApplies(pending, account)) {
    await db.update(users).set({ mode: modeForIntent(pending.intent), updatedAt: now }).where(eq(users.id, userId));
  }
  await clearPendingSignUp();
}
