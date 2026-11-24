import { z } from 'zod';
import type { QueryHandler } from './actions';
import type { AiSearchAccess, AiSearchPeriod } from './billing';
import type { Cents, CategorySlug, ISODateTime, Mode, Photo } from './common';
import type { CommunityPostKind } from './community';
import type { FindWorkQuery, FindWorkWaiting, HelperSetupState } from './helper-work';
import type { HelperBrowseQuery } from './helpers-browse';
import type { TaskLocation } from './location';
import type { PricingInput } from './money';
import type { HelperSummary } from './people';
import type { OnboardingStep } from './routes';
import type { BookingStatus, OfferStatus, TaskStatus } from './status';
import type { TaskBoardQuery } from './tasks';

/**
 * The signed-in home (`/app`, blueprint 02 §1.2; completion plan 9.9): a dashboard. What needs you first, then your
 * tasks, offers and bookings as compact lists with a few filters, a view switch (list, cards, map) and a search that
 * works without AI, plus AI search where the plan allows it. Design: docs/ui/dashboard-9.9.md. Every item, stage,
 * count and tab is decided by the app; the page shows them.
 */

/** Where an attention item leads; the UI picks the route builder by `kind`. */
export type AttentionTarget =
  | { kind: 'booking'; bookingId: string }
  | { kind: 'task'; taskId: string }
  | { kind: 'thread'; threadId: string }
  | { kind: 'messages' }
  | { kind: 'find_work_task'; taskId: string }
  | { kind: 'onboarding'; step: OnboardingStep }
  | { kind: 'earnings' }
  /** A support case on `/app/support/[caseId]` (UI-026). */
  | { kind: 'support_case'; caseId: string }
  /** An invite in the helper's offers (`routes.app.offers(inviteId)`, UI-025). */
  | { kind: 'invite'; inviteId: string }
  /** A rebooking proposal (`routes.app.proposal(proposalId)`, UI-032). */
  | { kind: 'proposal'; proposalId: string }
  /** Regular visits (`routes.app.series(seriesId)`). */
  | { kind: 'series'; seriesId: string }
  /** The account page (privacy requests, sign-in, notifications). */
  | { kind: 'account' }
  /** A client's ID check (`routes.app.verifyIdentity()`). */
  | { kind: 'verify_identity' }
  /** The helper's gift cards (`routes.app.rewards()`). */
  | { kind: 'rewards' }
  /** A community post (`routes.app.communityPost(postId)`, completion plan 7.7). */
  | { kind: 'community_post'; postId: string }
  /** A saved search's board view (`routes.app.savedSearch(searchId)`, completion plan 7.10). */
  | { kind: 'saved_search'; searchId: string }
  /** A completed booking's reviews (`routes.app.bookingReview(bookingId)`): leave yours, read theirs once published (sweep RV2, RV4). */
  | { kind: 'booking_review'; bookingId: string }
  /** The person's saved searches (`routes.app.savedSearches()`): a morning digest over several of them (sweep SS6). */
  | { kind: 'saved_searches' }
  /** Posting a task (`routes.app.newTask()`): where a city's launch message sends its clients (J-L2). */
  | { kind: 'new_task' }
  /** Neighbors (`routes.app.community()`): the weekly digest (plan 10.14). */
  | { kind: 'community' }
  /** A building or street group, open over Neighbors (`routes.app.neighborGroup(groupId)`, 2026-11-24). */
  | { kind: 'neighbor_group'; groupId: string };

export const ATTENTION_KINDS = [
  /** Client: approve the submitted work (or report a problem) before the deadline. */
  'approve_work',
  /** Client: new offers on an open task. */
  'review_offers',
  /** Client: a booking waits for payment. */
  'finish_payment',
  /** Client: a booking paid later whose charge didn't go through; pay by `dueAt`, or it's canceled (a regular visit: skipped). */
  'retry_payment',
  /** Client: the helper can't get in; answer before the deadline. */
  'answer_cant_access',
  /** Both: unread messages. */
  'unread_messages',
  /** Helper: a booking starts today; check in on the way. */
  'check_in_today',
  /** Helper: the task changed; confirm the offer again. */
  'reconfirm_offer',
  /** Helper: finish setting up to send offers. */
  'finish_setup',
  /** Helper: a payout failed; update the bank. */
  'payout_action_needed',
  /** Helper: a client's invite waits for an answer (UI-032). */
  'answer_invite',
  /** Client: the helper countered an invite; accept or decline (UI-032). */
  'answer_counter',
  /** Client: a helper proposed a booking; pay or decline (UI-032). */
  'answer_proposal',
  /** Client: an open task starts within a day and has offers; choose one (My tasks' "choose soon", plan 9.9). */
  'choose_offer',
  /** Client: an open task has had no offers for a day; invite a helper or adjust it (My tasks' "no offers"). */
  'no_offers',
  /**
   * Client: the helper hasn't checked in or sent word by the no-show time (`dueAt`: the start); message them or report a
   * no-show (sweep 2026-11-24: an overdue booking showed nothing).
   */
  'helper_not_checked_in',
] as const;
export type AttentionKind = (typeof ATTENTION_KINDS)[number];

export interface AttentionItem {
  /** Stable key for lists. */
  id: string;
  kind: AttentionKind;
  /** The task's title, when the item is about one task. */
  title?: string;
  /** How many (new offers, unread messages). */
  count?: number;
  /** When it's due (approve by, answer by, starts at). */
  dueAt?: ISODateTime;
  /** The other person, when one person is waiting on you ("Maya R." for an invite, a counter or a proposal). */
  actorName?: string;
  target: AttentionTarget;
}

// ---- The dashboard (completion plan 9.9) ----------------------------------------------------------

/**
 * The lists. `tasks`: a client's own tasks. `offers`: offers waiting on a client (on their open tasks) and offers a
 * helper sent. `bookings`: bookings on either side (a helper's jobs). `nearby`: open tasks near the person (a
 * helper's find-work matches; a client's only while searching).
 */
export const DASHBOARD_TABS = ['tasks', 'offers', 'bookings', 'nearby'] as const;
export type DashboardTab = (typeof DASHBOARD_TABS)[number];

/** How a list shows: compact rows (the default), cards, or a map of the items' general areas. */
export const DASHBOARD_VIEWS = ['list', 'cards', 'map'] as const;
export type DashboardView = (typeof DASHBOARD_VIEWS)[number];

/**
 * The status filter, by stage. `active` (the default): open and booked. `needs_you`: something to do now.
 * `open`: taking offers, or an offer waiting. `booked`: a booking (or a task booked). `done`: finished, canceled,
 * expired, declined or withdrawn, and offers that were accepted (their booking is in Bookings).
 */
export const DASHBOARD_STATUSES = ['active', 'needs_you', 'open', 'booked', 'done'] as const;
export type DashboardStatus = (typeof DASHBOARD_STATUSES)[number];

/**
 * The date filter, on the market's calendar from the start of today: `today`, the next 7 days (`week`) or the next
 * 30 (`month`). With the `done` status it looks back instead (today, the last 7 or 30 days).
 */
export const DASHBOARD_DATES = ['any', 'today', 'week', 'month'] as const;
export type DashboardDate = (typeof DASHBOARD_DATES)[number];

/**
 * The keyword's longest length, and how many rows a tab shows: the next 5 (a map, up to 20 places); the list's own
 * page has the rest ("See all").
 */
export const DASHBOARD_KEYWORD_MAX = 80;
export const DASHBOARD_LIST_LIMIT = 5;
export const DASHBOARD_MAP_LIMIT = 20;

/** `/app`'s filters, in the URL (`routes.app.home(query)`, defaults left out). */
export interface DashboardQuery {
  /** Absent: the person's first tab. */
  tab?: DashboardTab;
  /** Default `list`. */
  view?: DashboardView;
  /** Default `active`. */
  status?: DashboardStatus;
  /** Default `any`. */
  date?: DashboardDate;
  category?: CategorySlug;
  /** Words to find (each of them). */
  q?: string;
}

/** The filters in effect: the tab the app chose and the defaults filled in. */
export interface DashboardQueryState {
  tab: DashboardTab;
  view: DashboardView;
  status: DashboardStatus;
  date: DashboardDate;
  category?: CategorySlug;
  q?: string;
}

export type DashboardItemKind = 'task' | 'offer_received' | 'offer_sent' | 'booking' | 'nearby';
export type DashboardStage = 'open' | 'booked' | 'done';

/** The status badge: the UI's own status labels and tones for tasks, bookings and offers (`viewer`: which side). */
export type DashboardItemStatus =
  | { kind: 'task'; status: TaskStatus }
  | { kind: 'booking'; status: BookingStatus; viewer: 'poster' | 'helper' }
  /** `taskCanceled`: declined because the task was canceled while the offer was open (sweep D9): "Task canceled". */
  | { kind: 'offer'; status: OfferStatus; viewer: 'poster' | 'helper'; taskCanceled?: boolean };

/**
 * The money on a row. `budget`: what a task offers (the client's own, or a nearby task's). `offer`: an offer's price.
 * `total`: what the client pays for a booking. `earn`: what the helper earns (a booking, or a nearby task after the
 * service fee).
 */
export type DashboardMoney =
  | { kind: 'budget'; pricing: PricingInput }
  | { kind: 'offer'; pricing: PricingInput }
  | { kind: 'total'; cents: Cents }
  | { kind: 'earn'; cents: Cents };

/** Where a row leads; the UI builds the link with `routes`. */
export type DashboardTarget =
  /** The client's own task. */
  | { kind: 'task'; taskId: string }
  /** An offer on the client's task. */
  | { kind: 'offer'; taskId: string; offerId: string }
  | { kind: 'booking'; bookingId: string }
  /** A task from the helper's side (Find work). */
  | { kind: 'find_work_task'; taskId: string }
  /** A nearby task for a client: its public page. */
  | { kind: 'public_task'; slug: string };

export interface DashboardItem {
  /** Unique in a list: `<kind>:<id>`. */
  key: string;
  kind: DashboardItemKind;
  /** The viewer's side: their own task or a booking they pay for (`client`), or work they do or could do (`helper`). */
  side: 'client' | 'helper';
  title: string;
  categorySlug: CategorySlug;
  /** Its type under the category, when known (src/shared/task-types.ts). */
  taskType?: string;
  /** A window (tasks) or a start (bookings, offers: the proposed start). `flexible`: any time in the window. */
  when: { start: ISODateTime; end?: ISODateTime; flexible?: boolean };
  /** The general area or remote: never an address. */
  location: TaskLocation;
  stage: DashboardStage;
  /** Something to do now (new offers, payment, approval, an offer to confirm again, a booking step). */
  needsYou: boolean;
  status: DashboardItemStatus;
  money?: DashboardMoney;
  /** The other person: the helper on the client's side, the client on the helper's side. */
  person?: { displayName: string; initials: string; photo?: Photo };
  /** A client's task: its offers so far, and those not opened yet. */
  offers?: { count: number; new: number };
  /** Nearby: posted in the last 24 hours. */
  isNew?: boolean;
  target: DashboardTarget;
}

/** A tab and how many items it holds under the filters in effect. */
export interface DashboardTabSummary {
  id: DashboardTab;
  count: number;
}

/** "See all" for a tab: its full page, with the same category and words where that page has them. */
export type DashboardSeeAll =
  | { kind: 'tasks' }
  | { kind: 'offers' }
  | { kind: 'bookings' }
  | { kind: 'find_work'; query: FindWorkQuery }
  | { kind: 'board'; market: string; query: TaskBoardQuery };

/** The map view: the tiles, where to look when nothing frames it, and a helper's area. */
export interface DashboardMap {
  styleUrl: string;
  attribution: string;
  center: { lat: number; lng: number };
  serviceArea?: { name: string; center: { lat: number; lng: number }; radiusMiles: number };
}

/** `/app`. */
export interface DashboardData {
  /** For "Good morning, Maya". */
  firstName: string;
  mode: Mode;
  /** The sides the person has: the mode's always, the other one when they use it too (docs/ui/dashboard-9.9.md §3). */
  sides: { client: boolean; helper: boolean };
  /** Most urgent first; both sides' items for someone who has both. */
  attention: AttentionItem[];
  /** The header's line: how many items need the person, and bookings coming up (both sides). */
  summary: { needsYou: number; upcoming: number };
  query: DashboardQueryState;
  /** The person's tabs, in order, with their counts under the filters. */
  tabs: DashboardTabSummary[];
  /** The current tab's items under the filters: soonest first (`done`: the latest first), the first `DASHBOARD_LIST_LIMIT` (on a map, `DASHBOARD_MAP_LIMIT`). */
  items: DashboardItem[];
  /** The market's categories, for the filter. */
  categories: CategorySlug[];
  /** The current tab's full page. */
  seeAll: DashboardSeeAll;
  /** The map helps: the current tab's items (filters aside) are in two or more neighborhoods. */
  mapAvailable: boolean;
  map: DashboardMap;
  /** Helpers: earnings at a glance, once they can take work or have money on its way. */
  earnings?: { upcomingCents: Cents; onTheWayCents: Cents };
  /** Helpers: setup, when they can't send offers yet (the attention list leads to the next step). */
  setup?: HelperSetupState;
  /** Helpers waiting for their city (completion plan 8.4): shown instead of the nearby list. */
  waitingFor?: FindWorkWaiting;
  /** AI search ("describe what you need"): whether the plan allows it now (completion plan 9.13). */
  aiSearch: AiSearchAccess;
  /**
   * A client's first visit: no task posted, and no offer or booking on either side, ever (`isDashboardFirstRun`).
   * The page leads with posting a first task; the empty lists, their filters and the all-caught-up note stay out
   * until there's something to show or the person searches (journeys on a phone, J-C1).
   */
  firstRun?: boolean;
  /**
   * A helper's first visit once they can be booked: no offer sent and no booking yet, ever (`isHelperFirstRun`). The
   * page leads with finding a first task (`nearbyCount`: open tasks near them, as Find work counts them); the "nothing"
   * lines, the empty earnings, the all-caught-up note and the empty lists stay out until there's something to show or
   * the person searches (journeys on a phone, J-H9).
   */
  firstWork?: { nearbyCount: number };
  /** "From your neighbors" (plan 10.19): what's new on Neighbors near the person. Absent where there's nothing yet. */
  neighbors?: DashboardNeighbors;
}

/** The home's Neighbors card (plan 10.19): the two newest posts near the person, and the asks waiting for an answer. */
export interface DashboardNeighbors {
  /** "Mueller and nearby", one neighborhood, or the city: as Neighbors' heading names it. */
  place: { kind: 'nearby' | 'market'; name: string };
  posts: {
    id: string;
    kind: CommunityPostKind;
    title: string;
    authorName: string;
    areaName?: string;
    replyCount: number;
    createdAt: ISODateTime;
  }[];
  /** Asks of the last 7 days near them nobody answered yet (never their own). */
  unansweredCount: number;
}

// ---- AI search ("describe what you need") ---------------------------------------------------------

export const AI_SEARCH_TEXT_MIN = 3;
export const AI_SEARCH_TEXT_MAX = 300;

export const aiSearchInputSchema = z.object({ text: z.string().trim().min(AI_SEARCH_TEXT_MIN).max(AI_SEARCH_TEXT_MAX) });
export type AiSearchInput = z.infer<typeof aiSearchInputSchema>;

/** `get_help`: the person wants something done; `find_work`: a helper looking for tasks. */
export type AiSearchIntent = 'get_help' | 'find_work';

/** What AI understood from the words: the filters it searched with (the UI says it back). */
export interface AiSearchUnderstanding {
  intent: AiSearchIntent;
  category?: CategorySlug;
  /** When it's wanted, if said. */
  when?: 'today' | 'this_week' | 'this_weekend';
  /** A neighborhood of the market, if one was named. */
  area?: { slug: string; name: string };
  /** The words searched for (a few). */
  keywords: string[];
}

/**
 * The answer: real rows found with AI's filters, never invented. `draft`: a task to post (get help; the wizard opens
 * with it). `helpers`: who does this (get help), most reliable first, up to 3. `tasks`: open tasks that match, soonest
 * first, up to 5 (a helper's find-work view, a client's public page).
 */
export interface AiSearchAnswer {
  understood: AiSearchUnderstanding;
  draft?: { title: string; category: CategorySlug; describe: string };
  helpers: HelperSummary[];
  tasks: DashboardItem[];
  /** "See all" for the helpers (Find helpers) and the tasks (Find work, or the board). */
  helpersQuery?: HelperBrowseQuery;
  tasksLink?: Extract<DashboardSeeAll, { kind: 'find_work' | 'board' }>;
}

/**
 * - `too_short`: fewer than 3 characters (or more than 300).
 * - `ai_off`, `needs_plan`, `daily_limit`, `monthly_limit`: as `AiSearchAccess` (billing.ts); `remaining`, `per` and
 *   `resetsAt` are what's left after this one, as there.
 * - `prohibited`: the words describe something that can't be posted.
 * - `rate_limited`: too many searches in a short time.
 * - `unavailable`: AI didn't answer (try again, or use the keyword search).
 */
export type AiSearchResult =
  | { ok: true; answer: AiSearchAnswer; remaining: number | null; per?: AiSearchPeriod; resetsAt?: ISODateTime }
  | { ok: false; code: 'too_short' | 'ai_off' | 'needs_plan' | 'daily_limit' | 'monthly_limit' | 'prohibited' | 'rate_limited' | 'unavailable' };

/** The dashboard's handlers. `onAiSearch` runs only on an explicit click (Ask AI), never per keystroke. */
export interface DashboardHandlers {
  onAiSearch?: QueryHandler<AiSearchInput, AiSearchResult>;
}
