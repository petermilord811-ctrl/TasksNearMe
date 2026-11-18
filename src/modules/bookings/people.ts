import { eq } from 'drizzle-orm';
import type { ClientSummary } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { profilePhotoOf } from '@/modules/files/photos';
import { initialsOf } from '@/modules/profiles/queries';
import type { Db } from '@/platform/db/connect';

/** A client as helpers see them on bookings, proposals and regular visits (name, initials, photo, member since). */
export async function clientSummary(db: Db, userId: string): Promise<ClientSummary | null> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;
  return {
    id: user.id,
    displayName: user.name,
    initials: initialsOf(user.firstName, user.lastName),
    ...profilePhotoOf(user),
    memberSince: user.createdAt.toISOString(),
    phoneVerified: user.phoneVerifiedAt !== null,
  };
}
