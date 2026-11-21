import { z } from 'zod';
import type { ActionHandler, FieldErrorCode } from './actions';
import type { BadgeView } from './badges';
import type { CategorySlug, ISODateTime, Photo } from './common';
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
}

export interface CommunityNewPostPageData extends CommunityComposerData {
  kind: CommunityPostKind;
}

export const COMMUNITY_TITLE_MAX = 120;
export const COMMUNITY_BODY_MAX = 2000;
export const COMMUNITY_REPLY_MAX = 1000;

export const communityPostInputSchema = z
  .object({
    kind: z.enum(COMMUNITY_POST_KINDS, code('required')),
    title: z.string(code('required')).trim().min(5, code('too_short')).max(COMMUNITY_TITLE_MAX, code('too_long')),
    body: z.string(code('required')).trim().min(10, code('too_short')).max(COMMUNITY_BODY_MAX, code('too_long')),
    categorySlug: z.string().trim().optional(),
    /** A neighborhood's slug, or empty for the whole market. */
    areaSlug: z.string().trim().optional(),
    /** A thanks post: the booking. */
    bookingId: z.string().trim().optional(),
  })
  .refine((value) => value.kind !== 'thanks' || Boolean(value.bookingId), { path: ['bookingId'], message: code('required') });
export type CommunityPostInput = z.input<typeof communityPostInputSchema>;

export const communityReplyInputSchema = z.object({
  body: z.string(code('required')).trim().min(2, code('too_short')).max(COMMUNITY_REPLY_MAX, code('too_long')),
  /** A recommendation request: the helper named, by handle. */
  recommendHandle: z.string().trim().optional(),
});
export type CommunityReplyInput = z.input<typeof communityReplyInputSchema>;

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
 * - `onPost`: ok `sent` with `redirectTo` the new post. Errors: `validation_failed` (fields; `prohibited` for a
 *   safety or crime post, which belongs with the police or 911, not here), `rate_limited`, `not_allowed`.
 */
export interface CommunityNewPostHandlers {
  onPost: ActionHandler<CommunityPostInput>;
}

/**
 * - `onReact`: ok `updated`. Errors: `not_found`, `rate_limited`.
 * - `onReply`: ok `sent`. Errors: `validation_failed`, `rate_limited`, `not_allowed` (closed, or blocked).
 * - `onPin`: the author pins (or unpins with `null`) the answer that helped. ok `updated`.
 * - `onDelete`: an author removes their own post or reply. ok `updated` (a post: `redirectTo` the portal).
 * - `onModerate`: staff only. ok `updated`.
 * - `onSavePost`: keep the post in Saved, or take it out (plan 9.10). ok `updated`. Errors: `not_found`, `rate_limited`.
 */
export interface CommunityPostHandlers {
  onReact: ActionHandler<CommunityReactInput>;
  onReply: ActionHandler<CommunityReplyInput>;
  onPin: ActionHandler<{ replyId: string | null }>;
  onDelete: ActionHandler<{ target: 'post' | 'reply'; id: string }>;
  onModerate?: ActionHandler<{ target: 'post' | 'reply'; id: string } & CommunityModerationInput>;
  onSavePost?: ActionHandler<{ postId: string; saved: boolean }>;
}
