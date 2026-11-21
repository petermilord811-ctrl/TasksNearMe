import { z } from 'zod';
import type { ActionHandler, QueryHandler } from './actions';
import { requestKeyField } from './forms';
import type { ISODateTime, Photo } from './common';
import type { PersonSummary, PresenceState } from './people';
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
      /** Links and payment or social usernames too, until the booking (abuse rehearsal J-AB1, J-AB2). */
      detail: 'phone' | 'email' | 'link' | 'handle';
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

/** Reactions on a message (completion plan 7.3): a small set, like a team chat. */
export const MESSAGE_REACTIONS = ['thumbs_up', 'heart', 'laugh', 'check'] as const;
export type MessageReaction = (typeof MESSAGE_REACTIONS)[number];

/** A person's saved reply: `{first_name}` and `{task}` are filled in when it's used (completion plan 7.3). */
export interface MessageSavedReply {
  id: string;
  title: string;
  body: string;
}

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
  /** A reply to an earlier message: who wrote it and its first words, masked as the original is (7.3). */
  replyTo?: { id: string; sender: 'me' | 'them'; segments: MessageSegment[] };
  /** Reactions: each emoji with its count and whether the viewer gave it (7.3). */
  reactions?: { emoji: MessageReaction; count: number; mine: boolean }[];
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

/** `/app/messages`: threads with unread messages first, then the latest activity first (audit M33). */
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

/**
 * Why a `closed` conversation closed (audit L13), so the page can say so and point the way on: the offer expired,
 * was declined or withdrawn, or ended otherwise (its booking was canceled); the task was canceled with no offer
 * chosen, which declines the offers still open (sweep D9: not "chose another offer"); the booking was canceled or
 * completed a while ago; the regular visits ended.
 */
export const COMPOSER_CLOSED_REASONS = ['offer_expired', 'offer_declined', 'offer_withdrawn', 'offer_ended', 'task_canceled', 'booking_canceled', 'booking_completed', 'series_ended'] as const;
export type ComposerClosedReason = (typeof COMPOSER_CLOSED_REASONS)[number];

export interface ComposerRules {
  canSend: boolean;
  disabledReason?: ComposerDisabledReason;
  /** With `disabledReason: 'closed'`: why. */
  closedReason?: ComposerClosedReason;
  maxLength: number;
  maxAttachments: number;
  maxPhotoMegabytes: number;
}

/**
 * `/app/messages/[threadId]`: one conversation, oldest first. Its latest 100 messages, or after "Load earlier messages"
 * everything from `earlier.from` on (up to the latest 1,000).
 */
export interface ThreadPageData {
  thread: ThreadSummary;
  messages: MessageView[];
  /**
   * There are earlier messages (sweep MN11): "Load earlier messages" opens `routes.app.thread(thread.id, earlier)`, the
   * same conversation from 100 messages before the first one shown.
   */
  earlier?: { from: string };
  composer: ComposerRules;
  /**
   * The other person's activity (completion plan 7.1), coarse on purpose: "Active now" or "Active today".
   * Absent when they turned "Show when I'm active" off, when the viewer did (it's mutual), when they're blocked,
   * or when they haven't been around today.
   */
  presence?: PresenceState;
  /** The viewer's latest message, when the other person has read up to it ("Seen"). Mutual, like `presence`. */
  seenMessageId?: string;
  /** The first message the viewer hadn't read before opening the conversation: "New messages" goes above it (7.3). */
  firstUnreadId?: string;
  /** The viewer's saved replies, for the composer (7.3). */
  savedReplies?: MessageSavedReply[];
}

export const sendMessageInputSchema = z
  .object({
    body: z.string('required').trim().max(2000, 'too_long'),
    attachmentIds: z.array(z.string().min(1)).max(4, 'too_long'),
    /** A reply to an earlier message in the same conversation (7.3). */
    replyToId: z.string().min(1).max(80).optional(),
    /** The composer's key for this message (bad connections pass, J-N1): a repeat is the same message, not a second. */
    requestKey: requestKeyField.optional(),
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
  /**
   * The viewer is typing (completion plan 7.1). Call it as they type; the app spaces the notices out (one every
   * 2.5 s) and the other person sees "typing…" for a few seconds. Fire and forget: it never fails visibly.
   */
  onTyping?: () => Promise<void>;
  /** A reaction on a message (7.3): ok `updated`. Errors: `not_allowed` (not in the conversation, or blocked). */
  onReact?: ActionHandler<{ messageId: string; emoji: MessageReaction; on: boolean }>;
  /** Save the composer's text as a saved reply: ok `saved`. Errors: `validation_failed`, `limit_reached` (20). */
  onSaveReply?: ActionHandler<MessageSavedReplyInput>;
  onDeleteReply?: ActionHandler<{ id: string }>;
}

export const MESSAGE_SAVED_REPLY_MAX = 20;
export const messageSavedReplyInputSchema = z.object({
  title: z.string('required').trim().min(1, 'required').max(40, 'too_long'),
  body: z.string('required').trim().min(1, 'required').max(1000, 'too_long'),
});
export type MessageSavedReplyInput = z.input<typeof messageSavedReplyInputSchema>;
