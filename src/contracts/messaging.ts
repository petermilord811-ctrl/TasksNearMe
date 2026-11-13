import { z } from 'zod';
import type { ActionHandler, QueryHandler } from './actions';
import type { ISODateTime, Photo } from './common';
import type { PersonSummary } from './people';
import type { PhotoUploadResult } from './posting';
import type { TimelineEvent } from './timeline';

/**
 * Message text arrives already split into segments. Contact details are detected and masked by the
 * app before a booking is confirmed; the UI only renders segments (MaskedText) and never re-detects.
 */
export type MessageSegment =
  | { kind: 'text'; text: string }
  | {
      kind: 'masked';
      detail: 'phone' | 'email';
      /** Safe hint the UI may show, e.g. last 4 digits of a phone number ("0134"). */
      hint?: string;
    };

// ---- Threads and messages (UI-014) ---------------------------------------------------------------
// Blueprint 02 J2 step 6 (pre-booking thread), 06 (contact details masked before confirmation),
// 08 §117 (one thread per offer, invite, booking, or case).

/** `series`: one conversation for all the visits of regular visits. */
export const THREAD_KINDS = ['offer', 'invite', 'booking', 'case', 'series'] as const;
export type ThreadKind = (typeof THREAD_KINDS)[number];

/** What a thread is about, so the UI can link to it with the route builders. */
export type ThreadSubject =
  /** The client's view of an offer: `routes.app.offer(taskId, offerId)`. */
  | { kind: 'offer_for_client'; taskId: string; offerId: string }
  /** The helper's view of the task they offered on: `routes.app.findWorkTask(taskId)`. */
  | { kind: 'task_for_helper'; taskId: string }
  /** `routes.app.booking(bookingId)`. */
  | { kind: 'booking'; bookingId: string }
  /** Regular visits: `routes.app.series(seriesId)`. */
  | { kind: 'series'; seriesId: string };

export interface MessageView {
  id: string;
  sender: 'me' | 'them' | 'system';
  /**
   * - `text`: what a person wrote (`segments`, already masked when masking applies);
   * - `status`: a booking update shown in the thread ("Jordan is on the way"), from `event`;
   * - `system`: a notice from the app (`event`), e.g. "Contact details are hidden until you book".
   */
  kind: 'text' | 'status' | 'system';
  segments: MessageSegment[];
  attachments: Photo[];
  /** Status and system messages: the event to word (messages key `timeline.<type>`). */
  event?: Pick<TimelineEvent, 'type' | 'params'>;
  createdAt: ISODateTime;
}

export interface ThreadSummary {
  id: string;
  kind: ThreadKind;
  /** The task's title. */
  title: string;
  otherParty: PersonSummary;
  subject: ThreadSubject;
  /** The latest message: text as segments, status and system lines as their event (word it with `timeline.<type>`). */
  lastMessage?: {
    sender: MessageView['sender'];
    kind: MessageView['kind'];
    preview: MessageSegment[];
    event?: Pick<TimelineEvent, 'type' | 'params'>;
    createdAt: ISODateTime;
  };
  unreadCount: number;
  /** Contact details are hidden until a booking is confirmed (blueprint 06). */
  contactMasking: boolean;
}

/** `/app/messages`: threads with the latest activity first. */
export interface InboxPageData {
  threads: ThreadSummary[];
}

/** Why the viewer can't send in a thread. */
export const COMPOSER_DISABLED_REASONS = [
  /** One of the two people blocked the other. */
  'blocked',
  /** The offer or booking is over (declined, withdrawn, expired, canceled, or completed long ago). */
  'closed',
] as const;
export type ComposerDisabledReason = (typeof COMPOSER_DISABLED_REASONS)[number];

export interface ComposerRules {
  canSend: boolean;
  disabledReason?: ComposerDisabledReason;
  maxLength: number;
  maxAttachments: number;
  maxPhotoMegabytes: number;
}

/** `/app/messages/[threadId]`: one conversation (the latest 100 messages, oldest first). */
export interface ThreadPageData {
  thread: ThreadSummary;
  messages: MessageView[];
  composer: ComposerRules;
}

export const sendMessageInputSchema = z
  .object({
    body: z.string('required').trim().max(2000, 'too_long'),
    attachmentIds: z.array(z.string().min(1)).max(4, 'too_long'),
  })
  .refine((input) => input.body.length > 0 || input.attachmentIds.length > 0, { path: ['body'], message: 'required' });
export type SendMessageInput = z.input<typeof sendMessageInputSchema>;

/**
 * Handlers on the conversation page.
 * - `onSend`: ok `sent` (the page refreshes with the new message). Contact details aren't refused; the app
 *   masks them before a booking is confirmed. Errors: `validation_failed` (`body`, `attachmentIds`),
 *   `not_allowed` (blocked or closed: reload), `rate_limited` (with `retryAt`), `unknown`.
 * - `onUploadPhoto`: a photo to attach (re-encoded; location data removed).
 */
export interface ThreadHandlers {
  onSend: ActionHandler<SendMessageInput>;
  onUploadPhoto: QueryHandler<FormData, PhotoUploadResult>;
}
