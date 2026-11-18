import type { ActionHandler } from './actions';
import type { CategorySlug, ISODateTime, Photo, TimeZone } from './common';
import type { CommunityComposerData, CommunityPostInput, CommunityPostKind, CommunityPostView, CommunityReactInput } from './community';
import type { TaskPublicView } from './tasks';

/**
 * The neighborhood portal (completion plan 9.10, docs/ui/portal-9.10.md): the community's posts and the open tasks
 * near you in one stream, shown as a Feed (cards, Nextdoor and Reddit) or a List (dense rows, Craigslist) over one
 * set of filters in one URL. Signed-in members of the market only; never indexed. Everything is read for the viewer:
 * their market and neighborhood, blocks both ways, their own reactions and saves. Tasks name their neighborhood
 * (or Remote), never anything closer.
 */

export const PORTAL_VIEWS = ['feed', 'list'] as const;
export type PortalView = (typeof PORTAL_VIEWS)[number];

/**
 * - `hot`: log₁₀(1 + engagement) + posted time ÷ 45,000 s (Reddit's hot, positives only);
 * - `new`: posted time;
 * - `top`: engagement within the time filter.
 * Engagement: a post's 2 × Helpful + Thanks + replies; a task's offers + questions.
 */
export const PORTAL_SORTS = ['hot', 'new', 'top'] as const;
export type PortalSort = (typeof PORTAL_SORTS)[number];

/** Tasks, or one kind of post. Without one: everything. */
export const PORTAL_TYPES = ['task', 'recommendation', 'question', 'tip', 'thanks'] as const;
export type PortalType = (typeof PORTAL_TYPES)[number];

/** Posted within the last day, week or month. Without one: any time. */
export const PORTAL_TIMES = ['24h', '7d', '30d'] as const;
export type PortalTime = (typeof PORTAL_TIMES)[number];

/** The List view's groups: by neighborhood (Craigslist) or by the day things were posted. */
export const PORTAL_GROUPS = ['area', 'day'] as const;
export type PortalGroup = (typeof PORTAL_GROUPS)[number];

/** `area` for the whole market. */
export const PORTAL_ALL_AREAS = 'all';
/** `category` for posts about no one service. */
export const PORTAL_GENERAL = 'general';
export type PortalCategory = CategorySlug | typeof PORTAL_GENERAL;

/** The longest search taken (longer ones are cut). */
export const PORTAL_Q_MAX = 80;
/** Items per page: the Feed, and the List by day (or in one neighborhood). */
export const PORTAL_FEED_PAGE_SIZE = 20;
export const PORTAL_LIST_PAGE_SIZE = 30;
/** Rows each neighborhood shows in the List by neighborhood, before "See all". */
export const PORTAL_SECTION_SIZE = 5;

/** `routes.app.community(query)`. Defaults are left out of the URL. */
export interface PortalQuery {
  /** Absent: near you (your neighborhood, those within 3 miles, citywide posts and remote tasks). `all`: the market. A slug: one neighborhood. */
  area?: string;
  category?: PortalCategory;
  type?: PortalType;
  time?: PortalTime;
  /** Words to find (each of them) in titles and words. */
  q?: string;
  /** Only what the viewer saved: posts, and a helper's saved tasks. */
  saved?: boolean;
  /** Default `hot`. */
  sort?: PortalSort;
  /** Default `feed`. */
  view?: PortalView;
  /** Default `area`; the List reads it, both views keep it. */
  group?: PortalGroup;
  /** 1-based. */
  page?: number;
}

/** The filters in effect, with defaults filled in. Unknown neighborhoods, services and words are dropped. */
export interface PortalQueryState extends PortalQuery {
  saved: boolean;
  sort: PortalSort;
  view: PortalView;
  group: PortalGroup;
  page: number;
}

/** How a task opens for this viewer: their own task's page, a helper's offer page, or the task's page. */
export type PortalTaskRelation = 'yours' | 'helper' | 'neighbor';

export interface PortalTaskView {
  task: TaskPublicView;
  /** Where the card and the row open (the server decides by `relation`). */
  href: string;
  relation: PortalTaskRelation;
  /** Visible questions on the task (its questions and answers, plan 7.9). */
  questionCount: number;
  /** The neighborhood post it came from ("Ask for help"). */
  fromPost?: { id: string; title: string };
  /** A helper's own save (find work's marks); absent for people who don't help. */
  saved?: boolean;
}

/** One thing in the stream. `at` is when it was posted. */
export type PortalItem =
  | { type: 'post'; id: string; at: ISODateTime; post: CommunityPostView }
  | { type: 'task'; id: string; at: ISODateTime; task: PortalTaskView };

/** A group of the List by neighborhood: one neighborhood, or citywide posts with remote tasks (`market`). */
export interface PortalSection {
  key: string;
  kind: 'area' | 'market';
  /** The neighborhood (absent for `market`). */
  areaSlug?: string;
  areaName?: string;
  /** The whole group's count; `items` are its first few (`PORTAL_SECTION_SIZE`). */
  count: number;
  items: PortalItem[];
}

/** A neighborhood of the market, with what's there under the other filters. */
export interface PortalArea {
  slug: string;
  name: string;
  count: number;
  /** Inside "near you". */
  nearby: boolean;
  /** The viewer's own. */
  yours: boolean;
}

/**
 * How many items each option would show, given all the other filters (each count leaves its own filter out, so
 * an option never counts itself out). Real counts, never estimates.
 */
export interface PortalFacets {
  /** Per type, and `all` for everything. */
  types: Record<PortalType | 'all', number>;
  /** Per service, and `general` for posts about no one service. Services with nothing are 0. */
  categories: Record<PortalCategory, number>;
  /** Near you and the whole market (each neighborhood's own count is in `PortalPageData.areas`). */
  nearby: number;
  all: number;
  times: Record<PortalTime, number>;
  /** What the viewer saved, under the other filters. */
  saved: number;
}

/** A helper who works in the place, for the rail and the feed's "Helpers nearby". */
export interface PortalHelper {
  handle: string;
  displayName: string;
  initials: string;
  photo?: Photo;
  headline?: string;
  areaName?: string;
  verified: boolean;
  rating?: { average: number; count: number };
  completedCount: number;
  /** Neighbors who booked them and recommended or thanked them here (plan 7.8). */
  recommendedBy: number;
  /** How fast they usually answer a new conversation (plan 7.12). */
  responseTime?: 'hour' | 'few_hours' | 'day';
  /** Ask them for help directly (the request page). */
  requestHref: string;
}

/** The context beside the stream (a rail on wide screens; inside the feed on smaller ones). */
export interface PortalRail {
  /** The viewer's open tasks, newest first (at most 3). */
  yourTasks: { id: string; title: string; href: string; offerCount: number }[];
  /** The viewer's own recent posts, latest activity first (at most 3). */
  yourPosts: { id: string; title: string; kind: CommunityPostKind; replyCount: number; lastActivityAt: ISODateTime }[];
  /** Saved posts (and a helper's saved tasks) they can still read. */
  savedCount: number;
  /** Helpers who work in the place (at most 4), most recommended first; never the viewer or anyone blocked. */
  helpers: PortalHelper[];
  /** The liveliest posts of the past week in the place (at most 5), by engagement. */
  trending: { id: string; title: string; kind: CommunityPostKind; replyCount: number; helpful: number; areaName?: string }[];
}

/** The place the page is about. */
export type PortalPlace =
  | { kind: 'nearby'; areaName: string }
  | { kind: 'market' }
  | { kind: 'area'; slug: string; name: string };

export interface PortalPageData {
  market: { slug: string; name: string; timeZone: TimeZone };
  query: PortalQueryState;
  /** Near your neighborhood, the whole market (also when we don't know your neighborhood yet), or one neighborhood. */
  place: PortalPlace;
  yourArea?: { slug: string; name: string };
  /** Every neighborhood of the market by name, with its count (the strip shows yours and the busiest nearby). */
  areas: PortalArea[];
  facets: PortalFacets;
  /**
   * The items, in order: a page of the Feed, or of the List by day (or in one neighborhood); the first few of each
   * section for the List by neighborhood (repeated in `sections`).
   */
  items: PortalItem[];
  /** The List by neighborhood across several neighborhoods: one section each (most items first), citywide last. */
  sections?: PortalSection[];
  /** Matching items across all pages and sections. */
  totalCount: number;
  /** At least 1 (always 1 with sections). */
  pageCount: number;
  /** Real numbers for the place: open tasks, posts this week, active helpers. */
  stats: { openTasks: number; postsThisWeek: number; helpers: number };
  rail: PortalRail;
  /** The composer's choices (the new-post form's). */
  composer: CommunityComposerData;
  /** The viewer, as the composer shows them. */
  me: { initials: string; photo?: Photo };
  /** Why the viewer can't post or reply yet. */
  postBlocked?: 'phone_required' | 'suspended';
  /** The viewer helps here (an active helper profile): tasks open their offer page and can be saved. */
  helps: boolean;
  /** For live updates: the neighborhoods (ids and slugs) the place covers; absent for the whole market. */
  live: { areaIds?: string[]; areaSlugs?: string[]; withRemote: boolean };
  /** Today in the market's time ("2026-11-21"), for Today and Yesterday in the List. */
  today: string;
  /** The full task board with the same service, neighborhood and time (its price and time-of-day filters live there). */
  boardHref: string;
}

/** One more page of the same stream (the Feed's "Show more", and the List by day). */
export interface PortalMore {
  items: PortalItem[];
  page: number;
  pageCount: number;
}

/**
 * - `onReact`: as on a post's page. ok `updated`. Errors: `not_found`, `rate_limited`, `not_allowed`.
 * - `onSavePost`: keep a post in Saved, or take it out. ok `updated`. Errors: `not_found`, `rate_limited`.
 * - `onSaveTask`: a helper keeps a task (find work's save). ok `updated`. Absent for people who don't help.
 * - `onPost`: the composer's post, as `CommunityNewPostHandlers.onPost` (ok `sent` with `redirectTo` the post).
 * - `onMore`: the next page, read as the page reads it; `null` when the viewer can't read the portal. Without it,
 *   "Show more" is a link to the next page.
 */
export interface PortalHandlers {
  onReact: ActionHandler<CommunityReactInput>;
  onSavePost: ActionHandler<{ postId: string; saved: boolean }>;
  onSaveTask?: ActionHandler<{ taskId: string; saved: boolean }>;
  onPost: ActionHandler<CommunityPostInput>;
  onMore?: (query: PortalQuery & { page: number }) => Promise<PortalMore | null>;
}
