import type { WaitlistInterest } from '@/contracts';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { waitlistEntries } from './schema';

/** Adds or updates a waitlist entry. One row per email; joining again updates the ZIP and interest. */
export async function joinWaitlist(
  db: Db,
  entry: { email: string; zip: string; interest: WaitlistInterest },
  now: Date = new Date(),
): Promise<void> {
  await db
    .insert(waitlistEntries)
    .values({ id: newId('wl'), email: entry.email, zip: entry.zip, interest: entry.interest, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: waitlistEntries.email,
      set: { zip: entry.zip, interest: entry.interest, updatedAt: now },
    });
}
