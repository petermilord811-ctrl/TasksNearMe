import { z } from 'zod';
import type { ActionHandler, FieldErrorCode } from './actions';
import type { ISODateTime } from './common';
import type { MessageSegment } from './messaging';

// ---- Thank-you notes (2026-11-24, owner's list: "implement others all one by one") ---------------------------------
//
// After a booking completes, its client may send the helper a short note: from the booking's conversation (a card above
// the message box) and from the booking page. It shows in the conversation as a card; the helper may show it on their
// public profile ("Show on my profile", revocable). Separate from reviews and ratings: it never affects rewards, Sparks
// or ranking, and nothing rewards writing one (blueprint 05, principle 6).

const code = (value: FieldErrorCode) => value;

/** The longest note, in characters. */
export const THANK_YOU_NOTE_MAX = 280;
/** How long the client may edit a note after sending it (deleting works at any time). */
export const THANK_YOU_EDIT_HOURS = 24;
/** Notes shown on a helper's profile: the newest this many. */
export const THANK_YOU_PROFILE_MAX = 6;

export const thankYouNoteInputSchema = z.object({
  bookingId: z.string(code('required')).trim().min(1, code('required')).max(80, code('invalid')),
  body: z.string(code('required')).trim().min(1, code('required')).max(THANK_YOU_NOTE_MAX, code('too_long')),
  /** "Don't show my name": a note shown on the profile reads "A client in {area}". */
  hideName: z.boolean(code('invalid')).optional(),
});
export type ThankYouNoteInput = z.input<typeof thankYouNoteInputSchema>;

/** A booking's note, as one of its two people sees it. */
export interface ThankYouNoteView {
  id: string;
  bookingId: string;
  /** The client wrote it; the helper got it. */
  viewerRole: 'client' | 'helper';
  /**
   * The note: its author reads it as written, the helper with contact details masked (render with `MaskedText`). Empty
   * for the helper once our team hid it (`hidden`).
   */
  segments: MessageSegment[];
  /** The client's own text, for the edit form while it can still change (`editableUntil`). */
  draft?: string;
  createdAt: ISODateTime;
  /** The client may edit it until this time (24 h after sending); absent once they can't. Deleting works at any time. */
  editableUntil?: ISODateTime;
  /** The client chose "Don't show my name". */
  nameHidden: boolean;
  /** The helper shows it on their public profile. */
  shownOnProfile: boolean;
  /** Our team hid it after a report: not on the profile, and the helper can't show it. */
  hidden?: true;
  /** The helper may report it (`routes.app.report('thanks', id)`, a dialog over the page). */
  reportable?: true;
}

/** The note of a completed booking, for the booking page and the booking's conversation. */
export interface ThanksPanel {
  bookingId: string;
  viewerRole: 'client' | 'helper';
  /** Sent (absent until then, and after the client deleted it). */
  note?: ThankYouNoteView;
  /** The client may write one now: the booking is completed and has no note. */
  canWrite: boolean;
}

/** A note the helper shows on their profile, newest first (at most `THANK_YOU_PROFILE_MAX`). */
export interface PublicThankYouNote {
  id: string;
  /** With contact details masked. */
  text: string;
  /** The client's first name; absent when they chose not to show it ("A client in {area}"). */
  firstName?: string;
  /** The booking's neighborhood ("Hyde Park"), never an address; absent for a remote task. */
  area?: string;
  createdAt: ISODateTime;
}

/**
 * - `onSave`: write the note (ok `sent`) or edit it within 24 hours (ok `saved`; new words take it off the helper's
 *   profile until they show it again). Errors: `validation_failed` (`body`: `required`, `too_long`), `not_allowed` (not
 *   the booking's client, not completed, past the 24 hours, a block either way, or the helper's account is deleted),
 *   `rate_limited` (with `retryAt`: three new notes a booking in 30 days), `not_found`.
 * - `onDelete`: the client deletes it, at any time (it leaves the profile too): ok `updated`. Errors: `not_found`.
 * - `onShowOnProfile`: the helper's consent, revocable: ok `updated`. Errors: `not_allowed` (our team hid it), `not_found`.
 * - `onHideName`: the client's "Don't show my name", at any time: ok `updated`. Errors: `not_found`.
 */
export interface ThankYouHandlers {
  onSave: ActionHandler<ThankYouNoteInput>;
  onDelete: ActionHandler<{ noteId: string }>;
  onShowOnProfile: ActionHandler<{ noteId: string; shown: boolean }>;
  onHideName: ActionHandler<{ noteId: string; hidden: boolean }>;
}

/** A reported note on its case (staff tools): as written, with what staff can do. */
export interface AdminCaseThanks {
  note: { id: string; body: string; author: { displayName: string }; helper: { displayName: string }; createdAt: ISODateTime; nameHidden: boolean };
  /** On the helper's profile, not shown there, or hidden by our team. */
  status: 'shown' | 'not_shown' | 'hidden';
  /** Why staff hid it (staff only). */
  hiddenReason?: string;
  /** Hide it, or show it again: support leads, trust & safety and admins (audited, and noted on the case). */
  canModerate: boolean;
}
