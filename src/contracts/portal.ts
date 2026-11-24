import type { PhoneVerifyHandlers } from './account';
import type { ActionHandler, ActionResult, QueryHandler } from './actions';
import type { CategorySlug, ISODateTime, Photo, TimeZone } from './common';
import type {
  CommunityAnnouncementView,
  CommunityAreaInput,
  CommunityComposerData,
  CommunityEditInput,
  CommunityFollowInput,
  CommunityPostInput,
  CommunityPostKind,
  CommunityPostView,
  CommunityReactInput,
  CommunityReactorsView,
  CommunityReplyInput,
} from './community';
import type { PhotoUploadResult } from './posting';
import type { OfferBlockedReason } from './helper-work';
import type { OfferStatus } from './status';
import type { TaskBoardPricePreset, TaskBoardTime, TaskBoardWhen, TaskPublicView } from './tasks';

/**
 * The neighborhood portal (completion plan 9.10, docs/ui/portal-9.10.md): the community's posts and the open tasks
 * near you in one stream, shown as a Feed (cards, Nextdoor and Reddit) or a List (dense rows, Craigslist) over one
 * set of filters in one URL. Signed-in members of the market only; never indexed. Everything is read for the viewer:
 * their market and neighborhood, blocks both ways, their own reactions and saves. Tasks name their neighborhood
 * (or Remote), never anything closer.
 *
 * Two tabs of one place (owner, 2026-11-23, "Neighbors | Open tasks"): Neighbors (everything, or one kind of post) and
 * Open tasks (`type=task`), the board inside the app: its rows, sorts and filters, with the place kept across the switch.
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

/**
 * Open tasks (`type=task`, the switch's second tab, 2026-11-23) sort as the board does: `soonest` (the window's start,
 * the default), `new` (posted time), or the price either way (a fixed price, or the rate × the estimated hours).
 */
export const PORTAL_TASK_SORTS = ['soonest', 'new', 'price_high', 'price_low'] as const;
export type PortalSort = (typeof PORTAL_SORTS)[number] | (typeof PORTAL_TASK_SORTS)[number];

/** General posts, tasks, or one kind of ask or post. Without one: everything. */
export const PORTAL_TYPES = ['general', 'task', 'recommendation', 'question', 'tip', 'thanks'] as const;
export type PortalType = (typeof PORTAL_TYPES)[number];

/**
 * The post types the Show tabs offer (2026-11-23): tasks left the tabs for the Neighbors | Open tasks switch, which opens
 * `type=task` as a tab of its own; `type=task` itself stays a filter of the same page.
 */
export const PORTAL_POST_TYPES = ['general', 'recommendation', 'question', 'tip', 'thanks'] as const satisfies readonly PortalType[];

/** Posted within the last day, week or month. Without one: any time. */
export const PORTAL_TIMES = ['24h', '7d', '30d'] as const;
export type PortalTime = (typeof PORTAL_TIMES)[number];

/** The List view's groups: by neighborhood (Craigslist) or by the day things were posted. */
export const PORTAL_GROUPS = ['area', 'day'] as const;
export type PortalGroup = (typeof PORTAL_GROUPS)[number];

/** `area` for the whole market. */
export const PORTAL_ALL_AREAS = 'all';
/** `area` for what belongs to no one neighborhood: citywide posts and remote tasks (the List's "Across {market}"). */
export const PORTAL_CITYWIDE = 'citywide';
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
/** "Open tasks near you" (2026-11-23): how many of the newest open tasks the rail's card and the Feed's strip show. */
export const PORTAL_OPEN_TASKS_SHOWN = 5;

/**
 * The defaults that depend on the tab: Neighbors opens as the Feed, Hot; Open tasks as the board does, dense rows
 * (the List) by the soonest window. A default is left out of the URL, so `?type=task` alone is the Open tasks tab.
 */
export function portalDefaults(type: PortalType | undefined): { sort: PortalSort; view: PortalView } {
  return type === 'task' ? { sort: 'soonest', view: 'list' } : { sort: 'hot', view: 'feed' };
}

/** The sorts a tab offers, in order. */
export function portalSortsFor(type: PortalType | undefined): readonly PortalSort[] {
  return type === 'task' ? PORTAL_TASK_SORTS : PORTAL_SORTS;
}

/**
 * The board's own filters for Open tasks (2026-11-23), read only with `type=task`: the price (whole dollars, inclusive,
 * as the board's: a fixed price, or the rate × the estimated hours), fixed or hourly, when the window is, the time of
 * day it touches (`slots`; the board's `time`, since `time` here is when it was posted), and at most one offer so far.
 */
export interface PortalTaskFilters {
  minPrice?: number;
  maxPrice?: number;
  pricing?: 'fixed' | 'hourly';
  when?: Exclude<TaskBoardWhen, 'any'>;
  slots?: TaskBoardTime[];
  few?: boolean;
}

/** `routes.app.community(query)`. Defaults are left out of the URL. */
export interface PortalQuery extends PortalTaskFilters {
  /**
   * Absent: near you (your neighborhood, those within 3 miles, citywide posts and remote tasks). `all`: the market.
   * `citywide`: only what belongs to no neighborhood. A slug: one neighborhood.
   */
  area?: string;
  category?: PortalCategory;
  type?: PortalType;
  time?: PortalTime;
  /** Words to find (each of them) in titles and words. */
  q?: string;
  /** Only what the viewer saved: posts, and a helper's saved tasks. */
  saved?: boolean;
  /**
   * Only asks nobody has answered yet (plan 10.17): recommendation requests and questions without a reply. Tasks and
   * other posts drop out.
   */
  unanswered?: boolean;
  /** The tab's default (`portalDefaults`): `hot` on Neighbors, `soonest` on Open tasks; each tab its own sorts. */
  sort?: PortalSort;
  /** The tab's default (`portalDefaults`): `feed` on Neighbors, `list` on Open tasks. */
  view?: PortalView;
  /** Default `area`; the List reads it, both views keep it. */
  group?: PortalGroup;
  /** 1-based. */
  page?: number;
}

/** The filters in effect, with defaults filled in. Unknown neighborhoods, services and words are dropped. */
export interface PortalQueryState extends PortalQuery {
  saved: boolean;
  unanswered: boolean;
  sort: PortalSort;
  view: PortalView;
  group: PortalGroup;
  page: number;
}

/**
 * How a task opens for this viewer: their own task's page, a helper's offer page, or the task's page. The viewer's
 * own open tasks stay out of the stream (they wait in Your stuff, audit M20), so `yours` shows only where a task is
 * read on its own.
 */
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
  /**
   * For a helper, where they stand on it, as find work says it (audit M23): their latest offer (an expired, declined
   * or withdrawn one can be sent again), and why they can't offer when they can't (another service, outside their
   * area…). Absent for people who don't help.
   */
  myOffer?: { status: OfferStatus };
  blockedReason?: OfferBlockedReason;
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

/** Open tasks' own filters, counted like the rest (each leaves its own filter out). */
export interface PortalTaskFacets {
  prices: Record<TaskBoardPricePreset, number>;
  pricing: Record<'fixed' | 'hourly', number>;
  when: Record<Exclude<TaskBoardWhen, 'any'>, number>;
  slots: Record<TaskBoardTime, number>;
  /** At most one offer so far. */
  few: number;
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
  /** Asks without an answer yet, under the other filters (plan 10.17). */
  unanswered: number;
  /** On the Open tasks tab (`type=task`): the board's filters' counts. */
  tasks?: PortalTaskFacets;
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
  /**
   * "Waiting for an answer" (plan 10.17): the place's asks of the last 7 days nobody answered yet (at most 5), the
   * oldest first; for a helper, those about their own services first. Never the viewer's own.
   */
  unanswered: { id: string; title: string; kind: CommunityPostKind; createdAt: ISODateTime; areaName?: string; categorySlug?: CategorySlug }[];
}

/** The place the page is about. */
export type PortalPlace =
  | { kind: 'nearby'; areaName: string }
  | { kind: 'market' }
  /** Citywide posts and remote tasks only (`area=citywide`). */
  | { kind: 'citywide' }
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
  /**
   * The public board with the same service, neighborhoods, words and task filters: on Open tasks, "Save this search"
   * saves it for alerts (saved searches are board views).
   */
  boardHref: string;
  /**
   * "Open tasks near you" on the Neighbors tab (2026-11-23): the place's newest open tasks (at most
   * `PORTAL_OPEN_TASKS_SHOWN`; never the viewer's own) and how many are open there, for the rail's card and the Feed's
   * strip. Absent on the Open tasks tab.
   */
  openTasks?: { items: PortalTaskView[]; count: number };
  /** The card staff pinned for the market (plan 10.16), unless the viewer closed it. */
  announcement?: CommunityAnnouncementView;
  /** "Welcome to Mueller" for someone who just moved or joined (2026-11-24), until they close it. */
  welcome?: NeighborsWelcomeView;
  /**
   * We don't know the viewer's neighborhood (plan 10.15): no choice of theirs, no area they help in, no task with one.
   * The page asks for it above the stream (`areas` lists the choices).
   */
  askArea?: boolean;
  /**
   * Staff in production, where members don't see the demo marketplace on Neighbors (decisions.md 2026-11-22): whether
   * this page shows it, for the switch that turns it on or off. Absent for everyone else.
   */
  samples?: { shown: boolean };
}

/**
 * The welcome at the top of Neighbors for new movers (2026-11-24): once per move (choosing or changing their
 * neighborhood, their market changing) or when a new account joins a market, until they close it (on every device) or
 * `WELCOME_DAYS` pass. Only for the person who moved: nobody else hears about it.
 */
export interface NeighborsWelcomeView {
  /** Which welcome it is: "Got it" names it, so a page from before a newer move can't close that one. */
  id: string;
  /** The neighborhood, or the city when we only know that. */
  placeName: string;
  /** The place's best-rated active helpers (at most 4): rated first, then by rating and completed work. Never the viewer or anyone blocked. */
  helpers: PortalHelper[];
  /** The most helpful local tips (at most 3): `tip` posts near them first, then the rest of the city, most Helpful first. */
  tips: { id: string; title: string; helpfulCount: number; areaName?: string }[];
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
 * - `onCheckFresh`: of the new items the live pill heard about (`post:<id>`, `task:<id>`), the ones this viewer would
 *   see: not their own, not from someone blocked either way, still up. The pill counts only those (sweep P5).
 * - `onReply`: a reply written on a card (plan 10.3), as on the post's page (`CommunityPostHandlers.onReply`), for the
 *   post named.
 * - `onUploadPhoto`: a photo for the composer's post or a card's reply (plan 10.1).
 * - `onEdit`, `onFollow`, `onDelete`: the card's menu (plan 10.5, 10.9), as on the post's page.
 * - `onLoadReactors`: who found a post helpful or said thanks (plan 10.2).
 * - `onSetArea`: the viewer's neighborhood (plan 10.15). ok `updated`. Errors: `validation_failed` (`invalid`: not one
 *   of the market's).
 * - `onDismissAnnouncement`: close the pinned card for good (plan 10.16). ok `updated`.
 */
/** With the account page's phone steps (`PhoneVerifyHandlers`), the composer's "Verify your phone" verifies in a dialog (2026-11-23). */
export interface PortalHandlers extends Partial<PhoneVerifyHandlers> {
  onReact: ActionHandler<CommunityReactInput>;
  onSavePost: ActionHandler<{ postId: string; saved: boolean }>;
  onSaveTask?: ActionHandler<{ taskId: string; saved: boolean }>;
  onPost: ActionHandler<CommunityPostInput>;
  onMore?: (query: PortalQuery & { page: number }) => Promise<PortalMore | null>;
  onCheckFresh?: (keys: string[]) => Promise<string[]>;
  onReply?: (postId: string, input: CommunityReplyInput) => Promise<ActionResult>;
  onUploadPhoto?: QueryHandler<FormData, PhotoUploadResult>;
  onEdit?: ActionHandler<CommunityEditInput>;
  onFollow?: ActionHandler<CommunityFollowInput>;
  onDelete?: ActionHandler<{ target: 'post' | 'reply'; id: string }>;
  onLoadReactors?: QueryHandler<{ target: 'post' | 'reply'; id: string }, CommunityReactorsView | null>;
  onSetArea?: ActionHandler<CommunityAreaInput>;
  onDismissAnnouncement?: ActionHandler<{ id: string }>;
  /** "Got it" on the welcome (`welcome.id`): closed for good, on every device. ok `updated`. */
  onDismissWelcome?: ActionHandler<{ id: string }>;
  /** Staff's switch for the demo marketplace here (`samples`). ok `updated`. */
  onShowSamples?: ActionHandler<{ shown: boolean }>;
}
