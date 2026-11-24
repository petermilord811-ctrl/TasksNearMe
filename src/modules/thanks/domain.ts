import { THANK_YOU_EDIT_HOURS } from '@/contracts';

/**
 * Thank-you notes (2026-11-24): the pure rules. A completed booking's client may send its helper one note; they may edit
 * it for 24 hours and delete it at any time; the helper chooses whether it shows on their profile; our team may hide it.
 * Nothing here, or anywhere that reads these notes, touches rewards, Sparks or ranking (blueprint 05, principle 6).
 */

const HOUR = 3_600_000;

/**
 * New notes on one booking (sweep 2026-11-24 A4): one note at a time, but deleting and writing again posted a fresh
 * unread line into the helper's conversation each time. Three new notes a booking in 30 days.
 */
export const THANKS_NEW_NOTES_PER_BOOKING = { limit: 3, windowSeconds: 30 * 86_400 } as const;

/**
 * An edit that changes the words takes the note off the helper's profile until they show it again (sweep 2026-11-24
 * A3): their consent was to the words they read. Changing only "Don't show my name" keeps it shown.
 */
export function shownAfterEdit(note: { body: string; shownOnProfile: boolean; shownAt: Date | null }, body: string): { shownOnProfile: boolean; shownAt: Date | null } {
  return note.body === body ? { shownOnProfile: note.shownOnProfile, shownAt: note.shownAt } : { shownOnProfile: false, shownAt: null };
}

/** Until when the client may edit a note sent at `createdAt`. */
export const thanksEditableUntil = (createdAt: Date) => new Date(createdAt.getTime() + THANK_YOU_EDIT_HOURS * HOUR);

/** The client may write a note: the booking is completed, it's theirs, and it has none. */
export function canWriteThanks(input: { bookingStatus: string; viewerIsClient: boolean; hasNote: boolean }): boolean {
  return input.bookingStatus === 'completed' && input.viewerIsClient && !input.hasNote;
}

/** The client may still change the words: within 24 hours of sending, and not hidden by our team. */
export function canEditThanks(note: { createdAt: Date; hiddenAt: Date | null }, now: Date): boolean {
  return note.hiddenAt === null && now.getTime() < thanksEditableUntil(note.createdAt).getTime();
}

/** On the helper's public profile: they chose to show it, and our team hasn't hidden it. */
export const showsOnProfile = (note: { shownOnProfile: boolean; hiddenAt: Date | null }) => note.shownOnProfile && note.hiddenAt === null;

/** The helper may show it (or stop): not while our team has it hidden. Stopping always works. */
export const canShowOnProfile = (note: { hiddenAt: Date | null }, shown: boolean) => !shown || note.hiddenAt === null;

/** Who a shown note is from: the client's first name and the booking's area, or the area alone ("A client in {area}"). */
export function publicAuthor(note: { hideName: boolean }, author: { firstName: string; deleted: boolean }, area: string): { firstName?: string; area: string } {
  return note.hideName || author.deleted || !author.firstName ? { area } : { firstName: author.firstName, area };
}
