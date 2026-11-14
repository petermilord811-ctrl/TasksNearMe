import { z } from 'zod';
import type { ActionHandler, FieldErrorCode } from './actions';
import type { CategorySlug, ISODateTime } from './common';

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

/** Near you (your neighborhood, the ones within a few miles, and posts for the whole market), or the whole market. */
export const COMMUNITY_SCOPES = ['nearby', 'market'] as const;
export type CommunityScope = (typeof COMMUNITY_SCOPES)[number];

/** Latest activity (new replies bring a post back up), newest posts, or the most helpful this month. */
export const COMMUNITY_SORTS = ['active', 'new', 'top'] as const;
export type CommunitySort = (typeof COMMUNITY_SORTS)[number];

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
}

export interface CommunityFeedQuery {
  scope?: CommunityScope;
  sort?: CommunitySort;
  kind?: CommunityPostKind;
  page?: number;
}

export interface CommunityFeedPageData {
  market: { slug: string; name: string };
  query: Required<Omit<CommunityFeedQuery, 'kind'>> & { kind?: CommunityPostKind };
  /** The viewer's neighborhood, which "Near you" centers on. */
  yourArea?: { slug: string; name: string };
  posts: CommunityPostView[];
  totalCount: number;
  pageCount: number;
  /** Real numbers for the market: posts this week, replies today. */
  stats: { postsThisWeek: number; repliesToday: number };
  /** Why the viewer can't post yet (a verified phone first), when they can't. */
  postBlocked?: 'phone_required' | 'suspended';
  /** For live updates: the neighborhoods (ids) "near you" covers, when that's the scope. */
  liveAreaIds?: string[];
}

export interface CommunityPostPageData {
  market: { slug: string; name: string };
  post: CommunityPostView;
  replies: CommunityReplyView[];
  viewer: {
    canReply: boolean;
    /** The post's author pins the answer that helped. */
    canPin: boolean;
    isAuthor: boolean;
    isStaff: boolean;
  };
  /** A recommendation request: the helpers the viewer can name (ones they booked or saved, and themself). */
  recommendOptions: { handle: string; displayName: string; self: boolean }[];
  /** The viewer already named a helper on this request. */
  alreadyRecommended: boolean;
}

export interface CommunityNewPostPageData {
  market: { slug: string; name: string };
  kind: CommunityPostKind;
  categories: { slug: CategorySlug }[];
  areas: { slug: string; name: string }[];
  yourArea?: { slug: string; name: string };
  /** Helpers the viewer can thank: completed, paid bookings not thanked yet. */
  thankOptions: { bookingId: string; helperName: string; taskTitle: string; completedAt: ISODateTime }[];
  postBlocked?: 'phone_required' | 'suspended';
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
 * - `onDelete`: an author removes their own post or reply. ok `updated` (a post: `redirectTo` the feed).
 * - `onModerate`: staff only. ok `updated`.
 */
export interface CommunityPostHandlers {
  onReact: ActionHandler<CommunityReactInput>;
  onReply: ActionHandler<CommunityReplyInput>;
  onPin: ActionHandler<{ replyId: string | null }>;
  onDelete: ActionHandler<{ target: 'post' | 'reply'; id: string }>;
  onModerate?: ActionHandler<{ target: 'post' | 'reply'; id: string } & CommunityModerationInput>;
}

/** The feed's reactions (the same as a post's). */
export interface CommunityFeedHandlers {
  onReact: ActionHandler<CommunityReactInput>;
}
