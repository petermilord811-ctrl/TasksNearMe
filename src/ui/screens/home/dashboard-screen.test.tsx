/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ATTENTION_KINDS, routes, type AiSearchResult, type AttentionKind, type AttentionTarget, type DashboardData, type DashboardHandlers, type DashboardTarget } from '@/contracts';
import {
  aiAnswerClientResult,
  aiAnswerHelperResult,
  DASHBOARD_CLIENT_NOW,
  DASHBOARD_HELPER_NOW,
  DESK_TIMES,
  dashboardOf,
  jordanBothDashboardData,
  jordanDashboardData,
  jordanDashboardNearbyMapData,
  jordanDashboardPayoutData,
  mayaDashboardBookingsCardsData,
  mayaDashboardCountedData,
  mayaDashboardData,
  mayaDashboardFilteredData,
  mayaDashboardMonthlyLimitData,
  mayaDashboardNeedsPlanData,
  mayaDashboardSearchData,
  myOffersPageData,
  priyaDashboardData,
  priyaDashboardWaitingData,
  ruthDashboardData,
} from '@/fixtures';
import messages from '../../../../messages/en/ui';
import enEarnings from '../../../../messages/en/ui/earnings.json';
import enHome from '../../../../messages/en/ui/home.json';
import esEarnings from '../../../../messages/es/ui/earnings.json';
import esHome from '../../../../messages/es/ui/home.json';
import { sentOfferItem } from '@/shared/dashboard';
import { TimeZoneProvider } from '@/ui/lib/time-zone-provider';
import { DashboardScreen } from './dashboard-screen';
import { dashboardTargetHref } from './links';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function renderDashboard(data: DashboardData = mayaDashboardData, options: { now?: string; handlers?: DashboardHandlers } = {}) {
  return render(<NextIntlClientProvider locale="en" messages={messages}><TimeZoneProvider timeZone="America/Chicago">
    <DashboardScreen data={data} now={options.now ?? DASHBOARD_CLIENT_NOW} liveMap={false} {...(options.handlers ? { handlers: options.handlers } : {})} />
  </TimeZoneProvider></NextIntlClientProvider>);
}

const region = (name: string | RegExp) => within(screen.getByRole('region', { name }));
const lists = () => within(screen.getByRole('navigation', { name: 'Lists' }));

const attentionCopy: Record<AttentionKind, RegExp> = {
  approve_work: /approve/i,
  review_offers: /new offers/i,
  finish_payment: /payment/i,
  retry_payment: /didn't go through/i,
  answer_cant_access: /answer|reply|respond|access/i,
  unread_messages: /unread messages/i,
  check_in_today: /starts today/i,
  reconfirm_offer: /re-confirm/i,
  finish_setup: /finish.*setup|finish setting up/i,
  payout_action_needed: /payout/i,
  answer_invite: /invited you/i,
  answer_counter: /counter/i,
  answer_proposal: /proposed a booking/i,
  choose_offer: /choose a helper/i,
  no_offers: /no offers yet/i,
};

const attentionTargets: Record<AttentionTarget['kind'], { target: AttentionTarget; href: string }> = {
  booking: { target: { kind: 'booking', bookingId: 'booking / one' }, href: routes.app.booking('booking / one') },
  task: { target: { kind: 'task', taskId: 'task / one' }, href: routes.app.task('task / one') },
  thread: { target: { kind: 'thread', threadId: 'thread / one' }, href: routes.app.thread('thread / one') },
  messages: { target: { kind: 'messages' }, href: routes.app.messages() },
  find_work_task: { target: { kind: 'find_work_task', taskId: 'task / one' }, href: routes.app.findWorkTask('task / one') },
  onboarding: { target: { kind: 'onboarding', step: 'payout' }, href: routes.app.helperOnboarding('payout') },
  earnings: { target: { kind: 'earnings' }, href: routes.app.earnings() },
  support_case: { target: { kind: 'support_case', caseId: 'case / one' }, href: routes.app.supportCase('case / one') },
  invite: { target: { kind: 'invite', inviteId: 'invite / one' }, href: routes.app.offers('invite / one') },
  proposal: { target: { kind: 'proposal', proposalId: 'proposal / one' }, href: routes.app.proposal('proposal / one') },
  series: { target: { kind: 'series', seriesId: 'series / one' }, href: routes.app.series('series / one') },
  account: { target: { kind: 'account' }, href: routes.app.account() },
  verify_identity: { target: { kind: 'verify_identity' }, href: routes.app.verifyIdentity() },
  rewards: { target: { kind: 'rewards' }, href: routes.app.rewards() },
  community_post: { target: { kind: 'community_post', postId: 'post / one' }, href: routes.app.communityPost('post / one') },
  saved_search: { target: { kind: 'saved_search', searchId: 'search / one' }, href: routes.app.savedSearch('search / one') },
  booking_review: { target: { kind: 'booking_review', bookingId: 'booking / one' }, href: routes.app.bookingReview('booking / one') },
  saved_searches: { target: { kind: 'saved_searches' }, href: routes.app.savedSearches() },
};

describe('Needs your attention', () => {
  it.each(ATTENTION_KINDS)('reads clearly for %s', (kind) => {
    renderDashboard({ ...ruthDashboardData, attention: [{ id: kind, kind, title: 'Assemble a desk', count: 2, dueAt: DESK_TIMES.approvalDue, target: { kind: 'messages' } }] });
    const link = region('Needs your attention').getByRole('link');
    expect(link).toHaveAccessibleName(attentionCopy[kind]);
    expect(link.textContent).not.toMatch(/undefined|NaN|attention\.|home\./);
  });

  it.each(Object.entries(attentionTargets))('links the %s target with the route builder', (_, { target, href }) => {
    renderDashboard({ ...ruthDashboardData, attention: [{ id: 'route', kind: 'unread_messages', count: 3, target }] });
    expect(region('Needs your attention').getByRole('link')).toHaveAttribute('href', href);
  });

  it('keeps the order given, the payout problem first, with deadlines on the market clock; past three, "Show 1 more" (audit M15)', () => {
    renderDashboard(jordanDashboardPayoutData, { now: DASHBOARD_HELPER_NOW });
    const attention = region('Needs your attention');
    const hrefs = () => attention.getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(hrefs()).toEqual([routes.app.earnings(), routes.app.booking('bkg_desk'), routes.app.findWorkTask('tsk_moving')]);
    expect(attention.getAllByRole('link')[1]).toHaveTextContent('10:30 am');
    const more = attention.getByRole('button', { name: 'Show 1 more' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(more);
    expect(hrefs()).toEqual([routes.app.earnings(), routes.app.booking('bkg_desk'), routes.app.findWorkTask('tsk_moving'), routes.app.thread('thr_bkg_desk')]);
    expect(attention.getByRole('button', { name: 'Show fewer' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('says a check-in was due once its start has passed (audit M51)', () => {
    const checkIn = jordanDashboardData.attention.find((item) => item.kind === 'check_in_today')!;
    renderDashboard({ ...jordanDashboardData, attention: [checkIn] }, { now: '2026-11-21T19:00:00.000Z' });
    const link = region('Needs your attention').getByRole('link');
    expect(link).toHaveAccessibleName(/was due to start/);
    expect(link).toHaveTextContent('Was due at 10:30 am');
    cleanup();
    renderDashboard({ ...jordanDashboardData, attention: [checkIn] }, { now: DASHBOARD_HELPER_NOW });
    expect(region('Needs your attention').getByRole('link')).toHaveAccessibleName(/starts today/);
  });

  it('says so in one line when nothing needs the person', () => {
    renderDashboard({ ...ruthDashboardData, firstRun: false });
    expect(region('Needs your attention').getByText(/You’re all caught up/)).toBeVisible();
    expect(region('Needs your attention').queryByRole('list')).not.toBeInTheDocument();
  });
});

describe('the header', () => {
  it('greets on the market clock and sums up the day', () => {
    renderDashboard(mayaDashboardData, { now: '2026-11-24T15:00:00.000Z' });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Good morning, Maya');
    expect(screen.getByText('3 things need you')).toBeVisible();
    // Her desk booking was on Saturday: none coming up.
    expect(screen.getByText('No bookings coming up')).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Earnings at a glance' })).not.toBeInTheDocument();
    cleanup();
    renderDashboard(jordanDashboardData, { now: DASHBOARD_HELPER_NOW });
    expect(screen.getByText('2 bookings coming up')).toBeVisible();
  });

  it("says 'Task canceled' on a helper's offer that the task's cancellation closed, not 'Not selected' (sweep D9)", () => {
    const [closed] = myOffersPageData.closed;
    const offers = [sentOfferItem({ ...closed!, offer: { ...closed!.offer, taskCanceled: true } })];
    renderDashboard(dashboardOf({ firstName: 'Jordan', mode: 'helper', sides: { client: false, helper: true }, attention: [], itemsOf: { offers }, now: DASHBOARD_HELPER_NOW, query: { tab: 'offers', status: 'done' } }), { now: DASHBOARD_HELPER_NOW });
    expect(screen.getByText('Task canceled')).toBeVisible();
    expect(screen.queryByText('Not selected')).not.toBeInTheDocument();
  });

  it("shows a helper's earnings at a glance, opening Earnings", () => {
    renderDashboard(jordanDashboardData, { now: DASHBOARD_HELPER_NOW });
    const earnings = region('Earnings at a glance');
    expect(earnings.getByText('$75.00')).toBeVisible();
    expect(earnings.getByText('$110.25')).toBeVisible();
    expect(earnings.getByRole('link')).toHaveAttribute('href', routes.app.earnings());
    // Earned work not paid out yet, not "Upcoming", which read as money from the bookings ahead (audit L12).
    const term = earnings.getByText('Earned, not paid out yet');
    expect(term.tagName).toBe('DT');
    expect(term.nextElementSibling).toHaveTextContent('$75.00');
  });

  it('names each glance total as the Earnings page names it, in English and Spanish (audit L12)', () => {
    for (const [home, earnings] of [[enHome, enEarnings], [esHome, esEarnings]] as const) {
      expect(home.earnings.upcoming).toBe(earnings.totals.upcoming);
      expect(home.earnings.onTheWay).toBe(earnings.totals.onTheWay);
    }
  });

  it.each([
    ['2026-11-21T17:59:00.000Z', 'morning'],
    ['2026-11-21T18:00:00.000Z', 'afternoon'],
    ['2026-11-22T00:00:00.000Z', 'evening'],
  ])('greets by Central time at %s', (now, greeting) => {
    renderDashboard(ruthDashboardData, { now });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(`Good ${greeting}, Ruth`);
  });
});

describe('the lists', () => {
  it('shows the tabs with their counts, the current one marked, each keeping the filters', () => {
    renderDashboard(mayaDashboardSearchData);
    const tabs = lists().getAllByRole('link');
    const label = { tasks: 'Tasks', offers: 'Offers', bookings: 'Bookings', nearby: 'Nearby' };
    // Named by what they show, then "items" for screen readers (the visible words are part of the name).
    for (const [index, tab] of mayaDashboardSearchData.tabs.entries()) {
      expect(tabs[index]).toHaveAccessibleName(`${label[tab.id]} ${tab.count} ${tab.count === 1 ? 'item' : 'items'}`);
    }
    expect(tabs[0]).toHaveAttribute('aria-current', 'true');
    expect(tabs[1]).toHaveAttribute('href', routes.app.home({ tab: 'offers', q: 'desk' }));
  });

  it('shows each row as a link to its page, with its status, area, time and money', () => {
    renderDashboard(mayaDashboardData);
    const rows = screen.getAllByRole('article');
    expect(rows).toHaveLength(mayaDashboardData.items.length);
    const desk = rows.find((row) => within(row).queryByRole('link', { name: 'Assemble a desk (flat-pack, 1 item)' }))!;
    expect(within(desk).getByRole('link')).toHaveAttribute('href', routes.app.task('tsk_desk'));
    expect(desk).toHaveTextContent('Open');
    expect(desk).toHaveTextContent('Needs you');
    expect(desk).toHaveTextContent('Mueller');
    expect(desk).toHaveTextContent('3 offers · 1 new');
    expect(desk).toHaveTextContent('$60.00');
    for (const row of rows) expect(row.textContent).not.toMatch(/undefined|NaN|home\.|item\./);
  });

  it('links every kind of row with the route builders', () => {
    const cases: [DashboardTarget, string][] = [
      [{ kind: 'task', taskId: 't 1' }, routes.app.task('t 1')],
      [{ kind: 'offer', taskId: 't 1', offerId: 'o 1' }, routes.app.offer('t 1', 'o 1')],
      [{ kind: 'booking', bookingId: 'b 1' }, routes.app.booking('b 1')],
      [{ kind: 'find_work_task', taskId: 't 1' }, routes.app.findWorkTask('t 1')],
      [{ kind: 'public_task', slug: 'a-desk' }, routes.publicTask('a-desk')],
    ];
    for (const [target, href] of cases) expect(dashboardTargetHref(target)).toBe(href);
  });

  it('names the other person by their side: the helper for a client, the client for a helper', () => {
    renderDashboard(jordanBothDashboardData, { now: DASHBOARD_HELPER_NOW });
    const rows = screen.getAllByRole('article');
    expect(rows.some((row) => /Helper: Sam/.test(row.textContent ?? ''))).toBe(true);
    expect(rows.some((row) => /Client: Maya/.test(row.textContent ?? ''))).toBe(true);
  });

  it('shows cards, and the full page with the count when there are more', () => {
    renderDashboard(mayaDashboardBookingsCardsData);
    expect(screen.getAllByRole('article')).toHaveLength(mayaDashboardBookingsCardsData.items.length);
    expect(screen.getByRole('link', { name: 'See all bookings' })).toHaveAttribute('href', routes.app.bookings());
    cleanup();
    renderDashboard({ ...mayaDashboardData, tabs: mayaDashboardData.tabs.map((tab) => (tab.id === 'tasks' ? { ...tab, count: 34 } : tab)) });
    expect(screen.getByText(`Showing ${mayaDashboardData.items.length} of 34`)).toBeVisible();
  });

  it('offers the map only where it helps, and draws the areas with remote items counted', () => {
    renderDashboard({ ...ruthDashboardData, firstRun: false, mapAvailable: false });
    const views = within(screen.getByRole('group', { name: 'Show as' }));
    expect(views.getAllByRole('link').map((link) => link.textContent)).toEqual(['List', 'Cards']);
    cleanup();
    renderDashboard(jordanDashboardNearbyMapData, { now: DASHBOARD_HELPER_NOW });
    expect(within(screen.getByRole('group', { name: 'Show as' })).getByRole('link', { name: 'Map' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByText(/Exact addresses are never shown on the map/)).toBeVisible();
  });

  it('changes a filter in the URL, keeping the rest, and clears them', () => {
    renderDashboard(mayaDashboardSearchData);
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'done' } });
    expect(navigation.push).toHaveBeenCalledWith(routes.app.home({ tab: 'tasks', status: 'done', q: 'desk' }), { scroll: false });
    // A second choice before the first one's page arrives keeps it (sweep D12: the choice shows at once).
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'moving-help' } });
    expect(navigation.push).toHaveBeenLastCalledWith(routes.app.home({ tab: 'tasks', status: 'done', category: 'moving-help', q: 'desk' }), { scroll: false });
    cleanup();
    renderDashboard(mayaDashboardFilteredData);
    expect(screen.getByLabelText('Date')).toHaveDisplayValue('Last 7 days');
    expect(screen.getAllByRole('link', { name: /Clear filters/ })[0]).toHaveAttribute('href', routes.app.home({ tab: 'tasks' }));
  });
});

describe('a first visit (journeys on a phone, J-C1)', () => {
  it('leads with posting a first task, without "nothing" lines, empty lists, filters or See all', () => {
    renderDashboard(ruthDashboardData);
    const card = region('Post your first task');
    expect(card.getByRole('link', { name: 'Post a task' })).toHaveAttribute('href', routes.app.newTask());
    expect(card.getByRole('link', { name: 'Find helpers' })).toHaveAttribute('href', routes.app.helpers());
    expect(screen.queryByText('Nothing needs you right now')).not.toBeInTheDocument();
    expect(screen.queryByText('No bookings coming up')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Needs your attention' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Your tasks, offers and bookings' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Show as' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /See all/ })).not.toBeInTheDocument();
    // The search stays: it's another way in.
    expect(screen.getByRole('search')).toBeInTheDocument();
  });

  it('still shows what needs the person, and the lists while searching', () => {
    renderDashboard({ ...ruthDashboardData, attention: [{ id: 'route', kind: 'unread_messages', count: 1, target: { kind: 'messages' } }] });
    expect(region('Needs your attention').getByRole('link')).toBeVisible();
    cleanup();
    renderDashboard({ ...ruthDashboardData, query: { ...ruthDashboardData.query, q: 'desk' } });
    expect(screen.getByRole('region', { name: 'Your tasks, offers and bookings' })).toBeInTheDocument();
  });
});

describe('empty lists', () => {
  it('says how each list fills up for a client with nothing in it now, with the first step', () => {
    renderDashboard({ ...ruthDashboardData, firstRun: false });
    expect(screen.getByRole('heading', { name: 'No tasks yet' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Post a task' })).toHaveAttribute('href', routes.app.newTask());
  });

  it('tells filters that match nothing from a search that finds nothing', () => {
    renderDashboard(mayaDashboardFilteredData);
    expect(screen.getByRole('heading', { name: 'Nothing matches these filters' })).toBeVisible();
    cleanup();
    renderDashboard({ ...mayaDashboardSearchData, items: [], query: { ...mayaDashboardSearchData.query, q: 'piano' } });
    expect(screen.getByRole('heading', { name: 'No matches for “piano”' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Post a task: “piano”' })).toHaveAttribute('href', routes.app.newTask({ describe: 'piano' }));
  });

  it('shows a helper waiting for their city the waiting note, and nearby waits for the city', () => {
    renderDashboard(priyaDashboardWaitingData, { now: DASHBOARD_HELPER_NOW });
    expect(screen.getByRole('heading', { name: "We're not in Pretty Prairie yet" })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Tasks show here once Pretty Prairie opens' })).toBeVisible();
    // The next setup step is in Needs your attention; no earnings of $0.00 yet.
    expect(region('Needs your attention').getByRole('link', { name: /Finish setting up/ })).toHaveAttribute('href', routes.app.helperOnboarding('identity'));
    expect(screen.queryByRole('region', { name: 'Earnings at a glance' })).not.toBeInTheDocument();
  });

  it('links the setup step for a helper who is not set up (once), and lists tasks to browse', () => {
    renderDashboard(priyaDashboardData, { now: DASHBOARD_HELPER_NOW });
    expect(screen.getAllByRole('link', { name: /Finish setting up/ })).toHaveLength(1);
    expect(region('Needs your attention').getByRole('link', { name: /Finish setting up/ })).toHaveAttribute('href', routes.app.helperOnboarding('identity'));
    expect(screen.getAllByRole('article').length).toBe(priyaDashboardData.items.length);
  });
});

describe('search', () => {
  it('searches the words through the URL, keeping the list as it is', () => {
    renderDashboard({ ...mayaDashboardData, query: { ...mayaDashboardData.query, tab: 'offers', status: 'done' } });
    const search = screen.getByRole('search');
    expect(search).toHaveAttribute('action', routes.app.home());
    expect(within(search).getByDisplayValue('offers')).toHaveAttribute('name', 'tab');
    expect(within(search).getByDisplayValue('done')).toHaveAttribute('name', 'status');
    fireEvent.change(within(search).getByRole('searchbox'), { target: { value: '  ikea   desk ' } });
    fireEvent.submit(search);
    expect(navigation.push).toHaveBeenCalledWith(routes.app.home({ tab: 'offers', status: 'done', q: 'ikea desk' }), { scroll: false });
  });

  it('asks AI on a click and shows what it found: a draft, helpers and similar tasks', async () => {
    const onAiSearch = vi.fn(async () => aiAnswerClientResult);
    renderDashboard(mayaDashboardCountedData, { handlers: { onAiSearch } });
    expect(screen.getByText(/^4 AI searches left this month · renews Tue, Dec 1$/)).toBeVisible();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'my new IKEA desk this weekend near Mueller' } });
    fireEvent.click(screen.getByRole('button', { name: /Ask AI/ }));
    expect(onAiSearch).toHaveBeenCalledWith({ text: 'my new IKEA desk this weekend near Mueller' });
    const answer = await screen.findByRole('region', { name: 'What AI found' });
    const understood = within(within(answer).getByText('Looking for').parentElement!);
    expect(understood.getByText('Furniture assembly')).toBeVisible();
    expect(understood.getByText('This weekend')).toBeVisible();
    expect(understood.getByText('Near Mueller')).toBeVisible();
    expect(within(answer).getByRole('link', { name: /Use this draft/ })).toHaveAttribute('href', routes.app.newTask({ category: 'furniture-assembly', title: 'Assemble an IKEA desk', describe: 'My new IKEA desk needs assembling this weekend near Mueller.' }));
    expect(within(answer).getByRole('link', { name: 'Jordan T.' })).toHaveAttribute('href', routes.helperProfile('jordan-t'));
    expect(within(answer).getByRole('link', { name: 'See all helpers' })).toHaveAttribute('href', routes.app.helpers({ category: 'furniture-assembly', area: 'mueller' }));
    expect(within(answer).getByText(/AI suggestions can be wrong/)).toBeVisible();
    await waitFor(() => expect(screen.getByText(/^11 AI searches left this month · renews/)).toBeVisible());
    fireEvent.click(within(answer).getByRole('button', { name: 'Close the AI answer' }));
    expect(screen.queryByRole('region', { name: 'What AI found' })).not.toBeInTheDocument();
  });

  it("shows a helper the tasks AI found, and Find work's full list", async () => {
    renderDashboard(jordanDashboardData, { now: DASHBOARD_HELPER_NOW, handlers: { onAiSearch: async () => aiAnswerHelperResult } });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'moving work this weekend' } });
    fireEvent.click(screen.getByRole('button', { name: /Ask AI/ }));
    const answer = await screen.findByRole('region', { name: 'What AI found' });
    expect(within(answer).getByRole('heading', { name: 'Open tasks that match' })).toBeVisible();
    expect(within(answer).getByRole('link', { name: 'See more in Find work' })).toHaveAttribute('href', routes.app.findWork({ category: 'moving-help', when: 'this_weekend' }));
    expect(within(answer).queryByRole('link', { name: /Use this draft/ })).not.toBeInTheDocument();
  });

  it.each([
    [{ ok: false, code: 'too_short' }, /a few more words/],
    [{ ok: false, code: 'prohibited' }, /can’t be booked/],
    [{ ok: false, code: 'rate_limited' }, /Wait a minute/],
    [{ ok: false, code: 'unavailable' }, /couldn’t answer/],
    [{ ok: false, code: 'needs_plan' }, /comes with a plan/],
    [{ ok: false, code: 'monthly_limit' }, /used this month’s/],
    [{ ok: false, code: 'ai_off' }, /isn’t available/],
  ] as [AiSearchResult, RegExp][])('explains %o', async (result, message) => {
    renderDashboard(mayaDashboardData, { handlers: { onAiSearch: async () => result } });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'a desk please' } });
    fireEvent.click(screen.getByRole('button', { name: /Ask AI/ }));
    expect(await within(await screen.findByRole('region', { name: 'What AI found' })).findByRole('alert')).toHaveTextContent(message);
  });

  it("checks the words' length before asking, and treats a failed call as unavailable", async () => {
    const onAiSearch = vi.fn(async (): Promise<AiSearchResult> => { throw new Error('network'); });
    renderDashboard(mayaDashboardData, { handlers: { onAiSearch } });
    fireEvent.click(screen.getByRole('button', { name: /Ask AI/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/a few more words/);
    expect(onAiSearch).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'a desk please' } });
    fireEvent.click(screen.getByRole('button', { name: /Ask AI/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/couldn’t answer/));
  });

  it('offers only Search without AI, and a line to the plan when it needs one', () => {
    renderDashboard(mayaDashboardData);
    expect(screen.queryByRole('button', { name: /Ask AI/ })).not.toBeInTheDocument();
    cleanup();
    renderDashboard(mayaDashboardNeedsPlanData, { handlers: { onAiSearch: async () => aiAnswerClientResult } });
    expect(screen.queryByRole('button', { name: /Ask AI/ })).not.toBeInTheDocument();
    expect(screen.getByText(/It comes with a plan/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'See plans' })).toHaveAttribute('href', routes.app.plan());
    cleanup();
    renderDashboard(mayaDashboardMonthlyLimitData, { handlers: { onAiSearch: async () => aiAnswerClientResult } });
    expect(screen.getByText(/They renew Mon, Nov 30|They renew/)).toBeVisible();
  });
});
