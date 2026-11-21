/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { NOTIFICATION_TYPES, routes, type ActionResult, type AttentionTarget, type NotificationHandlers, type NotificationsPageData, type NotificationType } from '@/contracts';
import { bookshelfInviteCounteredPoster, bookshelfInviteSentHelper, jordanNotificationsData, jordanRebookNotificationsData, mayaNotificationsData, mayaRebookNotificationsData, notificationsEmptyData, supportNotificationsData } from '@/fixtures';
import { attentionHref } from '@/ui/lib/attention-href';
import messages from '../../../../messages/en/ui';
import { NotificationsScreen } from './notifications-screen';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

const now = '2026-11-25T16:00:00.000Z';
function handlers(overrides: Partial<NotificationHandlers> = {}): NotificationHandlers {
  return {
    onOpen: vi.fn().mockResolvedValue({ ok: true, code: 'updated' }),
    onMarkAllRead: vi.fn().mockResolvedValue({ ok: true, code: 'updated' }),
    ...overrides,
  };
}
function show(data = mayaNotificationsData, actions = handlers()) {
  return render(<NextIntlClientProvider locale="en" messages={messages}><NotificationsScreen data={data} handlers={actions} now={now} /></NextIntlClientProvider>);
}

const copy: Record<NotificationType, RegExp> = {
  offer_received: /sent an offer/,
  offer_updated: /updated their offer/,
  offer_declined: /wasn't selected/,
  task_canceled: /was canceled/,
  task_expired: /ended with no booking/,
  booking_confirmed: /booked you for/,
  booking_canceled: /was canceled/,
  booking_canceled_receipt: /You canceled/,
  helper_on_the_way: /is on the way/,
  helper_running_late: /running 10 minutes late/,
  helper_arrived: /has arrived/,
  cant_access: /can't get in/,
  work_submitted: /for your approval/,
  work_approved: /was approved/,
  problem_reported: /problem was reported/,
  earnings_transferred: /\$54\.00 was transferred/,
  payout_paid: /You were paid \$54\.00/,
  tip_received: /added a tip( of \$54\.00)? for/,
  review_published: /review.*was published/,
  message_received: /sent you a message/,
  support_replied: /Support replied about/,
  case_resolved: /Support resolved your case about/,
  change_proposed: /proposed a change/,
  change_applied: /booking details for .* were updated/,
  invite_received: /sent you a booking request/,
  invite_countered: /sent a counter-offer/,
  invite_accepted: /accepted your booking request.*You're booked/,
  rebook_proposed: /proposed a booking/,
  rebook_accepted: /accepted your proposal: you're booked for/,
  rebook_declined: /declined your proposal.*No booking was made/,
  task_reopened: /looking for a new helper.*Make an offer/,
  approval_reminder: /Approve .* or report a problem\. It's approved automatically/,
  booking_reminder: /starts (in \d+ hours?|soon)/,
  verification_passed: /verification step is complete/,
  verification_action_needed: /verification step needs your attention/,
  background_check_expiring: /background check has run out/,
  id_expiring: /ID you verified with has expired/,
  helper_ready: /you can send offers now/,
  city_open: /We're open in /,
  task_match: /New task near you: .*\$54\.00/,
  data_export_ready: /copy of your data is ready/,
  series_started: /started regular visits/,
  series_visit_skipped: /skipped the visit on/,
  series_paused: /paused regular visits/,
  series_resumed: /regular visits for .* are back on/i,
  series_stopped: /regular visits/i,
  scheduled_payment_failed: /couldn't charge your card/,
  replacement_needed: /needs a new helper/,
  replacement_search_started: /open for offers again/,
  // No badge in the shared params: the generic wording (the badge's own name is tested with the badges).
  badge_earned: /You earned a badge: new/,
  reward_earned: /Your welcome gift card of \$54\.00 is yours/,
  reward_ready: /Your gift card of \$54\.00 is ready/,
  community_reply: /answered your post/,
  community_answer_pinned: /pinned your answer/,
  community_helpful: /found your post/,
  question_received: /asked a question about/,
  question_answered: /answered your question about/,
  saved_search_match: /New task for your search/,
  saved_search_digest: /new tasks? for your search/,
  review_prompt: /How did it go with .*\? Leave a review for/,
  review_reminder: /left to review .* for/,
  saved_searches_digest: /new tasks? for your saved searches, including/,
  payment_refunded: /We refunded/,
  address_recheck: /checking your home address again/,
};
const targets: Record<AttentionTarget['kind'], { target: AttentionTarget; href: string }> = {
  booking: { target: { kind: 'booking', bookingId: 'booking / one' }, href: routes.app.booking('booking / one') },
  task: { target: { kind: 'task', taskId: 'task / one' }, href: routes.app.task('task / one') },
  thread: { target: { kind: 'thread', threadId: 'thread / one' }, href: routes.app.thread('thread / one') },
  messages: { target: { kind: 'messages' }, href: routes.app.messages() },
  find_work_task: { target: { kind: 'find_work_task', taskId: 'task / one' }, href: routes.app.findWorkTask('task / one') },
  account: { target: { kind: 'account' }, href: routes.app.account() },
  verify_identity: { target: { kind: 'verify_identity' }, href: routes.app.verifyIdentity() },
  onboarding: { target: { kind: 'onboarding', step: 'payout' }, href: routes.app.helperOnboarding('payout') },
  earnings: { target: { kind: 'earnings' }, href: routes.app.earnings() },
  support_case: { target: { kind: 'support_case', caseId: 'case / one' }, href: routes.app.supportCase('case / one') },
  invite: { target: { kind: 'invite', inviteId: 'invite / one' }, href: routes.app.offers('invite / one') },
  proposal: { target: { kind: 'proposal', proposalId: 'proposal / one' }, href: routes.app.proposal('proposal / one') },
  series: { target: { kind: 'series', seriesId: 'series / one' }, href: routes.app.series('series / one') },
  rewards: { target: { kind: 'rewards' }, href: routes.app.rewards() },
  community_post: { target: { kind: 'community_post', postId: 'post / one' }, href: routes.app.communityPost('post / one') },
  saved_search: { target: { kind: 'saved_search', searchId: 'search / one' }, href: routes.app.savedSearch('search / one') },
  booking_review: { target: { kind: 'booking_review', bookingId: 'booking / one' }, href: routes.app.bookingReview('booking / one') },
  saved_searches: { target: { kind: 'saved_searches' }, href: routes.app.savedSearches() },
};

describe('NotificationsScreen', () => {
  it.each(NOTIFICATION_TYPES)('renders friendly copy and an icon for %s', (type) => {
    show({ notifications: [{ ...mayaNotificationsData.notifications[0], type, params: { amountCents: 5400, minutes: 10, hours: 24 } }], unreadCount: 1 });
    const link = screen.getByRole('link');
    expect(link).toHaveAccessibleName(copy[type]);
    expect(link.querySelector('svg')).not.toBeNull();
    expect(link.textContent).not.toMatch(/undefined|NaN|notifications\./);
  });

  it.each(Object.entries(targets))('builds the %s destination through routes', (_, { target, href }) => {
    expect(attentionHref(target)).toBe(href);
    show({ notifications: [{ ...mayaNotificationsData.notifications[0], target }], unreadCount: 1 });
    expect(screen.getByRole('link')).toHaveAttribute('href', href);
  });

  it.each([
    { type: 'change_proposed', target: targets.booking },
    { type: 'change_applied', target: targets.booking },
    { type: 'invite_received', target: targets.invite },
    { type: 'invite_countered', target: targets.task },
    { type: 'invite_accepted', target: targets.booking },
    { type: 'rebook_proposed', target: targets.proposal },
    { type: 'rebook_accepted', target: targets.booking },
    { type: 'rebook_declined', target: targets.proposal },
    { type: 'task_reopened', target: targets.find_work_task },
    { type: 'approval_reminder', target: targets.booking },
    { type: 'booking_reminder', target: targets.booking },
    { type: 'tip_received', target: targets.booking },
  ] as const)('opens the supplied destination for $type', async ({ type, target }) => {
    const actions = handlers();
    const notification = { ...mayaNotificationsData.notifications[0], id: type, type, target: target.target };
    show({ notifications: [notification], unreadCount: 1 }, actions);
    const link = screen.getByRole('link', { name: copy[type] });
    expect(link).toHaveAttribute('href', target.href);
    await userEvent.click(link);
    expect(actions.onOpen).toHaveBeenCalledExactlyOnceWith({ notificationId: type });
    await waitFor(() => expect(navigation.push).toHaveBeenCalledExactlyOnceWith(target.href));
  });

  it('shows the supplied counter-offer amount without using the card hold amount', () => {
    show({
      notifications: [{
        id: 'counter', type: 'invite_countered', title: bookshelfInviteCounteredPoster.task.title,
        actorName: bookshelfInviteCounteredPoster.helper.displayName,
        params: { amountCents: bookshelfInviteCounteredPoster.counter!.breakdown.taskPriceCents },
        target: { kind: 'task', taskId: bookshelfInviteCounteredPoster.task.id }, createdAt: now,
      }], unreadCount: 1,
    });
    expect(screen.getByRole('link')).toHaveTextContent('Jordan T. sent a counter-offer of $50.00 for Assemble a bookshelf');
    expect(screen.getByRole('link')).not.toHaveTextContent('$55.00');
  });

  it('opens an invite sheet through the invite target after mark-read fails', async () => {
    const invite = bookshelfInviteSentHelper;
    show({
      notifications: [{
        id: 'received', type: 'invite_received', title: invite.task.title, actorName: invite.client.displayName,
        target: { kind: 'invite', inviteId: invite.id }, createdAt: invite.sentAt,
      }], unreadCount: 1,
    }, handlers({ onOpen: vi.fn().mockResolvedValue({ ok: false, code: 'unknown' }) }));
    await userEvent.click(screen.getByRole('link', { name: /sent you a booking request/ }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledExactlyOnceWith(routes.app.offers(invite.id)));
  });

  it.each(supportNotificationsData.notifications)('opens the support case for $type', async (notification) => {
    const actions = handlers();
    show(supportNotificationsData, actions);
    const link = screen.getByRole('link', { name: copy[notification.type] });
    expect(link).toHaveTextContent(notification.title!);
    expect(link).toHaveAttribute('href', routes.app.supportCase('case_dispute'));
    await userEvent.click(link);
    expect(actions.onOpen).toHaveBeenCalledWith({ notificationId: notification.id });
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith(routes.app.supportCase('case_dispute')));
  });

  it('shows newest first, unread labels, and absolute Central time with relative time', () => {
    show({ ...mayaNotificationsData, notifications: [...mayaNotificationsData.notifications].reverse() });
    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent(/submitted/);
    expect(rows.at(-1)).toHaveTextContent(/sent an offer/);
    expect(screen.getAllByText('Unread')).toHaveLength(mayaNotificationsData.unreadCount);
    expect(rows[0]).toHaveTextContent('Sat, Nov 21');
    expect(rows[0]).toHaveTextContent(/am|pm/);
    expect(rows[0]).toHaveTextContent(/days ago/);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('shows the hours left on an approval reminder, or "soon" without them', () => {
    const reminder = { ...mayaNotificationsData.notifications[0], type: 'approval_reminder' as const };
    show({ notifications: [{ ...reminder, params: { hours: 4 } }], unreadCount: 1 });
    expect(screen.getByRole('link')).toHaveTextContent("It's approved automatically in 4 hours");
    cleanup();
    show({ notifications: [{ ...reminder, params: { hours: 1 } }], unreadCount: 1 });
    expect(screen.getByRole('link')).toHaveTextContent("It's approved automatically in 1 hour");
    cleanup();
    show({ notifications: [{ ...reminder, params: undefined }], unreadCount: 1 });
    expect(screen.getByRole('link')).toHaveTextContent("It's approved automatically soon");
  });

  it('shows the canonical payout amount', () => {
    show(jordanNotificationsData);
    expect(screen.getByRole('link', { name: /You were paid \$62\.00/ })).toBeVisible();
  });

  it.each(['helper_running_late', 'payout_paid', 'offer_received', 'change_proposed', 'change_applied', 'invite_received', 'invite_countered', 'invite_accepted', 'rebook_proposed', 'rebook_accepted', 'rebook_declined', 'task_reopened', 'approval_reminder', 'booking_reminder'] as const)('does not invent optional details for %s', (type) => {
    show({ notifications: [{ id: type, type, target: { kind: 'messages' }, createdAt: now }], unreadCount: 1 });
    expect(screen.getByRole('link').textContent).not.toMatch(/undefined|NaN|\$0\.00|0 minutes/);
  });

  it('shows an empty state and no mark-read action with no notifications', () => {
    show(notificationsEmptyData);
    expect(screen.getByRole('heading', { name: 'No notifications yet' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /Mark all/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to home' })).toHaveAttribute('href', routes.app.home());
  });

  it('uses unreadCount to show the mark-read action', () => {
    const data: NotificationsPageData = { ...mayaNotificationsData, unreadCount: 0 };
    show(data);
    expect(screen.queryByRole('button', { name: /Mark all/ })).not.toBeInTheDocument();
  });

  it('disables the mark-read action while pending and refreshes on success', async () => {
    let finish!: (result: ActionResult) => void;
    const actions = handlers({ onMarkAllRead: vi.fn(() => new Promise<ActionResult>((resolve) => { finish = resolve; })) });
    show(mayaNotificationsData, actions);
    await userEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));
    expect(screen.getByRole('button', { name: /Marking as read/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Marking as read/ })).toHaveAttribute('aria-busy', 'true');
    expect(actions.onMarkAllRead).toHaveBeenCalledTimes(1);
    await act(async () => finish({ ok: true, code: 'updated' }));
    expect(screen.getByRole('status')).toHaveTextContent('All notifications marked as read.');
    expect(navigation.refresh).toHaveBeenCalledTimes(1);
  });

  it('keeps the mark-read confirmation after refreshed data has zero unread notifications', async () => {
    const actions = handlers();
    const view = show(mayaNotificationsData, actions);
    await userEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));
    expect(await screen.findByRole('status')).toHaveTextContent('All notifications marked as read.');
    const refreshed: NotificationsPageData = {
      notifications: mayaNotificationsData.notifications.map((notification) => ({ ...notification, readAt: notification.readAt ?? now })),
      unreadCount: 0,
    };
    view.rerender(<NextIntlClientProvider locale="en" messages={messages}><NotificationsScreen data={refreshed} handlers={actions} now={now} /></NextIntlClientProvider>);
    expect(screen.getByRole('status')).toHaveTextContent('All notifications marked as read.');
    expect(screen.getByRole('status').parentElement).toHaveAttribute('aria-live', 'polite');
    expect(screen.queryByRole('button', { name: /Mark all/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Unread')).not.toBeInTheDocument();
    expect(actions.onMarkAllRead).toHaveBeenCalledTimes(1);
  });

  it('shows mark-read errors without changing unread rows and permits retry', async () => {
    show(mayaNotificationsData, handlers({ onMarkAllRead: vi.fn().mockRejectedValue(new Error('offline')) }));
    await userEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));
    expect(await screen.findByRole('status')).toHaveTextContent("We couldn't mark your notifications as read. Try again.");
    expect(screen.getAllByText('Unread')).toHaveLength(mayaNotificationsData.unreadCount);
    expect(screen.getByRole('button', { name: 'Mark all as read' })).toBeEnabled();
    expect(navigation.refresh).not.toHaveBeenCalled();
  });

  it.each([mayaRebookNotificationsData, jordanRebookNotificationsData])('renders rebooking actors and keeps confirmation across an empty refresh', async (data) => {
    const actions = handlers();
    const view = show(data, actions);
    for (const notification of data.notifications) {
      const link = screen.getByRole('link', { name: copy[notification.type] });
      expect(link).toHaveTextContent(notification.actorName!);
      expect(link).toHaveAttribute('href', attentionHref(notification.target));
    }
    await userEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));
    expect(await screen.findByRole('status')).toHaveTextContent(messages.notifications.markedRead);
    view.rerender(<NextIntlClientProvider locale="en" messages={messages}><NotificationsScreen data={notificationsEmptyData} handlers={actions} now={now} /></NextIntlClientProvider>);
    expect(screen.getByRole('status')).toHaveTextContent(messages.notifications.markedRead);
    expect(screen.getByRole('heading', { name: messages.notifications.empty.title })).toBeVisible();
  });

  it.each(['success', 'error', 'throw'] as const)('opens the destination after an onOpen %s', async (outcome) => {
    const onOpen = outcome === 'throw' ? vi.fn().mockRejectedValue(new Error('offline')) : vi.fn().mockResolvedValue(outcome === 'success' ? { ok: true, code: 'updated' } : { ok: false, code: 'unknown' });
    show(mayaNotificationsData, handlers({ onOpen }));
    await userEvent.click(within(screen.getAllByRole('listitem')[0]).getByRole('link'));
    expect(onOpen).toHaveBeenCalledWith({ notificationId: mayaNotificationsData.notifications[0].id });
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith(routes.app.booking('bkg_desk')));
  });

  it('prevents duplicate opens and exposes pending state', async () => {
    let finish!: (result: ActionResult) => void;
    const onOpen = vi.fn(() => new Promise<ActionResult>((resolve) => { finish = resolve; }));
    show(mayaNotificationsData, handlers({ onOpen }));
    const link = within(screen.getAllByRole('listitem')[0]).getByRole('link');
    await userEvent.dblClick(link);
    expect(link).toHaveAttribute('aria-busy', 'true');
    expect(link).toHaveAttribute('aria-disabled', 'true');
    expect(onOpen).toHaveBeenCalledTimes(1);
    await act(async () => finish({ ok: true, code: 'updated' }));
    expect(navigation.push).toHaveBeenCalledTimes(1);
  });

  it('only navigates to the latest selection when mark-read responses finish out of order', async () => {
    const replies = new Map<string, (result: ActionResult) => void>();
    const onOpen: NotificationHandlers['onOpen'] = ({ notificationId }) => new Promise((resolve) => { replies.set(notificationId, resolve); });
    show(mayaNotificationsData, handlers({ onOpen }));
    const first = mayaNotificationsData.notifications[0];
    const message = mayaNotificationsData.notifications.find((item) => item.type === 'message_received')!;
    await userEvent.click(within(screen.getAllByRole('listitem')[0]).getByRole('link'));
    await userEvent.click(screen.getByRole('link', { name: /sent you a message/ }));
    await act(async () => replies.get(message.id)!({ ok: true, code: 'updated' }));
    expect(navigation.push).toHaveBeenCalledExactlyOnceWith(routes.app.thread('thr_bkg_desk'));
    await act(async () => replies.get(first.id)!({ ok: true, code: 'updated' }));
    expect(navigation.push).toHaveBeenCalledTimes(1);
  });
});
