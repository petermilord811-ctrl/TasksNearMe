/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ATTENTION_KINDS, routes, type AppHomePageData, type AttentionKind, type AttentionTarget } from '@/contracts';
import { DESK_TIMES, jordanHomeData, jordanHomeInviteData, jordanHomePayoutActionData, mayaHomeCounterData, mayaHomeData, mayaHomeProposalData, posterHomeEmptyData, priyaHomeData, priyaHomeWaitingData } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { HomeScreen } from './home-screen';
import { TimeZoneProvider } from '@/ui/lib/time-zone-provider';

afterEach(cleanup);

const now = '2026-11-21T16:00:00.000Z';

function renderHome(data: AppHomePageData = mayaHomeData, at = now) {
  return render(<NextIntlClientProvider locale="en" messages={messages}><TimeZoneProvider timeZone="America/Chicago"><HomeScreen data={data} now={at} /></TimeZoneProvider></NextIntlClientProvider>);
}

function section(name: string) {
  return within(screen.getByRole('region', { name }));
}

const attentionCopy: Record<AttentionKind, RegExp> = {
  approve_work: /approve/i,
  review_offers: /new offers/i,
  finish_payment: /payment/i,
  answer_cant_access: /answer|reply|respond/i,
  unread_messages: /unread messages/i,
  check_in_today: /starts today/i,
  reconfirm_offer: /re-confirm/i,
  finish_setup: /finish.*setup|finish setting up/i,
  payout_action_needed: /payout/i,
  answer_invite: /invited you/i,
  answer_counter: /counter/i,
  answer_proposal: /proposed a booking/i,
};

const targetCases: Record<AttentionTarget['kind'], { target: AttentionTarget; href: string }> = {
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
};

describe('HomeScreen attention', () => {
  it.each([
    { data: jordanHomeInviteData, name: /^Maya R\. invited you/, href: routes.app.offers('inv_bookshelf'), deadline: 'Thu, Dec 10 · 10:00 am' },
    { data: mayaHomeCounterData, name: /^Jordan T\. sent a counter-offer/, href: routes.app.task('tsk_bookshelf'), deadline: 'Wed, Dec 9 · 10:00 am' },
    { data: mayaHomeProposalData, name: /^Jordan T\. proposed a booking/, href: routes.app.proposal('prp_desk'), deadline: 'Thu, Dec 10 · 11:00 am' },
  ])('shows the answer deadline and supplied destination for $name', ({ data, name, href, deadline }) => {
    renderHome(data, '2026-12-08T17:00:00.000Z');
    const link = section('Needs your attention').getByRole('link', { name });
    expect(link).toHaveAttribute('href', href);
    expect(link).toHaveTextContent(data.attention[0].title!);
    expect(link).toHaveTextContent(`Answer by ${deadline}.`);
  });

  it.each(ATTENTION_KINDS)('provides readable copy for %s', (kind) => {
    renderHome({
      ...posterHomeEmptyData,
      attention: [{ id: kind, kind, title: mayaHomeData.attention[0].title, count: 2, dueAt: DESK_TIMES.approvalDue, target: { kind: 'messages' } }],
    });
    const link = section('Needs your attention').getByRole('link');
    expect(link).toHaveAccessibleName(attentionCopy[kind]);
    expect(link.textContent).not.toMatch(/undefined|NaN|attention\.|home\./);
  });

  it.each(Object.entries(targetCases))('uses the route builder for the %s target', (_, { target, href }) => {
    renderHome({ ...posterHomeEmptyData, attention: [{ id: 'route', kind: 'unread_messages', count: 3, target }] });
    expect(section('Needs your attention').getByRole('link')).toHaveAttribute('href', href);
  });

  it('preserves supplied attention order, including the payout problem first', () => {
    renderHome(jordanHomePayoutActionData);
    const attention = section('Needs your attention');
    const links = attention.getAllByRole('link');
    expect(links).toHaveLength(jordanHomePayoutActionData.attention.length);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      routes.app.earnings(), routes.app.booking('bkg_desk'), routes.app.findWorkTask('tsk_moving'), routes.app.thread('thr_bkg_desk'),
    ]);
    expect(links[0]).toHaveAccessibleName(/payout/i);
    expect(screen.getAllByRole('region')[0]).toHaveAccessibleName('Needs your attention');
  });

  it('uses the supplied task title, offer count, and Central-time approval deadline', () => {
    renderHome();
    const attention = section('Needs your attention');
    expect(attention.getByRole('link', { name: /approve/i })).toHaveTextContent(mayaHomeData.attention[0].title!);
    expect(attention.getByRole('link', { name: /approve/i })).toHaveTextContent('11:48 am');
    expect(attention.getByRole('link', { name: /approve/i })).toHaveTextContent(/Tue/);
    expect(attention.getByRole('link', { name: /2 new offers/ })).toHaveTextContent('Mount two floating shelves');
    expect(attention.getByRole('link', { name: /3 unread messages/ })).toBeVisible();
  });

  it('uses singular message copy and the supplied Central-time start', () => {
    renderHome(jordanHomeData);
    const attention = section('Needs your attention');
    expect(attention.getByRole('link', { name: /starts today/i })).toHaveTextContent('10:30 am');
    const message = attention.getByRole('link', { name: /1 unread message/ });
    expect(within(message).getByText('1 unread message', { exact: true })).toBeVisible();
    expect(message).not.toHaveTextContent('1 unread messages');
  });

  it('handles optional attention title, count, and deadline without inventing values', () => {
    renderHome({
      ...posterHomeEmptyData,
      attention: [
        { id: 'approve', kind: 'approve_work', target: { kind: 'booking', bookingId: 'bkg_desk' } },
        { id: 'offers', kind: 'review_offers', target: { kind: 'task', taskId: 'tsk_shelves' } },
        { id: 'messages', kind: 'unread_messages', target: { kind: 'messages' } },
      ],
    });
    const attention = section('Needs your attention');
    expect(attention.getByRole('link', { name: /approve this task/i })).toBeVisible();
    expect(attention.getByRole('link', { name: /review new offers on this task/i })).toBeVisible();
    expect(attention.getByRole('link', { name: /read your unread messages/i })).toBeVisible();
    expect(attention.queryByRole('time')).not.toBeInTheDocument();
    for (const link of attention.getAllByRole('link')) {
      expect(link.textContent).not.toMatch(/undefined|NaN|0 (?:new offers|unread messages)/);
    }
  });
});

describe('HomeScreen dashboards', () => {
  it('shows the client sections and posting action without helper earnings', () => {
    renderHome();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Good morning, Maya');
    expect(section('Upcoming').getByRole('link', { name: 'All bookings' })).toHaveAttribute('href', routes.app.bookings());
    expect(section('Open tasks').getByRole('link', { name: 'My tasks' })).toHaveAttribute('href', routes.app.tasks());
    expect(screen.getByRole('link', { name: 'Post a task' })).toHaveAttribute('href', routes.app.newTask());
    expect(screen.queryByRole('region', { name: 'Earnings at a glance' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Earnings' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Active offers' })).not.toBeInTheDocument();
  });

  it('shows helper earnings, offers, and nearby task destinations without a posting action', () => {
    renderHome(jordanHomeData);
    const earnings = section('Earnings at a glance');
    expect(earnings.getByText('$75.00')).toBeVisible();
    expect(earnings.getByText('$110.25')).toBeVisible();
    expect(earnings.getByRole('link', { name: 'Earnings' })).toHaveAttribute('href', routes.app.earnings());
    expect(section('Active offers').getByRole('link', { name: 'My offers' })).toHaveAttribute('href', routes.app.offers());
    const nearby = section('Nearby tasks');
    expect(nearby.getByRole('link', { name: 'Find work' })).toHaveAttribute('href', routes.app.findWork());
    for (const card of jordanHomeData.suggestions) {
      expect(nearby.getByRole('link', { name: card.task.title })).toHaveAttribute('href', routes.app.findWorkTask(card.task.id));
    }
    expect(screen.queryByRole('link', { name: 'Post a task' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Open tasks' })).not.toBeInTheDocument();
  });

  it('shows friendly empty client sections instead of empty lists', () => {
    renderHome(posterHomeEmptyData);
    expect(section('Needs your attention').getByText("You're all caught up")).toBeVisible();
    for (const name of ['Upcoming', 'Open tasks']) {
      const empty = section(name);
      expect(empty.queryByRole('list')).not.toBeInTheDocument();
      expect(empty.getAllByRole('heading').length).toBeGreaterThan(1);
    }
    expect(screen.getAllByRole('link', { name: 'Post a task' }).every((link) => link.getAttribute('href') === routes.app.newTask())).toBe(true);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('shows empty helper sections with no empty list or posting action', () => {
    renderHome({ ...jordanHomeData, attention: [], upcoming: [], activeOffers: [], suggestions: [] });
    expect(section('Needs your attention').getByText("You're all caught up")).toBeVisible();
    for (const name of ['Upcoming', 'Active offers', 'Nearby tasks']) {
      const empty = section(name);
      expect(empty.queryByRole('list')).not.toBeInTheDocument();
      expect(empty.getAllByRole('heading').length).toBeGreaterThan(1);
    }
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Post a task' })).not.toBeInTheDocument();
  });

  it('limits client bookings and open tasks to three in the supplied order', () => {
    const upcoming = Array.from({ length: 4 }, (_, index) => ({ ...mayaHomeData.upcoming[0], id: `booking-${index}`, title: `${mayaHomeData.upcoming[0].title} ${index}` }));
    const openTasks = Array.from({ length: 4 }, (_, index) => ({ ...mayaHomeData.openTasks[0], id: `task-${index}`, title: `${mayaHomeData.openTasks[0].title} ${index}` }));
    renderHome({ ...mayaHomeData, upcoming, openTasks });
    expect(section('Upcoming').getAllByRole('article').map((row) => within(row).getByRole('link').getAttribute('href'))).toEqual(upcoming.slice(0, 3).map((row) => routes.app.booking(row.id)));
    expect(section('Open tasks').getAllByRole('article').map((row) => within(row).getByRole('link').getAttribute('href'))).toEqual(openTasks.slice(0, 3).map((row) => routes.app.task(row.id)));
    expect(screen.queryByRole('link', { name: upcoming[3].title })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: openTasks[3].title })).not.toBeInTheDocument();
  });

  it('limits helper offers and nearby tasks to three in the supplied order', () => {
    const activeOffers = Array.from({ length: 4 }, (_, index) => ({
      ...jordanHomeData.activeOffers[0],
      offer: { ...jordanHomeData.activeOffers[0].offer, id: `offer-${index}` },
      task: { ...jordanHomeData.activeOffers[0].task, id: `offer-task-${index}`, title: `${jordanHomeData.activeOffers[0].task.title} ${index}` },
    }));
    const suggestions = Array.from({ length: 4 }, (_, index) => ({
      ...jordanHomeData.suggestions[0],
      task: { ...jordanHomeData.suggestions[0].task, id: `nearby-${index}`, title: `${jordanHomeData.suggestions[0].task.title} ${index}` },
    }));
    renderHome({ ...jordanHomeData, activeOffers, suggestions });
    expect(section('Active offers').getAllByRole('article').map((row) => within(row).getByRole('link').getAttribute('href'))).toEqual(activeOffers.slice(0, 3).map((row) => routes.app.findWorkTask(row.task.id)));
    expect(section('Nearby tasks').getAllByRole('article').map((row) => within(row).getByRole('link').getAttribute('href'))).toEqual(suggestions.slice(0, 3).map((row) => routes.app.findWorkTask(row.task.id)));
  });

  it('links the setup banner to the supplied next step independently of attention', () => {
    renderHome({ ...priyaHomeData, attention: [], setup: { ...priyaHomeData.setup, nextOnboardingStep: 'payout' } });
    expect(screen.getByRole('link', { name: 'Finish setup' })).toHaveAttribute('href', routes.app.helperOnboarding('payout'));
    expect(section('Nearby tasks').getAllByRole('article')).toHaveLength(priyaHomeData.suggestions.length);
  });

  it('shows a helper waiting for their city the same note as find work, not nearby tasks (plan 8.4)', () => {
    renderHome(priyaHomeWaitingData);
    expect(screen.getByRole('heading', { name: "We're not in Pretty Prairie yet" })).toBeInTheDocument();
    expect(screen.getByText('3 other people near 67570 are waiting for us too.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See the waitlist for 67570' })).toHaveAttribute('href', routes.waitlist({ zip: '67570' }));
    // Their checks to finish meanwhile, and no "Nearby tasks" from another city.
    expect(screen.getByRole('link', { name: 'Finish setup' })).toHaveAttribute('href', routes.app.helperOnboarding('identity'));
    expect(screen.queryByRole('region', { name: 'Nearby tasks' })).not.toBeInTheDocument();
  });

  it('omits the setup banner for a bookable helper', () => {
    renderHome(jordanHomeData);
    expect(screen.queryByRole('link', { name: 'Finish setup' })).not.toBeInTheDocument();
  });
});

describe('HomeScreen market-time greeting', () => {
  it.each([
    ['2026-11-21T17:59:00.000Z', 'morning'],
    ['2026-11-21T18:00:00.000Z', 'afternoon'],
    ['2026-11-21T23:59:00.000Z', 'afternoon'],
    ['2026-11-22T00:00:00.000Z', 'evening'],
    ['2026-07-21T16:59:00.000Z', 'morning'],
    ['2026-07-21T17:00:00.000Z', 'afternoon'],
    ['2026-07-21T22:59:00.000Z', 'afternoon'],
    ['2026-07-21T23:00:00.000Z', 'evening'],
  ])('greets by Central time at %s', (at, greeting) => {
    renderHome(posterHomeEmptyData, at);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(`Good ${greeting}, Ruth`);
  });
});
