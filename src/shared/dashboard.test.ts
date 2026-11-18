import { describe, expect, it } from 'vitest';
import { DASHBOARD_LIST_LIMIT, type DashboardItem, type DashboardTab } from '@/contracts';
import {
  DASHBOARD_CLIENT_NOW,
  DASHBOARD_HELPER_NOW,
  deskPublicTask,
  jordanBookingItems,
  jordanBothDashboardData,
  jordanDashboardData,
  jordanDashboardNearbyMapData,
  jordanOfferItems,
  mayaBookingItems,
  mayaDashboardData,
  mayaDashboardFilteredData,
  mayaDashboardSearchData,
  mayaOfferItems,
  mayaTaskItems,
  myOffersPageData,
  myTasksPageData,
  ruthDashboardData,
} from '@/fixtures';
import {
  composeDashboardLists,
  dashboardDateRange,
  dashboardMapHelps,
  dashboardSeeAll,
  dashboardSummary,
  dashboardTabsFor,
  filterDashboardItems,
  matchesDate,
  matchesKeyword,
  nearbyItem,
  ownTaskItem,
  parseDashboardQuery,
  resolveDashboardQuery,
  sentOfferItem,
} from './dashboard';

const ZONE = 'America/New_York';
const at = (iso: string) => new Date(iso);

describe('the dashboard query', () => {
  it('keeps known values from the URL and drops the rest', () => {
    expect(parseDashboardQuery({ tab: 'offers', view: 'map', status: 'done', date: 'week', category: 'moving-help', q: '  ikea   desk ' })).toEqual({ tab: 'offers', view: 'map', status: 'done', date: 'week', category: 'moving-help', q: 'ikea desk' });
    expect(parseDashboardQuery({ tab: 'nope', view: 'grid', status: 'all', date: 'year', category: 'plumbing', q: '   ' })).toEqual({});
    expect(parseDashboardQuery({ tab: ['bookings', 'tasks'], q: 'x'.repeat(200) }).q).toHaveLength(80);
  });

  it('orders the tabs by mode, with the other side only when the person has it', () => {
    expect(dashboardTabsFor('poster', { client: true, helper: false }, false)).toEqual(['tasks', 'offers', 'bookings']);
    expect(dashboardTabsFor('poster', { client: true, helper: false }, true)).toEqual(['tasks', 'offers', 'bookings', 'nearby']);
    expect(dashboardTabsFor('poster', { client: true, helper: true }, false)).toEqual(['tasks', 'offers', 'bookings', 'nearby']);
    expect(dashboardTabsFor('helper', { client: false, helper: true }, false)).toEqual(['bookings', 'offers', 'nearby']);
    expect(dashboardTabsFor('helper', { client: true, helper: true }, false)).toEqual(['bookings', 'offers', 'nearby', 'tasks']);
  });

  it("opens the person's first tab when the asked one isn't theirs, with the defaults filled in", () => {
    expect(resolveDashboardQuery({ tab: 'tasks' }, ['bookings', 'offers', 'nearby'])).toEqual({ tab: 'bookings', view: 'list', status: 'active', date: 'any' });
    expect(resolveDashboardQuery({ tab: 'offers', q: 'desk', category: 'furniture-assembly' }, ['tasks', 'offers'])).toEqual({ tab: 'offers', view: 'list', status: 'active', date: 'any', q: 'desk', category: 'furniture-assembly' });
  });
});

describe('the date filter', () => {
  // Tue Nov 24, 10:00 am in New York.
  const now = at(DASHBOARD_CLIENT_NOW);

  it('covers the market days from the start of today, forward', () => {
    expect(dashboardDateRange('any', 'active', now, ZONE)).toBeNull();
    expect(dashboardDateRange('today', 'active', now, ZONE)).toEqual({ from: at('2026-11-24T05:00:00.000Z'), to: at('2026-11-25T05:00:00.000Z') });
    expect(dashboardDateRange('week', 'active', now, ZONE)).toEqual({ from: at('2026-11-24T05:00:00.000Z'), to: at('2026-12-01T05:00:00.000Z') });
    expect(dashboardDateRange('month', 'open', now, ZONE)!.to).toEqual(at('2026-12-24T05:00:00.000Z'));
  });

  it('looks back for done items, through the end of today', () => {
    expect(dashboardDateRange('week', 'done', now, ZONE)).toEqual({ from: at('2026-11-18T05:00:00.000Z'), to: at('2026-11-25T05:00:00.000Z') });
    expect(dashboardDateRange('today', 'done', now, ZONE)).toEqual({ from: at('2026-11-24T05:00:00.000Z'), to: at('2026-11-25T05:00:00.000Z') });
  });

  it('keeps a window that touches the range, and a start inside it', () => {
    const range = { from: at('2026-11-24T05:00:00.000Z'), to: at('2026-11-25T05:00:00.000Z') };
    const window = (start: string, end: string) => ({ when: { start, end } }) as DashboardItem;
    const start = (value: string) => ({ when: { start: value } }) as DashboardItem;
    expect(matchesDate(window('2026-11-23T20:00:00.000Z', '2026-11-24T06:00:00.000Z'), range)).toBe(true);
    expect(matchesDate(window('2026-11-23T20:00:00.000Z', '2026-11-24T05:00:00.000Z'), range)).toBe(false);
    expect(matchesDate(start('2026-11-24T05:00:00.000Z'), range)).toBe(true);
    expect(matchesDate(start('2026-11-25T05:00:00.000Z'), range)).toBe(false);
    expect(matchesDate(start('2026-01-01T00:00:00.000Z'), null)).toBe(true);
  });
});

describe('items', () => {
  it("makes a client's task a row: its stage, offers, whether it needs them, and its own page", () => {
    const desk = mayaTaskItems.find((item) => item.key === 'task:tsk_desk')!;
    expect(desk).toMatchObject({ kind: 'task', side: 'client', stage: 'open', needsYou: true, offers: { count: 3, new: 1 }, target: { kind: 'task', taskId: 'tsk_desk' }, money: { kind: 'budget' } });
    // No offers after a day needs her too, as on My tasks (one rule for both pages).
    expect(mayaTaskItems.find((item) => item.key === 'task:tsk_fridge')).toMatchObject({ stage: 'open', needsYou: true });
    expect(mayaTaskItems.find((item) => item.key === 'task:tsk_remote_laptop' || item.target.kind === 'task' && item.target.taskId === myTasksPageData.open[1]!.id)).toMatchObject({ needsYou: false });
    // Booked: the booking's start and the helper.
    const truck = mayaTaskItems.find((item) => item.key === 'task:tsk_truck')!;
    expect(truck).toMatchObject({ stage: 'booked', needsYou: true, when: { start: '2026-11-16T15:00:00.000Z' }, person: { displayName: 'Jordan T.' } });
    expect(truck.offers).toBeUndefined();
    expect(mayaTaskItems.find((item) => item.status.kind === 'task' && item.status.status === 'completed')).toMatchObject({ stage: 'done' });
    expect(ownTaskItem(myTasksPageData.open[0]!, deskPublicTask.location).location).toEqual(deskPublicTask.location);
  });

  it("makes offers rows on both sides: new ones need the client, stale ones the helper", () => {
    expect(mayaOfferItems.map((item) => [item.key, item.needsYou, item.target.kind])).toEqual([
      ['offer_received:off_jordan', true, 'offer'],
      ['offer_received:off_sam', false, 'offer'],
      ['offer_received:off_lee', false, 'offer'],
    ]);
    const stale = sentOfferItem({ ...myOffersPageData.active[0]!, offer: { ...myOffersPageData.active[0]!.offer, status: 'stale' } });
    expect(stale).toMatchObject({ side: 'helper', stage: 'open', needsYou: true, money: { kind: 'earn' }, target: { kind: 'find_work_task' } });
    expect(jordanOfferItems.every((item) => item.status.kind === 'offer' && item.status.viewer === 'helper')).toBe(true);
    // An accepted offer became a booking (under Bookings): it's done here, so a job isn't listed twice.
    const accepted = sentOfferItem({ ...myOffersPageData.active[0]!, offer: { ...myOffersPageData.active[0]!.offer, status: 'accepted' } });
    expect(accepted).toMatchObject({ stage: 'done', needsYou: false });
  });

  it("makes bookings rows with the client's total or the helper's earnings", () => {
    expect(mayaBookingItems[0]).toMatchObject({ side: 'client', stage: 'booked', money: { kind: 'total', cents: 6600 }, person: { displayName: 'Jordan T.' } });
    expect(jordanBookingItems[0]).toMatchObject({ side: 'helper', money: { kind: 'earn', cents: 5400 } });
    expect(jordanBookingItems.at(-1)).toMatchObject({ stage: 'done' });
  });

  it("leads nearby tasks to Find work for a helper and to the public page for a client", () => {
    const now = at(DASHBOARD_HELPER_NOW);
    expect(nearbyItem(deskPublicTask, 'helper', now).target).toEqual({ kind: 'find_work_task', taskId: deskPublicTask.id });
    expect(nearbyItem(deskPublicTask, 'client', now).target).toEqual({ kind: 'public_task', slug: deskPublicTask.slug });
    expect(nearbyItem({ ...deskPublicTask, postedAt: '2026-11-21T10:00:00.000Z' }, 'helper', now).isNew).toBe(true);
    expect(nearbyItem({ ...deskPublicTask, postedAt: '2026-11-19T10:00:00.000Z' }, 'helper', now).isNew).toBeUndefined();
  });
});

describe('the filters', () => {
  const context = { now: at(DASHBOARD_CLIENT_NOW), timeZone: ZONE };
  const all = { status: 'active' as const, date: 'any' as const };

  it('shows open and booked by default, soonest first, and done ones latest first', () => {
    const active = filterDashboardItems(mayaTaskItems, all, context);
    expect(active.every((item) => item.stage !== 'done')).toBe(true);
    expect(active.map((item) => item.when.start)).toEqual([...active.map((item) => item.when.start)].sort());
    const done = filterDashboardItems([...mayaTaskItems, ...mayaBookingItems], { ...all, status: 'done' }, context);
    expect(done.length).toBeGreaterThan(0);
    expect(done.map((item) => item.when.start)).toEqual([...done.map((item) => item.when.start)].sort().reverse());
  });

  it('keeps only what needs the person, or one stage, or one category', () => {
    expect(filterDashboardItems(mayaTaskItems, { ...all, status: 'needs_you' }, context).map((item) => item.key)).toEqual(['task:tsk_truck', 'task:tsk_desk', 'task:tsk_fridge']);
    expect(filterDashboardItems(mayaTaskItems, { ...all, status: 'booked' }, context).every((item) => item.stage === 'booked')).toBe(true);
    expect(filterDashboardItems(mayaTaskItems, { ...all, category: 'yard-cleanup' }, context).every((item) => item.categorySlug === 'yard-cleanup')).toBe(true);
  });

  it('finds every word in the title, the area or the other person, whatever the case and accents', () => {
    const desk = mayaTaskItems.find((item) => item.key === 'task:tsk_desk')!;
    expect(matchesKeyword(desk, 'DESK')).toBe(true);
    expect(matchesKeyword(desk, 'desk mueller')).toBe(true);
    expect(matchesKeyword(desk, 'desk couch')).toBe(false);
    expect(matchesKeyword({ ...desk, title: 'Limpieza de baño' }, 'bano')).toBe(true);
    expect(matchesKeyword(mayaBookingItems[0]!, 'jordan')).toBe(true);
  });

  it("leaves nearby tasks' words to the board's search (it reads descriptions too)", () => {
    const nearby = [nearbyItem(deskPublicTask, 'client', context.now)];
    expect(filterDashboardItems(nearby, { ...all, q: 'words only in the description' }, { ...context, keywordApplied: true })).toHaveLength(1);
    expect(filterDashboardItems(nearby, { ...all, q: 'words only in the description' }, context)).toHaveLength(0);
  });
});

describe('the lists', () => {
  it('counts every tab under the filters and shows the current one', () => {
    expect(mayaDashboardData.tabs).toEqual([
      { id: 'tasks', count: mayaDashboardData.items.length },
      { id: 'offers', count: 3 },
      { id: 'bookings', count: 1 },
    ]);
    expect(mayaDashboardSearchData.tabs.map((tab: { id: DashboardTab }) => tab.id)).toEqual(['tasks', 'offers', 'bookings', 'nearby']);
    expect(mayaDashboardSearchData.items.map((item) => item.key)).toEqual(['task:tsk_desk']);
    expect(mayaDashboardFilteredData.items).toEqual([]);
    expect(ruthDashboardData.tabs.every((tab) => tab.count === 0)).toBe(true);
  });

  it('shows at most the list limit, and keeps the count', () => {
    const many: DashboardItem[] = Array.from({ length: DASHBOARD_LIST_LIMIT + 5 }, (_, index) => ({ ...mayaTaskItems[0]!, key: `task:${index}` }));
    const lists = composeDashboardLists(resolveDashboardQuery({}, ['tasks']), ['tasks'], { tasks: many, offers: [], bookings: [], nearby: [] }, { now: at(DASHBOARD_CLIENT_NOW), timeZone: ZONE });
    expect(lists.items).toHaveLength(DASHBOARD_LIST_LIMIT);
    expect(lists.tabs).toEqual([{ id: 'tasks', count: DASHBOARD_LIST_LIMIT + 5 }]);
  });

  it("counts what needs the person and the bookings from today on, either side", () => {
    expect(dashboardSummary(3, mayaBookingItems, at(DASHBOARD_CLIENT_NOW), ZONE)).toEqual({ needsYou: 3, upcoming: 0 });
    expect(dashboardSummary(0, jordanBookingItems, at(DASHBOARD_HELPER_NOW), ZONE)).toEqual({ needsYou: 0, upcoming: 2 });
  });

  it('offers a map only where the items are in two or more neighborhoods, and shows the list otherwise', () => {
    expect(dashboardMapHelps(jordanDashboardNearbyMapData.items)).toBe(true);
    expect(jordanDashboardNearbyMapData.query.view).toBe('map');
    const home = [ownTaskItem(myTasksPageData.open[0]!, deskPublicTask.location), ownTaskItem(myTasksPageData.open[2]!, deskPublicTask.location)];
    expect(dashboardMapHelps(home)).toBe(false);
    const lists = composeDashboardLists(resolveDashboardQuery({ view: 'map' }, ['tasks']), ['tasks'], { tasks: home, offers: [], bookings: [], nearby: [] }, { now: at(DASHBOARD_CLIENT_NOW), timeZone: ZONE });
    expect(lists).toMatchObject({ mapAvailable: false, query: { view: 'list' } });
  });

  it("holds both sides' offers for someone who has both, and the right full pages", () => {
    expect(jordanBothDashboardData.items.some((item) => item.kind === 'offer_received')).toBe(true);
    expect(jordanBothDashboardData.items.some((item) => item.kind === 'offer_sent')).toBe(true);
    expect(jordanDashboardData.seeAll).toEqual({ kind: 'bookings' });
    const words = { q: 'desk' };
    expect(dashboardSeeAll('offers', { mode: 'poster', sides: { client: true, helper: true }, words })).toEqual({ kind: 'tasks' });
    expect(dashboardSeeAll('offers', { mode: 'helper', sides: { client: true, helper: true }, words })).toEqual({ kind: 'offers' });
    expect(dashboardSeeAll('nearby', { mode: 'poster', sides: { client: true, helper: false }, market: 'gainesville', words })).toEqual({ kind: 'board', market: 'gainesville', query: words });
    expect(dashboardSeeAll('nearby', { mode: 'helper', sides: { client: false, helper: true }, market: 'gainesville', words })).toEqual({ kind: 'find_work', query: words });
  });
});
