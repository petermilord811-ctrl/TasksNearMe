import { and, eq } from 'drizzle-orm';
import { thankYouNoteInputSchema, type ActionResult, type ThankYouNoteInput } from '@/contracts';
import { bookings } from '@/modules/bookings/schema';
import { bookingThreadLink, postEvent } from '@/modules/messaging/service';
import { validationFailed } from '@/platform/actions/results';
import type { Db } from '@/platform/db/connect';
import { isUniqueViolation } from '@/platform/db/errors';
import { newId } from '@/platform/db/ids';
import { canEditThanks, canShowOnProfile, canWriteThanks } from './domain';
import { thankYouNotes } from './schema';

/**
 * Thank-you notes (2026-11-24): writing, editing, deleting, the helper's "Show on my profile" and the client's "Don't show
 * my name". Each answers with the helper whose profile may have changed (`helperUserId`), for the caller's cache refresh.
 * Never a reward, a Spark or a ranking signal (blueprint 05, principle 6).
 */

type Result = ActionResult & { helperUserId?: string };

/** The client writes the note (ok `sent`; a `thanks_sent` card in the booking's conversation), or edits it within 24 h (ok `saved`). */
export async function saveThanks(db: Db, userId: string, input: ThankYouNoteInput, now: Date): Promise<Result> {
  const parsed = thankYouNoteInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const [booking] = await db
    .select({ id: bookings.id, status: bookings.status, taskId: bookings.taskId, posterUserId: bookings.posterUserId, helperUserId: bookings.helperUserId, seriesId: bookings.seriesId })
    .from(bookings)
    .where(eq(bookings.id, parsed.data.bookingId))
    .limit(1);
  if (!booking || booking.posterUserId !== userId) return { ok: false, code: 'not_found' };
  const [existing] = await db.select().from(thankYouNotes).where(eq(thankYouNotes.bookingId, booking.id)).limit(1);
  if (existing) {
    if (!canEditThanks(existing, now)) return { ok: false, code: 'not_allowed' };
    await db
      .update(thankYouNotes)
      .set({ body: parsed.data.body, ...(parsed.data.hideName !== undefined ? { hideName: parsed.data.hideName } : {}), updatedAt: now })
      .where(eq(thankYouNotes.id, existing.id));
    return { ok: true, code: 'saved', helperUserId: booking.helperUserId };
  }
  if (!canWriteThanks({ bookingStatus: booking.status, viewerIsClient: true, hasNote: false })) return { ok: false, code: 'not_allowed' };
  const id = newId('tyn');
  try {
    await db.transaction(async (tx) => {
      await tx.insert(thankYouNotes).values({ id, bookingId: booking.id, authorUserId: userId, helperUserId: booking.helperUserId, body: parsed.data.body, hideName: parsed.data.hideName ?? false, createdAt: now, updatedAt: now });
      // Its card in the booking's conversation (the series' for a regular visit); unread for the helper, read for the client.
      await postEvent(tx, bookingThreadLink(booking), 'status', { type: 'thanks_sent', params: { noteId: id } }, now, userId);
    });
  } catch (error) {
    // Two sends at once: the first one wins, and the second is told it can't (one note per booking).
    if (isUniqueViolation(error)) return { ok: false, code: 'not_allowed' };
    throw error;
  }
  return { ok: true, code: 'sent', helperUserId: booking.helperUserId };
}

/** The client deletes the note, at any time: it leaves the conversation's card and the profile. ok `updated`. */
export async function deleteThanks(db: Db, userId: string, noteId: string): Promise<Result> {
  const [gone] = await db
    .delete(thankYouNotes)
    .where(and(eq(thankYouNotes.id, String(noteId)), eq(thankYouNotes.authorUserId, userId)))
    .returning({ helperUserId: thankYouNotes.helperUserId });
  return gone ? { ok: true, code: 'updated', helperUserId: gone.helperUserId } : { ok: false, code: 'not_found' };
}

/** The helper shows the note on their profile, or stops (consent, revocable). ok `updated`; `not_allowed` while hidden by our team. */
export async function setThanksShown(db: Db, userId: string, noteId: string, shown: boolean, now: Date): Promise<Result> {
  const [note] = await db.select().from(thankYouNotes).where(and(eq(thankYouNotes.id, String(noteId)), eq(thankYouNotes.helperUserId, userId))).limit(1);
  if (!note) return { ok: false, code: 'not_found' };
  if (!canShowOnProfile(note, shown)) return { ok: false, code: 'not_allowed' };
  await db.update(thankYouNotes).set({ shownOnProfile: shown, shownAt: shown ? now : null, updatedAt: now }).where(eq(thankYouNotes.id, note.id));
  return { ok: true, code: 'updated', helperUserId: note.helperUserId };
}

/** The client's "Don't show my name", at any time. ok `updated`. */
export async function setThanksNameHidden(db: Db, userId: string, noteId: string, hidden: boolean, now: Date): Promise<Result> {
  const [note] = await db
    .update(thankYouNotes)
    .set({ hideName: hidden, updatedAt: now })
    .where(and(eq(thankYouNotes.id, String(noteId)), eq(thankYouNotes.authorUserId, userId)))
    .returning({ helperUserId: thankYouNotes.helperUserId });
  return note ? { ok: true, code: 'updated', helperUserId: note.helperUserId } : { ok: false, code: 'not_found' };
}
