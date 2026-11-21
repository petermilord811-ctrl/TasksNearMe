import { eq } from 'drizzle-orm';
import type { ClientSummary } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { profilePhotoOf } from '@/modules/files/photos';
import { deletedLabelFor, shownPerson } from '@/modules/accounts/shown-name';
import type { Db } from '@/platform/db/connect';

/** A client as helpers see them on bookings, proposals and regular visits (name, initials, photo, member since). */
export async function clientSummary(db: Db, userId: string): Promise<ClientSummary | null> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;
  return {
    id: user.id,
    // A client whose account was deleted shows as the reader's "Deleted account" (J-PR15).
    ...shownPerson(user, await deletedLabelFor([user])),
    ...profilePhotoOf(user),
    memberSince: user.createdAt.toISOString(),
    phoneVerified: user.phoneVerifiedAt !== null,
  };
}
