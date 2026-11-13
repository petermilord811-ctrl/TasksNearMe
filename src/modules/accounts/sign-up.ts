import { eq } from 'drizzle-orm';
import type { Db } from '@/platform/db/connect';
import { users } from './schema';
import { profileComplete } from './sign-in/steps';

/**
 * Signed in, but sign-up isn't finished: no name, 18+ check or accepted terms yet (and, during a private
 * beta, possibly an invite to enter first). The app sends such accounts back to `/sign-in`, which shows the
 * step they stopped at, so nobody uses the app without having accepted the terms.
 */
export async function signUpUnfinished(db: Db, userId: string): Promise<boolean> {
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
  return user !== undefined && !profileComplete(user);
}
