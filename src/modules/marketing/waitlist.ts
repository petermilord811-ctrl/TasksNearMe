import type { WaitlistInterest } from '@/contracts';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { waitlistEntries } from './schema';

/**
 * Adds a waitlist entry, one per email. Joining again keeps the first answer: the form needs no sign-in, so
 * anyone could otherwise change someone else's ZIP and interest. The answer is "submitted" either way, so the
 * form never tells whether an email is on the list.
 */
export async function joinWaitlist(
  db: Db,
  entry: { email: string; zip: string; interest: WaitlistInterest },
  now: Date = new Date(),
): Promise<void> {
  await db
    .insert(waitlistEntries)
    .values({ id: newId('wl'), email: entry.email, zip: entry.zip, interest: entry.interest, createdAt: now, updatedAt: now })
    .onConflictDoNothing({ target: waitlistEntries.email });
}
