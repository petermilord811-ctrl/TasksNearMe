import { z } from 'zod';
import type { ActionHandler, ActionResult, QueryHandler } from './actions';
import type { HelpSummary } from './assistant';
import type { PlanCode } from './billing';
import type { SparkLevel } from './sparks';
import { requestKeyField } from './forms';
import type { Cents, ISODateTime, Photo } from './common';
import type { AppLocale } from './locale';
import type { PersonSummary, PresenceState } from './people';
import type { PhotoUploadResult } from './posting';
import type { AttachGifInput, GifSearchInput, GifSearchResult } from './gifs';
import type { ReportInput, ReportSubject } from './support';
import type { TimelineEvent } from './timeline';
import type { ProposableChangeType } from './changes';
import type { PricingInput } from './money';
import type { ChangeStatus, InviteStatus } from './status';

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
    }
  | MentionSegment;

/**
 * Someone's TasksNearMe @username in a message (2026-11-23, owner: "plan all and implement"): a person, shown by name
 * ("@Minh T."), never as the handle text, so a payment or social handle that happens to be someone's username doesn't
 * get past the masking. Before, every "@name" read as a social handle and showed "[hidden]" until a paid booking.
 * A helper's opens their profile (`routes.helperProfile(helperHandle)`); anyone else's, a conversation with them
 * (`routes.app.newMessage({ userId })`); the viewer's own (`self`) opens nothing.
 */
export interface MentionSegment {
  kind: 'mention';
  userId: string;
  /** Their shown name ("Minh T."). */
  name: string;
  helperHandle?: string;
  self?: boolean;
}

// ---- Threads and messages (UI-014) ---------------------------------------------------------------
// Blueprint 02 J2 step 6 (pre-booking thread), 06 (contact details masked before confirmation),
// 08 §117 (one thread per offer, invite, booking, or case).

/**
 * `series`: one conversation for all the visits of regular visits. `direct`: two people talking without a task
 * (2026-11-21, owner): started from a helper's profile, a community author's card, or a past conversation's person.
 */
export const THREAD_KINDS = ['offer', 'invite', 'booking', 'case', 'series', 'direct'] as const;
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
  | { kind: 'series'; seriesId: string }
  /**
   * A direct conversation: the other person. A helper links to `routes.helperProfile(helperHandle)`; with
   * `canRequest`, "Send a task request" opens `routes.app.requestHelper(helperHandle)` (a funded direct invite).
   */
  | { kind: 'person'; helperHandle?: string; canRequest: boolean };

/**
 * Reactions on a message (completion plan 7.3; ten since 2026-11-23, owner: "make it animated and also easy to use as
 * telegram emoji reaction"). The picker shows the first seven, the rest under "more"; reactions show in this order.
 */
export const MESSAGE_REACTIONS = ['thumbs_up', 'heart', 'laugh', 'wow', 'sad', 'pray', 'fire', 'party', 'clap', 'check'] as const;
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
  /** The task's title; for a `direct` conversation, the other person's display name. */
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
  /**
   * The other person is a sample profile of the demo marketplace (2026-11-23): they won't reply ("Sample profile"). Only
   * where sample rows are told apart (production); in development and the e2e build every row is seed data.
   */
  sample?: boolean;
  /** The viewer pinned it: on top of their list (2026-11-23). */
  pinned?: boolean;
  /** The viewer muted it: no "sent you a message", and not in the Messages badge; its own count still shows. */
  muted?: boolean;
  /** The viewer archived it: out of the list, under Archived, until the other person writes again. */
  archived?: boolean;
  /**
   * A message request (2026-11-23): a direct conversation someone else started that the viewer hasn't accepted or
   * answered, from someone they haven't talked to about a task. Under Requests, not in the Messages badge.
   */
  request?: boolean;
}

// ---- The viewer's own list (2026-11-23, owner: "plan all and implement"): pinned, muted, archived; message requests --

/** Conversations a person can pin. */
export const PINNED_CONVERSATIONS_MAX = 3;

export const CONVERSATION_FLAGS = ['pinned', 'muted', 'archived'] as const;
export type ConversationFlag = (typeof CONVERSATION_FLAGS)[number];

/** Pin, mute or archive a conversation, or undo it. */
export const conversationFlagInputSchema = z.object({ flag: z.enum(CONVERSATION_FLAGS, 'invalid'), on: z.boolean('invalid') });
export type ConversationFlagInput = z.input<typeof conversationFlagInputSchema>;

/**
 * A conversation's place in the viewer's list, and its message request.
 * - `onFlag`: ok `updated`. Errors: `limit_reached` (already `PINNED_CONVERSATIONS_MAX` pinned), `not_found`.
 * - `onAccept`: a message request into the list: ok `updated`. Ignore is `onFlag({ flag: 'archived', on: true })`, and the
 *   sender isn't told; Block is the conversation's Block.
 */
export interface ConversationListHandlers {
  onFlag(threadId: string, input: ConversationFlagInput): Promise<ActionResult>;
  onAccept(threadId: string): Promise<ActionResult>;
}

/** A conversation's search (2026-11-23): its messages as the viewer sees them (masked details can't be found). */
export const CONVERSATION_SEARCH_MAX = 30;

export interface ConversationSearchHit {
  id: string;
  sender: 'me' | 'them';
  /** The message, cut to its first 160 characters as quotes are. */
  segments: MessageSegment[];
  createdAt: ISODateTime;
}

/** Newest first. `more`: there were more than `CONVERSATION_SEARCH_MAX`; a longer search finds fewer. */
export interface ConversationSearchData {
  query: string;
  hits: ConversationSearchHit[];
  more: boolean;
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
  /**
   * A direct conversation the viewer started: they sent `DIRECT_FIRST_MESSAGES_MAX` messages and the other person
   * hasn't answered yet. Sending opens again as soon as they do.
   */
  'awaiting_reply',
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
  /**
   * A direct conversation the viewer started that the other person hasn't answered yet: how many more messages the
   * viewer can send until they do ("You can send 2 more messages until Sam replies"). Absent once they've answered.
   */
  firstMessagesLeft?: number;
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
  /**
   * How far the other person has read (2026-11-24, owner: "sent/read feature with tick/double tick icon"): the viewer's
   * messages up to this time show two ticks (Read), later ones one (Sent). Mutual, like `presence`: absent until it's a
   * real conversation and both share their activity, and then every message shows one tick.
   */
  readUpTo?: ISODateTime;
  /** The first message the viewer hadn't read before opening the conversation: "New messages" goes above it (7.3). */
  firstUnreadId?: string;
  /** The viewer's saved replies, for the composer (7.3). */
  savedReplies?: MessageSavedReply[];
  /**
   * Help from the free models (2026-11-23), where this server offers it: Translate on the other person's messages, and
   * Suggest replies in the composer when they wrote last. Since 2026-11-24 (owner: "implement others all one by one"):
   * `translate` also offers "Translate this conversation" in the ⋯ menu, `summarize` offers "Catch me up", and `language`
   * is the reader's (`users.locale`), the one both translate into.
   */
  assist?: { translate: boolean; suggest: boolean; summarize?: boolean; language?: AppLocale };
  /**
   * The conversation opened with this many unread messages from the other person, enough (8 or more) that "Catch me up"
   * is offered at once, as a card above "New messages" (2026-11-24). Only where summaries are offered (`assist.summarize`).
   */
  catchUp?: { unread: number };
  /** The cards its status lines show: task requests and booking changes (2026-11-23). */
  cards?: ConversationCards;
  /**
   * A booking's conversation where the booking can still change (confirmed or under way): "Propose a change" opens the
   * change dialog (`routes.app.bookingProposeChange`), and the proposal shows here as a card (2026-11-23).
   */
  canProposeChange?: boolean;
  /** A direct conversation's "+" menu (2026-11-23); absent when it has nothing to offer. */
  requestOptions?: ConversationRequestOptions;
}

// ---- Cards in a conversation (2026-11-23, owner: "plan all and implement") ---------------------------------------------
//
// A task request between two people who talk directly shows in their conversation as a card the helper answers there; a
// booking change shows in the booking's conversation with its status. Status lines in the log carry the id (`event.params`
// `inviteId` or `changeId`); the cards come with the conversation, already for the viewer.

/** A task request (a funded direct invite), as one of its two people sees it in their direct conversation. */
export interface TaskRequestCard {
  inviteId: string;
  title: string;
  /** When: the request's start, or the helper's counter's while it's countered. */
  start: ISODateTime;
  pricing: PricingInput;
  status: InviteStatus;
  viewerRole: 'poster' | 'helper';
  /** The helper answers while it waits (Accept, Decline); the client may Cancel it while it waits or is countered. */
  actions: ('accept' | 'decline' | 'cancel')[];
  /** Where it lives: the client's task (`routes.app.task`), the helper's offers with it open (`routes.app.offers(inviteId)`). */
  href: string;
  /** Accepted: its booking (`routes.app.booking`). */
  bookingId?: string;
  /** While it waits: when it lapses. */
  expiresAt?: ISODateTime;
}

/** A booking change, as one of its two people sees it in the booking's conversation. */
export interface ChangeCard {
  bookingId: string;
  changeId: string;
  status: ChangeStatus;
  /** The viewer proposed it. */
  fromViewer: boolean;
  types: ProposableChangeType[];
  /** The new start, when the time changes. */
  startAt?: ISODateTime;
  /** The client's total after minus before (positive: they pay more). */
  differenceCents: Cents;
  /** While it's open: when it lapses. */
  expiresAt?: ISODateTime;
}

/**
 * "Asked for an offer" (2026-11-23, owner: "once started conversation, it's unable to request task or request offer"): a
 * client asked the helper they're talking to for an offer on one of their open tasks. The helper's card says Make an
 * offer (`routes.app.findWorkOffer(taskId)`, a dialog over the page) until they have one; the client's, View task.
 */
export interface OfferAskCard {
  taskId: string;
  title: string;
  /** The task is still open for offers. */
  open: boolean;
  viewerRole: 'poster' | 'helper';
  /** The helper has made an offer on it (theirs, pending or accepted). */
  offered: boolean;
  /** The client's task (`routes.app.task`), or for the helper the offer form (`routes.app.findWorkOffer`) / their offer. */
  href: string;
}

export interface ConversationCards {
  /** By invite id. */
  requests?: Record<string, TaskRequestCard>;
  /** By change id. */
  changes?: Record<string, ChangeCard>;
  /** By the line's message id (one task may be asked about twice). */
  offerAsks?: Record<string, OfferAskCard>;
}

/** An open task to choose in a conversation's "+" menu. */
export interface TaskChoice {
  id: string;
  title: string;
}

/**
 * What a direct conversation's "+" menu offers (2026-11-23): Request a task (the other person is a bookable helper:
 * `requestHandle`), Ask for an offer on one of the viewer's open tasks (`myOpenTasks`, to a helper), and, for a helper,
 * Make an offer on one of the other person's open tasks (`theirOpenTasks`).
 */
export interface ConversationRequestOptions {
  requestHandle?: string;
  myOpenTasks: TaskChoice[];
  theirOpenTasks: TaskChoice[];
}

export const askForOfferInputSchema = z.object({ taskId: z.string('required').trim().min(1, 'required').max(80, 'too_long') });
export type AskForOfferInput = z.input<typeof askForOfferInputSchema>;

/**
 * A task request card's buttons (the invites' own actions, with `{ inviteId }`): ok `booked` (accept, with `redirectTo` the
 * booking) or `updated`. Errors: `not_allowed`, `expired`, `version_conflict`, `unknown`.
 */
export interface RequestCardHandlers {
  onAccept: ActionHandler<{ inviteId: string }>;
  onDecline: ActionHandler<{ inviteId: string }>;
  onCancel: ActionHandler<{ inviteId: string }>;
}

/** A message in the reader's language (made on request, never stored). */
export interface MessageTranslation {
  text: string;
}

/** Up to three short replies the reader might send next; choosing one fills the composer, never sends it. */
export interface ReplySuggestions {
  replies: string[];
}

// ---- A whole conversation in the reader's language, and "Catch me up" (2026-11-24, owner: "implement others all one by one")

/**
 * "Translate this conversation": the other person's written messages in the reader's language as they load and arrive,
 * asked for a few at a time (the ones on screen, at most `TRANSLATE_MANY_MAX` ids a request). Made on request, never
 * stored; the viewer's choice is remembered in their browser only.
 */
export const TRANSLATE_MANY_MAX = 20;
export const translateManyInputSchema = z.object({ messageIds: z.array(z.string().min(1).max(80)).min(1).max(TRANSLATE_MANY_MAX) });
export type TranslateManyInput = z.input<typeof translateManyInputSchema>;

/**
 * The answer, by message id: each translated text (masked details as "[hidden]", as Translate shows them), and the
 * messages already in the reader's language. An id in neither (not the other person's, not a written message, or no
 * translation came back) shows as written.
 */
export interface MessageTranslations {
  texts: Record<string, string>;
  same: string[];
}

/**
 * "Catch me up": a short summary of what the viewer missed, from `fromId` on (the first message they hadn't read when
 * the conversation opened, its "New messages" line), or of the latest messages without one. Made on request, never
 * stored, in the reader's language.
 */
export const catchUpInputSchema = z.object({ fromId: z.string().min(1).max(80).optional() });
export type CatchUpInput = z.input<typeof catchUpInputSchema>;

export interface ConversationSummary {
  /** One to four short points, in the reader's language. */
  points: string[];
  /** The written messages it read: how many, and the first and the last one's times. */
  count: number;
  from: ISODateTime;
  to: ISODateTime;
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
  /** Pin, mute or archive this conversation (2026-11-23): as `ConversationListHandlers.onFlag`, bound to it. */
  onFlag?: ActionHandler<ConversationFlagInput>;
  /** Accept this message request: as `ConversationListHandlers.onAccept`, bound to it. */
  onAccept?: () => Promise<ActionResult>;
  /** Search this conversation (null: it isn't the viewer's any more). */
  onSearch?: QueryHandler<string, ConversationSearchData | null>;
  /** A message in the reader's language, by its id (null: not now: no model, the day's 60 used). */
  onTranslate?: QueryHandler<string, MessageTranslation | null>;
  /** Replies to the other person's latest message (null: not now: no model, the hour's 30 used, nothing to answer). */
  onSuggest?: () => Promise<ReplySuggestions | null>;
  /**
   * "Translate this conversation" (2026-11-24): several of the other person's messages in the reader's language, by id
   * (null: not now: no model, or the day's 100 requests used).
   */
  onTranslateMany?: QueryHandler<TranslateManyInput, MessageTranslations | null>;
  /** "Catch me up" (2026-11-24): a summary of what was missed (null: not now: no model, the hour's 20 used, nothing written). */
  onCatchUp?: QueryHandler<CatchUpInput, ConversationSummary | null>;
  /** A task request card's Accept, Decline and Cancel (2026-11-23). */
  requestCards?: RequestCardHandlers;
  /**
   * Ask the other person for an offer on one of the viewer's open tasks (2026-11-23): ok `sent` (the card shows in the
   * conversation). Errors: `not_allowed` (not theirs, not open, or the other person isn't a helper), `rate_limited`.
   */
  onAskForOffer?: ActionHandler<AskForOfferInput>;
  /**
   * GIFs (2026-11-24): trending with an empty `q`, else a search (60 a minute). Absent when GIFs are off (no KLIPY key
   * in production): no GIF button.
   */
  onSearchGifs?: QueryHandler<GifSearchInput, GifSearchResult>;
  /**
   * A picked GIF, by its id: stored like a photo (`animated`), counted like one, then sent at once as its own message
   * with `onSend`. Errors: `unsupported_type` (unknown, not an animated GIF), `too_large`, `rate_limited`, `unknown`.
   */
  onAttachGif?: QueryHandler<AttachGifInput, PhotoUploadResult>;
}

// ---- Direct conversations (2026-11-21) -----------------------------------------------------------------------

/** Who may start a direct conversation with a person (their account setting). */
export const DIRECT_MESSAGE_SETTINGS = [
  'everyone',
  /** Only people they've already talked to about a task (an offer, invite, booking or regular visits). */
  'task_contacts',
  'nobody',
] as const;
export type DirectMessageSetting = (typeof DIRECT_MESSAGE_SETTINGS)[number];

/** Messages the person who started a direct conversation can send before the other person answers. */
export const DIRECT_FIRST_MESSAGES_MAX = 3;

/**
 * Staff accounts start any number of new direct conversations (2026-11-23, owner: "plan all and implement"): this is
 * only the guard against a runaway script. Their allowance says `staff` and shows no count.
 */
export const STAFF_DIRECT_CHATS_PER_DAY = 500;

/**
 * New direct conversations the viewer can start: `left` of `perDay` in any 24 hours. With none left, `resetsAt` is when
 * the next one frees up. `staff`: a staff account, with no daily limit to show (`STAFF_DIRECT_CHATS_PER_DAY`).
 */
export interface DirectChatAllowance {
  left: number;
  perDay: number;
  resetsAt?: ISODateTime;
  staff?: boolean;
}

/** Why a direct conversation can't be started. */
export const DIRECT_CHAT_REFUSALS = [
  /** Yourself. */
  'self',
  /** The viewer's own account is limited or suspended by our team: no new conversations (support can say why). */
  'account_limited',
  /** The account is gone, banned or suspended. */
  'unavailable',
  /** One of the two blocked the other. */
  'blocked',
  /** They take no direct messages. */
  'not_accepting',
  /** They take direct messages only from people they've talked to about a task. */
  'task_contacts_only',
  /** The viewer started their allowance of new conversations in the last 24 hours (`allowance.resetsAt`). */
  'limit_reached',
] as const;
export type DirectChatRefusal = (typeof DIRECT_CHAT_REFUSALS)[number];

/**
 * `/app/messages/new?to=…` (or `?helper=<handle>`): start a direct conversation with one person by writing the first
 * message. When the two already have a direct conversation, the page goes straight to it instead.
 */
export interface NewDirectMessagePageData {
  recipient: PersonSummary;
  /** Their @username (2026-11-23), under their name. */
  username?: string;
  /**
   * A sample profile of the demo marketplace (2026-11-23): it shows how the app works and never answers, so the form
   * says so. Only where sample rows are told apart (production); in development and the e2e build every row is seed data.
   */
  sample?: boolean;
  /** The recipient's helper handle, when they're a helper: their profile, and "Send a task request" with `canRequest`. */
  helperHandle?: string;
  /** "Send a task request" (`routes.app.requestHelper(helperHandle)`): the recipient is a bookable helper and not the viewer. */
  canRequest: boolean;
  /** Absent when the viewer can write now. */
  refusal?: DirectChatRefusal;
  /**
   * New direct conversations the viewer can start: `left` of `perDay` in any 24 hours. With none left, `resetsAt` is
   * when the next one frees up. `perDay` grows with the viewer's Sparks level and with a plan (`routes.app.sparks()`).
   */
  allowance: DirectChatAllowance;
  /** Messages the viewer can send before the recipient answers (`DIRECT_FIRST_MESSAGES_MAX`). */
  firstMessagesMax: number;
  /** Phone numbers, emails and links are hidden until the two have a paid booking together (blueprint 06). */
  contactMasking: boolean;
  maxLength: number;
}

export const startDirectChatInputSchema = z.object({
  /** The recipient's user id (`NewDirectMessagePageData.recipient.id`). */
  to: z.string('required').trim().min(1, 'required').max(80, 'too_long'),
  body: z.string('required').trim().min(1, 'required').max(2000, 'too_long'),
  /** The composer's key (bad connections pass, J-N1): a repeat after a lost answer opens the same conversation. */
  requestKey: requestKeyField.optional(),
});
export type StartDirectChatInput = z.input<typeof startDirectChatInputSchema>;

/**
 * Handlers on the new conversation page.
 * - `onStart`: ok `sent` with `redirectTo` the conversation. Errors: `validation_failed` (`body`), `not_allowed`
 *   (a refusal that appeared meanwhile: reload), `limit_reached` (with `retryAt`), `rate_limited` (with `retryAt`),
 *   `unknown`.
 */
export interface NewDirectMessageHandlers {
  onStart: ActionHandler<StartDirectChatInput>;
}

/**
 * `/app/messages/new` with no one named yet (2026-11-22): "New message" asks for an @username (`?u=`). `query` and
 * `notFound` when the one typed belongs to nobody reachable. `allowance` is the same as on the conversation's first
 * message: new conversations left in any 24 hours, by Sparks level (`level`) or plan.
 */
export interface FindPersonPageData {
  query?: string;
  notFound?: boolean;
  allowance: DirectChatAllowance;
  level: SparkLevel;
  /** The viewer's plan, when it (not their level) sets `allowance.perDay` (Plus 25, Pro 100 a day: 2026-11-23). */
  allowanceFrom?: PlanCode;
}

// ---- Starting a conversation where you are (2026-11-23, owner: "I want to do it in live chat box itself. I hate to
// redirect to new pages continually … if possible, use dialog") ------------------------------------------------------
//
// New message finds the person as you type their @username and shows the first message's form in place: in the chat
// window on wide screens, and in a dialog over the page (or on the New message page itself) on phones.

/** Who a new direct conversation is with: as a link names them (`routes.app.newMessage`). */
export type DirectChatTarget = { userId: string } | { username: string } | { helper: string };

/** Suggestions while typing an @username: at most this many. */
export const PEOPLE_SUGGESTIONS_MAX = 6;

/** A person whose @username starts with what was typed. */
export interface PersonSuggestion {
  id: string;
  username: string;
  /** First name + last initial ("Minh T."). */
  displayName: string;
  initials: string;
  photo?: Photo;
  /** They have a bookable helper profile. */
  helper: boolean;
  /** A sample profile of the demo marketplace (see `NewDirectMessagePageData.sample`). */
  sample?: boolean;
  /** The viewer's conversation with them, when they have one: choosing them opens it. */
  threadId?: string;
}

/**
 * `GET /api/messages/people?q=`: reachable people (not the viewer, not blocked either way, accounts in use) whose
 * @username starts with `query` (lowercase, without "@"; empty: nobody), exact match first, then shortest. With the
 * viewer's allowance of new conversations, as on the find step.
 */
export interface PeopleSearchData {
  query: string;
  people: PersonSuggestion[];
  allowance: DirectChatAllowance;
  level: SparkLevel;
  /** The viewer's plan, when it (not their level) sets `allowance.perDay` (as on `FindPersonPageData`). */
  allowanceFrom?: PlanCode;
}

/**
 * `GET /api/messages/new?to=|u=|helper=`: where a new conversation with that person starts. Their conversation when
 * the two already have one, else the first message's form, as the New message page shows it (`not_found` 404: nobody
 * reachable by that id or handle).
 */
export type DirectChatStart = { kind: 'thread'; threadId: string } | { kind: 'page'; data: NewDirectMessagePageData };

/**
 * New message in place (the chat window, the dialog and the page share it).
 * - `onSearch`: suggestions for what's typed (`PeopleSearchData`); a failure shows nothing new.
 * - `onLoad`: the conversation or the first message's form for a person (null: nobody reachable by that).
 * - `onStart`: as `NewDirectMessageHandlers.onStart`; ok `sent` with `redirectTo` the new conversation.
 */
export interface NewChatHandlers {
  onSearch: QueryHandler<string, PeopleSearchData>;
  onLoad: QueryHandler<DirectChatTarget, DirectChatStart | null>;
  onStart: ActionHandler<StartDirectChatInput>;
}

export const MESSAGE_SAVED_REPLY_MAX = 20;
export const messageSavedReplyInputSchema = z.object({
  title: z.string('required').trim().min(1, 'required').max(40, 'too_long'),
  body: z.string('required').trim().min(1, 'required').max(1000, 'too_long'),
});
export type MessageSavedReplyInput = z.input<typeof messageSavedReplyInputSchema>;

// ---- The chat window (2026-11-22, owner: "improve it as Reddit similar chat, right bottom fixed chat icon") ----------
//
// Messages is a round button fixed at the bottom right of every signed-in page (no longer one of the five tabs). On wide
// screens it opens a chat window docked in that corner, over the page; on phones it opens the Messages page. The window
// stays open from page to page (it lives in the signed-in shell) and loads its data itself, through the app's read routes.

/** The window on wide screens: closed (the button), open, or minimized to a bar in the corner. Kept for the tab. */
export const CHAT_WINDOW_STATES = ['closed', 'open', 'minimized'] as const;
export type ChatWindowState = (typeof CHAT_WINDOW_STATES)[number];

/**
 * What the window shows: the conversations, the pinned Help conversation, one conversation, or a new one (2026-11-23):
 * finding the person by @username (`to` absent), then the first message to them.
 */
export type ChatView = { kind: 'list' } | { kind: 'help' } | { kind: 'thread'; threadId: string } | { kind: 'new'; to?: DirectChatTarget };

/** `GET /api/messages/inbox`: the conversations, and the pinned Help row. */
export interface ChatInboxData extends InboxPageData {
  help: HelpSummary;
}

/** `GET /api/messages/threads/[threadId]`: a conversation as its page shows it, with what Report and Block need. */
export interface ChatThreadData {
  data: ThreadPageData;
  safety?: ReportSubject;
}

/** Something the window loads: not asked for yet, loading (with what it had), ready, or failed (with what it had; `notFound`: it isn't the viewer's). */
export type ChatLoad<T> = { status: 'idle' } | { status: 'loading'; data?: T } | { status: 'ready'; data: T } | { status: 'error'; data?: T; notFound?: boolean };

/**
 * A conversation's handlers in the window, by conversation: the same rules as the conversation page's
 * (`ThreadHandlers`), and none of them re-renders the page behind the window.
 */
export interface ChatThreadHandlers {
  onSend(threadId: string, input: SendMessageInput): Promise<ActionResult>;
  onUploadPhoto: QueryHandler<FormData, PhotoUploadResult>;
  onTyping(threadId: string): Promise<void>;
  onReact(threadId: string, input: { messageId: string; emoji: MessageReaction; on: boolean }): Promise<ActionResult>;
  onSaveReply: ActionHandler<MessageSavedReplyInput>;
  onDeleteReply: ActionHandler<{ id: string }>;
  onReport(threadId: string, input: ReportInput): Promise<ActionResult>;
  onBlock(threadId: string, input: { blocked: boolean }): Promise<ActionResult>;
  /** Pin, mute, archive, accept and search (2026-11-23), as on the conversation page. */
  onFlag(threadId: string, input: ConversationFlagInput): Promise<ActionResult>;
  onAccept(threadId: string): Promise<ActionResult>;
  onSearch(threadId: string, query: string): Promise<ConversationSearchData | null>;
  onTranslate(threadId: string, messageId: string): Promise<MessageTranslation | null>;
  onSuggest(threadId: string): Promise<ReplySuggestions | null>;
  /** "Translate this conversation" and "Catch me up" (2026-11-24), as on the conversation page. */
  onTranslateMany(threadId: string, input: TranslateManyInput): Promise<MessageTranslations | null>;
  onCatchUp(threadId: string, input: CatchUpInput): Promise<ConversationSummary | null>;
  requestCards: RequestCardHandlers;
  onAskForOffer(threadId: string, input: AskForOfferInput): Promise<ActionResult>;
  /** GIFs (2026-11-24), as on the conversation page; absent when they're off. */
  onSearchGifs?: QueryHandler<GifSearchInput, GifSearchResult>;
  onAttachGif?: QueryHandler<AttachGifInput, PhotoUploadResult>;
}
