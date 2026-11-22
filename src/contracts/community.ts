import { z } from 'zod';
import type { ActionHandler, FieldErrorCode, QueryHandler } from './actions';
import type { BadgeView } from './badges';
import type { CategorySlug, ISODateTime, Photo } from './common';
import type { PhotoUploadResult } from './posting';
import type { SparksSummary } from './sparks';

/**
 * The community feed (completion plan 7.7–7.8): neighbors ask for a recommendation, ask a question, share a tip,
 * or thank a helper they booked. Signed-in members of the market only; never indexed. Posts belong to a
 * neighborhood or the whole market. One level of replies; Thanks and Helpful on posts and replies; the author
 * pins the answer that helped. Contact details are masked as in messages; everything can be reported; staff hide
 * or remove with a reason.
 */

const code = (value: FieldErrorCode) => value;

export const COMMUNITY_POST_KINDS = ['recommendation', 'question', 'tip', 'thanks'] as const;
export type CommunityPostKind = (typeof COMMUNITY_POST_KINDS)[number];

export const COMMUNITY_REACTIONS = ['thanks', 'helpful'] as const;
export type CommunityReaction = (typeof COMMUNITY_REACTIONS)[number];

/** Who wrote it, as everyone sees them: the role comes from what they do here, never from a claim. */
export interface CommunityAuthor {
  displayName: string;
  initials: string;
  /** Helper (offers help here), poster (has posted a task), or neighbor. */
  role: 'helper' | 'poster' | 'neighbor';
  /** Their ID is verified. */
  verified: boolean;
  /** Their neighborhood, when known. */
  areaName?: string;
  /** A helper's public profile. */
  helperHandle?: string;
  isYou: boolean;
  /** Their profile photo, when they added one (shown inside the app). */
  photo?: Photo;
  /** Their @username (2026-11-22), on the card behind their name. */
  username?: string;
  /** The card behind their name (plan 9.10, LinkedIn-style): earned facts only, never claims. */
  card?: CommunityAuthorCard;
}

/** What people have done here, as an author's card shows it. */
export interface CommunityAuthorCard {
  memberSince: ISODateTime;
  /** A helper's record (an active helper profile). */
  helper?: {
    headline?: string;
    rating?: { average: number; count: number };
    completedCount: number;
    /** Neighbors who booked them and recommended or thanked them here (plan 7.8). */
    recommendedBy: number;
    /** How fast they usually answer a new conversation (plan 7.12). */
    responseTime?: 'hour' | 'few_hours' | 'day';
    /** Up to 3 achievement badges, most notable first (plan 6.4). */
    badges: BadgeView[];
    /** Ask them for help directly; absent on your own card. */
    requestHref?: string;
  };
  /** Their Sparks with the bought part (2026-11-21); absent with none. */
  sparks?: SparksSummary;
  /** Message them (`routes.app.newMessage`); absent on your own card and when they take no direct messages. */
  messageHref?: string;
}

export interface CommunityReactionsView {
  thanks: number;
  helpful: number;
  /** The viewer's own. */
  mine: CommunityReaction[];
}

/** A helper named in a reply or thanked in a post: a card people can open and book. */
export interface CommunityHelperCard {
  handle: string;
  displayName: string;
  initials: string;
  headline?: string;
  rating?: { average: number; count: number };
  /** Neighbors who booked them and recommended or thanked them here. */
  recommendedBy: number;
  /** The helper recommended themself. */
  selfTag: boolean;
  /** Ask them for help directly (the request page); absent when the helper is the viewer. */
  requestHref?: string;
}

export interface CommunityReplyView {
  id: string;
  author: CommunityAuthor;
  body: string;
  createdAt: ISODateTime;
  reactions: CommunityReactionsView;
  pinned: boolean;
  recommendedHelper?: CommunityHelperCard;
  /** Staff see hidden replies, marked. */
  moderation?: { status: 'hidden' | 'removed'; reason?: string };
  /** Its photo (plan 10.1): one per reply. */
  photo?: Photo;
  /** The author last edited it (plan 10.5): it says "Edited". */
  editedAt?: ISODateTime;
  /** The viewer wrote it and may edit it now. */
  canEdit?: boolean;
  /** The reply it answers ("Replying to Maya R.", plan 10.10); absent when that reply is gone or hidden from the viewer. */
  replyTo?: { id: string; authorName: string };
  /** Up to two people who found it helpful, newest first (never the viewer, nobody blocked); the rest are counted. */
  helpfulNames?: string[];
}

/** Whether the viewer hears about new replies to a post (plan 10.9): following, muted for good, or neither. */
export const COMMUNITY_FOLLOW_STATES = ['following', 'muted', 'none'] as const;
export type CommunityFollowState = (typeof COMMUNITY_FOLLOW_STATES)[number];

/** One helper named in a recommendation thread (plan 10.4), with how many neighbors named them there. */
export interface CommunityThreadHelper {
  helper: CommunityHelperCard;
  /** Neighbors who named them in this thread (a helper naming themself counts once, marked `helper.selfTag`). */
  count: number;
}

/** Who reacted, as the list behind "Maya and 3 others found this helpful" shows them (plan 10.2). */
export interface CommunityReactorsView {
  helpful: string[];
  thanks: string[];
}

/** A seasonal starter in the composer (plan 10.18), already in the viewer's language: the title to begin from. */
export interface CommunityStarter {
  kind: CommunityPostKind;
  categorySlug?: CategorySlug;
  title: string;
}

/** The card staff pinned to the top of Neighbors (plan 10.16), in the viewer's language. */
export interface CommunityAnnouncementView {
  id: string;
  title: string;
  body: string;
  endsAt: ISODateTime;
}

export interface CommunityPostView {
  id: string;
  kind: CommunityPostKind;
  title: string;
  body: string;
  categorySlug?: CategorySlug;
  /** The neighborhood it's for; absent for the whole market. */
  areaName?: string;
  author: CommunityAuthor;
  createdAt: ISODateTime;
  lastActivityAt: ISODateTime;
  replyCount: number;
  reactions: CommunityReactionsView;
  /** A thanks post: the helper thanked. */
  thankedHelper?: CommunityHelperCard;
  /** The feed shows the pinned answer, or the latest replies. */
  previewReplies: CommunityReplyView[];
  moderation?: { status: 'hidden' | 'removed'; reason?: string };
  /** The neighborhood's slug, for the flair that filters by it (absent for the whole market). */
  areaSlug?: string;
  /** The viewer saved it (plan 9.10). */
  saved?: boolean;
  /** The task it became ("Ask for help"): its state now; the link stays once the task closes. */
  task?: CommunityPostTask;
  /**
   * The author's own recommendation request or question that hasn't become a task yet: the posting wizard, filled
   * in from the post (`routes.app.newTask({ fromPost })`). Absent for everyone else.
   */
  askForHelpHref?: string;
  /** Its photos (plan 10.1), in order: up to `COMMUNITY_POST_PHOTOS_MAX`. */
  photos?: Photo[];
  /** The author last edited it (plan 10.5): it says "Edited". */
  editedAt?: ISODateTime;
  /** The viewer wrote it and may edit it now (visible). */
  canEdit?: boolean;
  /** The viewer may answer it right here (plan 10.3): visible, nobody blocked, and nothing stops them posting. */
  canReply?: boolean;
  /** Whether the viewer hears about its new replies (plan 10.9). */
  follow?: CommunityFollowState;
  /** A recommendation request: the helpers neighbors named in it, most named first (plan 10.4). */
  recommended?: CommunityThreadHelper[];
  /** Up to two people who found it helpful, newest first (never the viewer, nobody blocked); the rest are counted. */
  helpfulNames?: string[];
}

/** The neighborhood post a task came from ("Ask for help", plan 9.10), as the task's own pages link back to it. */
export interface CommunityTaskDiscussion {
  postId: string;
  title: string;
  replyCount: number;
}

/** A post's task, as the post shows it. */
export interface CommunityPostTask {
  id: string;
  title: string;
  /** Where it opens for the viewer: their own task's page, a helper's offer page, or the task's page. */
  href: string;
  /** Taking offers, booked (someone's on it), done, or closed (canceled or expired). */
  state: 'open' | 'booked' | 'done' | 'closed';
  offerCount: number;
}

export interface CommunityPostPageData {
  market: { slug: string; name: string };
  post: CommunityPostView;
  replies: CommunityReplyView[];
  viewer: {
    canReply: boolean;
    /**
     * Why the viewer can't reply to a post that's open (sweep P3): a verified phone first (only where texts are on,
     * plan 9.2), or an account that can't post right now. Absent when they can reply, or when the post itself is closed.
     */
    replyBlocked?: 'phone_required' | 'suspended';
    /** The post's author pins the answer that helped. */
    canPin: boolean;
    isAuthor: boolean;
    /** A staff member who moderates (trust and safety, support leads, admins): shows the moderation controls. */
    isStaff: boolean;
  };
  /** A recommendation request: the helpers the viewer can name (ones they booked or saved, and themself). */
  recommendOptions: { handle: string; displayName: string; self: boolean }[];
  /** The viewer already named a helper on this request. */
  alreadyRecommended: boolean;
  /** More from the neighborhood beside the thread on wide screens (plan 10.23): the same service or place, lively first. */
  related?: { id: string; title: string; kind: CommunityPostKind; replyCount: number; areaName?: string }[];
  /** "See translation" works here (plan 10.23): a model is set up. Absent: the button isn't shown. */
  canTranslate?: boolean;
}

/** The new-post form's choices: on its own page, and in the portal's composer (plan 9.10). */
export interface CommunityComposerData {
  market: { slug: string; name: string };
  categories: { slug: CategorySlug }[];
  areas: { slug: string; name: string }[];
  yourArea?: { slug: string; name: string };
  /** Helpers the viewer can thank: completed, paid bookings not thanked yet. */
  thankOptions: { bookingId: string; helperName: string; taskTitle: string; completedAt: ISODateTime }[];
  postBlocked?: 'phone_required' | 'suspended';
  /** Seasonal starters for this month in the viewer's market (plan 10.18), at most three. */
  starters: CommunityStarter[];
  /**
   * Where this device keeps an unfinished post (plan 10.6): local storage only, per person and market, so a draft
   * survives a reload or an accidental Cancel and never shows to someone else signed in on the same device.
   */
  draftKey: string;
}

export interface CommunityNewPostPageData extends CommunityComposerData {
  kind: CommunityPostKind;
  /** "Thank Sam on Neighbors" from a finished booking (plan 10.12): that booking, chosen. */
  bookingId?: string;
}

export const COMMUNITY_TITLE_MAX = 120;
export const COMMUNITY_BODY_MAX = 2000;
export const COMMUNITY_REPLY_MAX = 1000;
/** Photos on a post and on a reply (plan 10.1). */
export const COMMUNITY_POST_PHOTOS_MAX = 4;
export const COMMUNITY_REPLY_PHOTOS_MAX = 1;
/** Details are optional for an ask (plan 10.6): "Who do you recommend for gutter cleaning?" says it all. */
export const COMMUNITY_BODY_OPTIONAL_KINDS = ['recommendation', 'question'] as const satisfies readonly CommunityPostKind[];
/** The shortest details a tip or a thanks takes. */
export const COMMUNITY_BODY_MIN = 10;

const photoIdsSchema = z.array(z.string().trim().min(1).max(80), code('invalid')).max(COMMUNITY_POST_PHOTOS_MAX, code('too_long'));

export const communityPostInputSchema = z
  .object({
    kind: z.enum(COMMUNITY_POST_KINDS, code('required')),
    title: z.string(code('required')).trim().min(5, code('too_short')).max(COMMUNITY_TITLE_MAX, code('too_long')),
    /** Optional for an ask (`COMMUNITY_BODY_OPTIONAL_KINDS`); at least `COMMUNITY_BODY_MIN` characters otherwise. */
    body: z.string().trim().max(COMMUNITY_BODY_MAX, code('too_long')).optional().default(''),
    categorySlug: z.string().trim().optional(),
    /** A neighborhood's slug, or empty for the whole market. */
    areaSlug: z.string().trim().optional(),
    /** A thanks post: the booking. */
    bookingId: z.string().trim().optional(),
    /** Photos uploaded for it (`onUploadPhoto`), in order. */
    photoIds: photoIdsSchema.optional(),
    /** The author saw the kindness reminder and posts anyway (plan 10.20). */
    kindnessConfirmed: z.boolean().optional(),
  })
  .refine((value) => value.kind !== 'thanks' || Boolean(value.bookingId), { path: ['bookingId'], message: code('required') })
  .refine((value) => (COMMUNITY_BODY_OPTIONAL_KINDS as readonly string[]).includes(value.kind) || value.body.length >= COMMUNITY_BODY_MIN, {
    path: ['body'],
    message: code('too_short'),
  });
export type CommunityPostInput = z.input<typeof communityPostInputSchema>;

export const communityReplyInputSchema = z.object({
  body: z.string(code('required')).trim().min(2, code('too_short')).max(COMMUNITY_REPLY_MAX, code('too_long')),
  /** A recommendation request: the helper named, by handle. */
  recommendHandle: z.string().trim().optional(),
  /** Its photo (`onUploadPhoto`). */
  photoId: z.string().trim().min(1).max(80).optional(),
  /** The reply it answers (plan 10.10): that reply's author is told. */
  replyToId: z.string().trim().min(1).max(80).optional(),
  /** The author saw the kindness reminder and replies anyway (plan 10.20). */
  kindnessConfirmed: z.boolean().optional(),
});
export type CommunityReplyInput = z.input<typeof communityReplyInputSchema>;

/**
 * Editing your own post or reply (plan 10.5): a post's title and details, a reply's words. Masked and checked like a
 * new one; the earlier words stay for staff.
 */
export const communityEditInputSchema = z.object({
  target: z.enum(['post', 'reply'], code('required')),
  id: z.string(code('required')).trim().min(1, code('required')).max(80, code('invalid')),
  /** A post's title (required for a post, ignored for a reply). */
  title: z.string().trim().max(COMMUNITY_TITLE_MAX, code('too_long')).optional(),
  body: z.string().trim().max(COMMUNITY_BODY_MAX, code('too_long')).optional().default(''),
  kindnessConfirmed: z.boolean().optional(),
});
export type CommunityEditInput = z.input<typeof communityEditInputSchema>;

/** Follow a post, mute it for good, or neither (plan 10.9). */
export const communityFollowInputSchema = z.object({
  postId: z.string(code('required')).trim().min(1, code('required')).max(80, code('invalid')),
  state: z.enum(COMMUNITY_FOLLOW_STATES, code('required')),
});
export type CommunityFollowInput = z.input<typeof communityFollowInputSchema>;

/** The viewer's neighborhood on Neighbors (plan 10.15): an area's slug in their market, or empty to forget it. */
export const communityAreaInputSchema = z.object({ areaSlug: z.string().trim().max(60, code('invalid')) });
export type CommunityAreaInput = z.input<typeof communityAreaInputSchema>;

export interface CommunityReactInput {
  targetKind: 'post' | 'reply';
  targetId: string;
  kind: CommunityReaction;
  on: boolean;
}

/** Save a post for later, or take it out of Saved (plan 9.10). */
export const communitySaveInputSchema = z.object({
  postId: z.string(code('required')).trim().min(1, code('required')).max(80, code('invalid')),
  saved: z.boolean(code('required')),
});
export type CommunitySaveInput = z.input<typeof communitySaveInputSchema>;

export const communityModerationInputSchema = z.object({
  action: z.enum(['hide', 'remove', 'restore'], code('required')),
  reason: z.string(code('required')).trim().min(5, code('too_short')).max(500, code('too_long')),
});
export type CommunityModerationInput = z.input<typeof communityModerationInputSchema>;

/**
 * - `onPost`: ok `sent` with `redirectTo` the new post, and `sparks` when it earned some. Errors: `validation_failed`
 *   (fields; `prohibited` for a safety or crime post, which belongs with the police or 911, not here; `unkind` on
 *   `body` for the kindness reminder, plan 10.20: send again with `kindnessConfirmed` to post anyway; `invalid` on
 *   `photoIds`), `rate_limited`, `not_allowed`.
 * - `onUploadPhoto`: a photo for the post (plan 10.1), re-encoded with its metadata dropped; attach its id.
 */
export interface CommunityNewPostHandlers {
  onPost: ActionHandler<CommunityPostInput>;
  onUploadPhoto?: QueryHandler<FormData, PhotoUploadResult>;
}

/**
 * - `onReact`: ok `updated`. Errors: `not_found`, `rate_limited`.
 * - `onReply`: ok `sent` (`sparks` when it earned some). Errors: `validation_failed` (`unkind` as for a post),
 *   `rate_limited`, `not_allowed` (closed, or blocked).
 * - `onPin`: the author pins (or unpins with `null`) the answer that helped. ok `updated`.
 * - `onDelete`: an author removes their own post or reply. ok `updated` (a post: `redirectTo` the portal).
 * - `onModerate`: staff only. ok `updated`.
 * - `onSavePost`: keep the post in Saved, or take it out (plan 9.10). ok `updated`. Errors: `not_found`, `rate_limited`.
 * - `onEdit`: the author edits their post or reply (plan 10.5). ok `updated`. Errors: `validation_failed` (as for a
 *   new one), `not_found`, `not_allowed`, `rate_limited`.
 * - `onFollow`: follow the post, mute it, or neither (plan 10.9). ok `updated`. Errors: `not_found`.
 * - `onUploadPhoto`: a reply's photo (plan 10.1).
 * - `onLoadReactors`: who found it helpful or said thanks, for the list behind the counts (plan 10.2); `null` when the
 *   viewer can't read it.
 * - `onTranslate`: the post or a reply in the viewer's language (plan 10.23); `null` when it can't be translated now.
 */
export interface CommunityPostHandlers {
  onReact: ActionHandler<CommunityReactInput>;
  onReply: ActionHandler<CommunityReplyInput>;
  onPin: ActionHandler<{ replyId: string | null }>;
  onDelete: ActionHandler<{ target: 'post' | 'reply'; id: string }>;
  onModerate?: ActionHandler<{ target: 'post' | 'reply'; id: string } & CommunityModerationInput>;
  onSavePost?: ActionHandler<{ postId: string; saved: boolean }>;
  onEdit?: ActionHandler<CommunityEditInput>;
  onFollow?: ActionHandler<CommunityFollowInput>;
  onUploadPhoto?: QueryHandler<FormData, PhotoUploadResult>;
  onLoadReactors?: QueryHandler<{ target: 'post' | 'reply'; id: string }, CommunityReactorsView | null>;
  onTranslate?: QueryHandler<{ target: 'post' | 'reply'; id: string }, CommunityTranslation | null>;
}

/** A post or a reply in the viewer's language (plan 10.23), made on request; never stored. */
export interface CommunityTranslation {
  title?: string;
  body: string;
}
