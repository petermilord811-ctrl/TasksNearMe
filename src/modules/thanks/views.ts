import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { THANK_YOU_PROFILE_MAX, type PublicThankYouNote, type ThankYouNoteView, type ThanksPanel } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { bookings } from '@/modules/bookings/schema';
import { areas } from '@/modules/markets/schema';
import { tasks } from '@/modules/tasks/schema';
import { maskContactDetails } from '@/modules/trust/contact-masking';
import { toMessageSegments } from '@/modules/trust/message-segments';
import type { Db } from '@/platform/db/connect';
import { rowScopeCondition, type RowScope } from '@/shared/sample-data';
import { canEditThanks, canWriteThanks, publicAuthor, thanksEditableUntil } from './domain';
import { thankYouNotes } from './schema';

/**
 * Thank-you notes as people read them (2026-11-24): the booking's two people (the booking page and its conversation)
 * and the helper's public profile. Read-only, so messaging and profiles can use it without the writes' imports.
 */

type NoteRow = typeof thankYouNotes.$inferSelect;

/**
 * One note for one of its two people (null for anyone else). Its author reads it as written; the helper as the booking's
 * conversation reads (contact details masked until the booking is paid, `confirmed_at`). The profile always masks them.
 */
export function noteViewFor(note: NoteRow, viewerId: string, now: Date, masked = true): ThankYouNoteView | null {
  const viewerRole = note.authorUserId === viewerId ? 'client' : note.helperUserId === viewerId ? 'helper' : null;
  if (!viewerRole) return null;
  const hidden = note.hiddenAt !== null;
  const editable = viewerRole === 'client' && canEditThanks(note, now);
  return {
    id: note.id,
    bookingId: note.bookingId,
    viewerRole,
    segments: viewerRole === 'client' ? toMessageSegments(note.body, { mask: false }) : hidden ? [] : toMessageSegments(note.body, { mask: masked }),
    ...(editable ? { draft: note.body, editableUntil: thanksEditableUntil(note.createdAt).toISOString() } : {}),
    createdAt: note.createdAt.toISOString(),
    nameHidden: note.hideName,
    shownOnProfile: note.shownOnProfile && !hidden,
    ...(hidden ? { hidden: true as const } : {}),
    ...(viewerRole === 'helper' && !hidden ? { reportable: true as const } : {}),
  };
}

/** The cards of a conversation's `thanks_sent` lines, by note id: only the viewer's own bookings' notes. */
export async function thanksCardsFor(db: Db, viewerId: string, noteIds: readonly string[], now: Date): Promise<Record<string, ThankYouNoteView>> {
  if (noteIds.length === 0) return {};
  const rows = await db
    .select({ note: thankYouNotes, confirmedAt: bookings.confirmedAt })
    .from(thankYouNotes)
    .innerJoin(bookings, eq(bookings.id, thankYouNotes.bookingId))
    .where(inArray(thankYouNotes.id, [...new Set(noteIds)]));
  const out: Record<string, ThankYouNoteView> = {};
  for (const { note: row, confirmedAt } of rows) {
    const view = noteViewFor(row, viewerId, now, confirmedAt === null);
    if (view) out[row.id] = view;
  }
  return out;
}

/** A completed booking's note for the booking page and its conversation; null when there's nothing to show or offer. */
export async function thanksPanelFor(db: Db, viewerId: string, booking: { id: string; status: string; posterUserId: string; helperUserId: string; confirmedAt: Date | null }, now: Date): Promise<ThanksPanel | null> {
  const viewerRole = booking.posterUserId === viewerId ? 'client' : booking.helperUserId === viewerId ? 'helper' : null;
  if (!viewerRole || booking.status !== 'completed') return null;
  const [note] = await db.select().from(thankYouNotes).where(eq(thankYouNotes.bookingId, booking.id)).limit(1);
  const view = note ? noteViewFor(note, viewerId, now, booking.confirmedAt === null) : null;
  const canWrite = canWriteThanks({ bookingStatus: booking.status, viewerIsClient: viewerRole === 'client', hasNote: note !== undefined });
  if (!view && !canWrite) return null;
  return { bookingId: booking.id, viewerRole, ...(view ? { note: view } : {}), canWrite };
}

/**
 * "Thank-you notes" on a helper's profile: the ones they chose to show and our team hasn't hidden, newest first (6),
 * masked, with the client's first name and the booking's area, or the area alone. With `rows: 'real'`, none by sample people.
 */
export async function publicThanksOf(db: Db, helperUserId: string, rows: RowScope = 'all'): Promise<PublicThankYouNote[]> {
  const found = await db
    .select({ note: thankYouNotes, firstName: users.firstName, status: users.status, area: areas.name })
    .from(thankYouNotes)
    .innerJoin(users, eq(users.id, thankYouNotes.authorUserId))
    .innerJoin(bookings, eq(bookings.id, thankYouNotes.bookingId))
    .innerJoin(tasks, eq(tasks.id, bookings.taskId))
    .leftJoin(areas, eq(areas.id, tasks.publicAreaId))
    .where(and(eq(thankYouNotes.helperUserId, helperUserId), eq(thankYouNotes.shownOnProfile, true), isNull(thankYouNotes.hiddenAt), rowScopeCondition(rows, thankYouNotes.authorUserId)))
    .orderBy(desc(thankYouNotes.createdAt))
    .limit(THANK_YOU_PROFILE_MAX);
  return found.map(({ note, firstName, status, area }) => {
    const author = publicAuthor(note, { firstName, deleted: status === 'deleted' }, area ?? '');
    return { id: note.id, text: maskContactDetails(note.body).text, ...(author.firstName ? { firstName: author.firstName } : {}), ...(author.area ? { area: author.area } : {}), createdAt: note.createdAt.toISOString() };
  });
}
