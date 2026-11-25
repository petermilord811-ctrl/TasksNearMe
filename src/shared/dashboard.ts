import {
  CATEGORY_SLUGS,
  DASHBOARD_DATES,
  DASHBOARD_KEYWORD_MAX,
  DASHBOARD_LIST_LIMIT,
  DASHBOARD_MAP_LIMIT,
  DASHBOARD_STATUSES,
  DASHBOARD_TABS,
  DASHBOARD_VIEWS,
  type BookingListRow,
  type CategorySlug,
  type DashboardDate,
  type DashboardItem,
  type DashboardQuery,
  type DashboardQueryState,
  type DashboardSeeAll,
  type DashboardStage,
  type DashboardStatus,
  type DashboardTab,
  type DashboardTabSummary,
  type Mode,
  type MyOfferRow,
  type OfferStatus,
  type OwnerTaskRow,
  type Photo,
  type PricingInput,
  type TaskLocation,
  type TaskPublicView,
  type TaskStatus,
  type TimeZone,
} from '@/contracts';
import { marketDayKey, marketLocalToUtc } from '@/shared/format';

/**
 * The signed-in dashboard's rules as plain functions (completion plan 9.9, docs/ui/dashboard-9.9.md): which tabs a
 * person has, each kind of row as one `DashboardItem`, and the filters (status, date, category, words). The server
 * (src/modules/home/dashboard.ts) composes the lists with them, and the fixtures use the same ones, so previews show
 * what the app would.
 */

type SearchParams = Record<string, string | string[] | undefined>;

const one = (params: SearchParams, key: string) => {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
};
const pick = <T extends string>(options: readonly T[], value: string | undefined): T | undefined =>
  value !== undefined && (options as readonly string[]).includes(value) ? (value as T) : undefined;

/** `/app`'s search params as a query: unknown values are dropped, the words trimmed to their limit. */
export function parseDashboardQuery(params: SearchParams): DashboardQuery {
  const query: DashboardQuery = {};
  const tab = pick(DASHBOARD_TABS, one(params, 'tab'));
  if (tab) query.tab = tab;
  const view = pick(DASHBOARD_VIEWS, one(params, 'view'));
  if (view) query.view = view;
  const status = pick(DASHBOARD_STATUSES, one(params, 'status'));
  if (status) query.status = status;
  const date = pick(DASHBOARD_DATES, one(params, 'date'));
  if (date) query.date = date;
  const category = pick(CATEGORY_SLUGS, one(params, 'category'));
  if (category) query.category = category;
  const q = one(params, 'q')?.replace(/\s+/g, ' ').slice(0, DASHBOARD_KEYWORD_MAX).trim();
  if (q) query.q = q;
  return query;
}

/**
 * The person's tabs, in order (docs/ui/dashboard-9.9.md §3). "I need help": tasks, offers, bookings, then nearby
 * for someone who also helps (or while searching). "I can help": bookings, offers, nearby, then their own tasks
 * when they post too.
 */
export function dashboardTabsFor(mode: Mode, sides: { client: boolean; helper: boolean }, searching: boolean): DashboardTab[] {
  if (mode === 'helper') return ['bookings', 'offers', 'nearby', ...(sides.client ? (['tasks'] as const) : [])];
  return ['tasks', 'offers', 'bookings', ...(sides.helper || searching ? (['nearby'] as const) : [])];
}

/** The filters in effect: the asked tab when the person has it (else their first), and the defaults. */
export function resolveDashboardQuery(query: DashboardQuery, tabs: readonly DashboardTab[]): DashboardQueryState {
  const tab = query.tab && tabs.includes(query.tab) ? query.tab : tabs[0]!;
  return {
    tab,
    view: query.view ?? 'list',
    status: query.status ?? 'active',
    date: query.date ?? 'any',
    ...(query.category ? { category: query.category } : {}),
    ...(query.q ? { q: query.q } : {}),
  };
}

function addDays(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const SPAN_DAYS: Record<Exclude<DashboardDate, 'any'>, number> = { today: 1, week: 7, month: 30 };

/**
 * The time a date filter covers, on the market's calendar: from the start of today, 1, 7 or 30 days ahead; with the
 * `done` status, back instead, through the end of today.
 */
export function dashboardDateRange(date: DashboardDate, status: DashboardStatus, now: Date, timeZone: TimeZone): { from: Date; to: Date } | null {
  if (date === 'any') return null;
  const today = marketDayKey(now, timeZone);
  const startOf = (dayKey: string) => new Date(marketLocalToUtc(dayKey, '00:00', timeZone));
  const span = SPAN_DAYS[date];
  return status === 'done'
    ? { from: startOf(addDays(today, 1 - span)), to: startOf(addDays(today, 1)) }
    : { from: startOf(today), to: startOf(addDays(today, span)) };
}

/** Folds case and accents ("Mañana" finds "manana"). */
const fold = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Each word in the title, the area or the other person's name. */
export function matchesKeyword(item: DashboardItem, q: string): boolean {
  const haystack = fold([item.title, item.location.kind === 'local' ? item.location.areaName : '', item.person?.displayName ?? ''].join(' '));
  return fold(q).split(/\s+/).filter(Boolean).every((word) => haystack.includes(word));
}

export function matchesStatus(item: DashboardItem, status: DashboardStatus): boolean {
  switch (status) {
    case 'active': return item.stage !== 'done';
    case 'needs_you': return item.needsYou && item.stage !== 'done';
    default: return item.stage === status;
  }
}

/** A window touches the range; a start is in it. */
export function matchesDate(item: DashboardItem, range: { from: Date; to: Date } | null): boolean {
  if (!range) return true;
  const start = Date.parse(item.when.start);
  const end = item.when.end ? Date.parse(item.when.end) : start;
  return item.when.end ? start < range.to.getTime() && end > range.from.getTime() : start >= range.from.getTime() && start < range.to.getTime();
}

export interface DashboardFilterContext {
  now: Date;
  timeZone: TimeZone;
  /** The words were already applied where the rows came from (nearby: the board's search, which reads descriptions too). */
  keywordApplied?: boolean;
}

/** The items under the filters in effect, in the list's order: soonest first, or the latest first for `done`. */
export function filterDashboardItems(items: readonly DashboardItem[], query: Pick<DashboardQueryState, 'status' | 'date' | 'category' | 'q'>, context: DashboardFilterContext): DashboardItem[] {
  const range = dashboardDateRange(query.date, query.status, context.now, context.timeZone);
  const kept = items.filter((item) =>
    matchesStatus(item, query.status)
    && matchesDate(item, range)
    && (!query.category || item.categorySlug === query.category)
    && (!query.q || context.keywordApplied || matchesKeyword(item, query.q)));
  const time = (item: DashboardItem) => Date.parse(item.when.start);
  return kept.sort((a, b) => (query.status === 'done' ? time(b) - time(a) : time(a) - time(b)) || a.key.localeCompare(b.key));
}

/**
 * The header's line: how many things need the person (the attention list), and bookings coming up: booked, on either
 * side, starting today or later on the market's calendar.
 */
export function dashboardSummary(attentionCount: number, bookings: readonly DashboardItem[], now: Date, timeZone: TimeZone): { needsYou: number; upcoming: number } {
  const today = dashboardDateRange('today', 'active', now, timeZone)!.from.getTime();
  return { needsYou: attentionCount, upcoming: bookings.filter((item) => item.stage === 'booked' && Date.parse(item.when.start) >= today).length };
}

/**
 * "Coming up" on Home (2026-11-25): the bookings still ahead, the same ones the summary counts (booked, from today on),
 * soonest first, the first `limit`.
 */
export function dashboardUpNext(bookings: readonly DashboardItem[], now: Date, timeZone: TimeZone, limit: number): DashboardItem[] {
  const today = dashboardDateRange('today', 'active', now, timeZone)!.from.getTime();
  return bookings
    .filter((item) => item.stage === 'booked' && Date.parse(item.when.start) >= today)
    .sort((a, b) => Date.parse(a.when.start) - Date.parse(b.when.start))
    .slice(0, limit);
}

/**
 * A client's first visit (journeys on a phone, J-C1): no task posted, and no offer or booking on either side, ever. The
 * page then leads with posting a first task instead of empty lists, filters and an all-caught-up note.
 */
export function isDashboardFirstRun(mode: Mode, sides: { client: boolean; helper: boolean }, itemsOf: Readonly<Record<'tasks' | 'offers' | 'bookings', readonly DashboardItem[]>>): boolean {
  return mode === 'poster' && !sides.helper && itemsOf.tasks.length === 0 && itemsOf.offers.length === 0 && itemsOf.bookings.length === 0;
}

/**
 * A helper's first visit once they can be booked (journeys on a phone, J-H9): no offer sent and no booking, ever. The page
 * then leads with finding a first task instead of "nothing" lines, empty earnings and empty lists.
 */
export function isHelperFirstRun(mode: Mode, bookable: boolean, itemsOf: Readonly<Record<'offers' | 'bookings', readonly DashboardItem[]>>): boolean {
  return mode === 'helper' && bookable && itemsOf.offers.length === 0 && itemsOf.bookings.length === 0;
}

/** A map helps when the items are in two or more neighborhoods (a client's own tasks at home don't need one). */
export function dashboardMapHelps(items: readonly DashboardItem[]): boolean {
  return new Set(items.flatMap((item) => (item.location.kind === 'local' ? [item.location.areaName] : []))).size >= 2;
}

/**
 * The lists under the filters in effect: each tab's count, the current tab's first rows, and whether a map helps (the
 * tab's items, filters aside, in two or more neighborhoods; a map asked for where none helps shows the list). Nearby
 * rows come with the words already applied (the board's search reads descriptions too).
 */
export function composeDashboardLists(
  state: DashboardQueryState,
  tabs: readonly DashboardTab[],
  itemsOf: Record<DashboardTab, readonly DashboardItem[]>,
  context: Pick<DashboardFilterContext, 'now' | 'timeZone'>,
): { query: DashboardQueryState; tabs: DashboardTabSummary[]; items: DashboardItem[]; mapAvailable: boolean } {
  const filtered = (tab: DashboardTab) => filterDashboardItems(itemsOf[tab], state, { ...context, keywordApplied: tab === 'nearby' });
  const current = filtered(state.tab);
  const mapAvailable = dashboardMapHelps(itemsOf[state.tab]);
  const view = state.view === 'map' && !mapAvailable ? 'list' : state.view;
  return {
    query: { ...state, view },
    tabs: tabs.map((id) => ({ id, count: id === state.tab ? current.length : filtered(id).length })),
    items: current.slice(0, view === 'map' ? DASHBOARD_MAP_LIMIT : DASHBOARD_LIST_LIMIT),
    mapAvailable,
  };
}

/**
 * A tab's full page: the tasks page, the offers page (a helper's; a client's offers are on their tasks), the bookings,
 * and for nearby, Find work (a helper) or the market's board (a client), with the same category and words.
 */
export function dashboardSeeAll(
  tab: DashboardTab,
  context: { mode: Mode; sides: { client: boolean; helper: boolean }; market?: string; words: { category?: CategorySlug; q?: string } },
): DashboardSeeAll {
  switch (tab) {
    case 'tasks': return { kind: 'tasks' };
    case 'offers': return context.mode === 'helper' || !context.sides.client ? { kind: 'offers' } : { kind: 'tasks' };
    case 'bookings': return { kind: 'bookings' };
    case 'nearby': return context.sides.helper || !context.market ? { kind: 'find_work', query: context.words } : { kind: 'board', market: context.market, query: context.words };
  }
}

type Person = { displayName: string; initials: string; photo?: Photo };
const personOf = (person: Person): Person => ({ displayName: person.displayName, initials: person.initials, ...(person.photo ? { photo: person.photo } : {}) });

const TASK_STAGES: Record<TaskStatus, DashboardStage> = { draft: 'open', open: 'open', assigned: 'booked', completed: 'done', canceled: 'done', expired: 'done' };
// An accepted offer has done its job: it became a booking, which the Bookings list holds (so it isn't there twice).
const OFFER_STAGES: Record<OfferStatus, DashboardStage> = { pending: 'open', stale: 'open', accepted: 'done', declined: 'done', withdrawn: 'done', expired: 'done' };

/**
 * A client's own task. `location` comes from the task's public view (the owner's row has none). It needs them when My
 * tasks says so (its "needs you": new offers, a choice to make soon, no offers after a day, a payment, work to review).
 */
export function ownTaskItem(row: OwnerTaskRow, location: TaskLocation, taskType?: string): DashboardItem {
  const booked = row.booking && row.status === 'assigned';
  return {
    key: `task:${row.id}`,
    kind: 'task',
    side: 'client',
    title: row.title,
    categorySlug: row.categorySlug,
    ...(taskType ? { taskType } : {}),
    when: booked ? { start: row.booking!.start } : { start: row.schedule.windowStart, end: row.schedule.windowEnd, ...(row.schedule.flexible ? { flexible: true } : {}) },
    location,
    stage: TASK_STAGES[row.status],
    needsYou: Boolean(row.attention),
    status: { kind: 'task', status: row.status },
    money: { kind: 'budget', pricing: row.budget },
    ...(row.booking ? { person: personOf(row.booking.helper) } : {}),
    ...(row.status === 'open' ? { offers: { count: row.offerCount, new: row.newOfferCount } } : {}),
    target: { kind: 'task', taskId: row.id },
  };
}

/** An offer on a client's open task: it needs them while they haven't opened it. */
export function receivedOfferItem(input: {
  offer: { id: string; status: OfferStatus; pricing: PricingInput; proposedStart: string; isNew: boolean };
  task: { id: string; title: string; categorySlug: CategorySlug; taskType?: string; location: TaskLocation };
  helper: Person;
}): DashboardItem {
  const { offer, task } = input;
  return {
    key: `offer_received:${offer.id}`,
    kind: 'offer_received',
    side: 'client',
    title: task.title,
    categorySlug: task.categorySlug,
    ...(task.taskType ? { taskType: task.taskType } : {}),
    when: { start: offer.proposedStart },
    location: task.location,
    stage: OFFER_STAGES[offer.status],
    needsYou: offer.isNew && OFFER_STAGES[offer.status] === 'open',
    status: { kind: 'offer', status: offer.status, viewer: 'poster' },
    money: { kind: 'offer', pricing: offer.pricing },
    person: personOf(input.helper),
    target: { kind: 'offer', taskId: task.id, offerId: offer.id },
  };
}

/** An offer the helper sent: a stale one (the task changed) needs confirming again. */
export function sentOfferItem(row: MyOfferRow): DashboardItem {
  return {
    key: `offer_sent:${row.offer.id}`,
    kind: 'offer_sent',
    side: 'helper',
    title: row.task.title,
    categorySlug: row.task.categorySlug,
    ...(row.task.taskType ? { taskType: row.task.taskType } : {}),
    when: { start: row.offer.proposedStart },
    location: row.task.location,
    stage: OFFER_STAGES[row.offer.status],
    needsYou: row.offer.status === 'stale',
    status: { kind: 'offer', status: row.offer.status, viewer: 'helper', ...(row.offer.taskCanceled ? { taskCanceled: true } : {}) },
    money: { kind: 'earn', cents: row.offer.breakdown.helperEarningsCents },
    person: personOf(row.task.poster),
    target: { kind: 'find_work_task', taskId: row.task.id },
  };
}

/** A booking on either side: what the client pays, or what the helper earns. */
export function bookingItem(row: BookingListRow): DashboardItem {
  const done = row.status === 'completed' || row.status === 'canceled';
  return {
    key: `booking:${row.id}`,
    kind: 'booking',
    side: row.viewerRole === 'poster' ? 'client' : 'helper',
    title: row.title,
    categorySlug: row.categorySlug,
    when: { start: row.start },
    location: row.location,
    stage: done ? 'done' : 'booked',
    needsYou: row.needsAction && !done,
    status: { kind: 'booking', status: row.status, viewer: row.viewerRole },
    money: row.viewerRole === 'poster' ? { kind: 'total', cents: row.amountCents } : { kind: 'earn', cents: row.amountCents },
    person: personOf(row.otherParty),
    target: { kind: 'booking', bookingId: row.id },
  };
}

/** An open task nearby: a helper's match (Find work) or, for a client searching, its public page. */
export function nearbyItem(task: TaskPublicView, side: 'client' | 'helper', now: Date): DashboardItem {
  return {
    key: `nearby:${task.id}`,
    kind: 'nearby',
    side,
    title: task.title,
    categorySlug: task.categorySlug,
    ...(task.taskType ? { taskType: task.taskType } : {}),
    when: { start: task.schedule.windowStart, end: task.schedule.windowEnd, ...(task.schedule.flexible ? { flexible: true } : {}) },
    location: task.location,
    stage: 'open',
    needsYou: false,
    status: { kind: 'task', status: task.status },
    money: { kind: 'budget', pricing: task.budget },
    ...(now.getTime() - Date.parse(task.postedAt) < 24 * 3_600_000 ? { isNew: true } : {}),
    target: side === 'helper' ? { kind: 'find_work_task', taskId: task.id } : { kind: 'public_task', slug: task.slug },
  };
}
