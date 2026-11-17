/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ADDRESS_VISIBILITY, BOOKING_STATUSES, CANCEL_REASONS, COMPLETED_VIA, PAYMENT_STATUSES, routes,
  type BookingHubHandlers, type BookingView, type BookingViewerRole,
} from '@/contracts';
import {
  deskBookingHelperCompleted, deskBookingHelperCompletedAddressHidden, deskBookingHelperConfirmed,
  deskBookingHelperInProgress, deskBookingHelperPendingFunding, deskBookingPosterCanceledLate,
  deskBookingPosterCompleted, deskBookingPosterCompletionSubmitted, deskBookingPosterCompletionWithExpenses, deskBookingPosterConfirmed,
  deskBookingPosterCantAccessReported, deskBookingPosterPendingFunding, deskExactAddress, fakeBookingSheetHandlers, fakeHandler, movingBookingPosterConfirmed,
  remoteBookingHelperConfirmed,
  deskReviewPublishedData, deskReviewSubmittedData,
  deskBookingHelperDisputed, deskBookingHelperDisputedContacted, deskBookingHelperSettled,
  deskBookingPosterDisputed, deskBookingPosterSettled,
  deskBookingPosterWithOpenChange, deskBookingHelperWithOpenChange,
  deskBookingPosterTipAvailable, deskBookingPosterTipped, fakeBookingTipHandlers,
  yardVisitScheduledHelper, yardVisitScheduledPoster,
} from '@/fixtures';
import { formatDate, formatDateTime, formatMoney, formatMonthYear, formatTime, formatTimeRange } from '@/shared/format';
import messages from '../../../../messages/en/ui';
import { BookingHubScreen } from './booking-hub-screen';
import { TimeZoneProvider } from '@/ui/lib/time-zone-provider';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const addressRenderer = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
vi.mock('@/ui/components/location/exact-address-panel', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/ui/components/location/exact-address-panel')>();
  return {
    ...original,
    ExactAddressPanel: (props: Parameters<typeof original.ExactAddressPanel>[0]) => {
      addressRenderer(props);
      return <original.ExactAddressPanel {...props} />;
    },
  };
});

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn(); });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

function mount(data: BookingView = deskBookingPosterConfirmed, now = '2026-11-17T15:02:00.000Z') {
  const onError = vi.fn();
  const onAction = vi.fn(fakeHandler<Parameters<BookingHubHandlers['onAction']>[0]>({ ok: true, code: 'updated' }, 0));
  return {
    onError, onAction,
    ...render(<NextIntlClientProvider locale="en" messages={messages} onError={onError}><TimeZoneProvider timeZone="America/Chicago">
      <BookingHubScreen data={data} handlers={{ onAction }} sheets={fakeBookingSheetHandlers} now={now} />
    </TimeZoneProvider></NextIntlClientProvider>),
  };
}

const roles: BookingViewerRole[] = ['poster', 'helper'];

describe('BookingHubScreen regular visits and scheduled payments', () => {
  it('links a visit to its series and shows when it is charged, with a free skip', async () => {
    const user = userEvent.setup();
    const { onAction, onError } = mount(yardVisitScheduledPoster, '2026-11-20T15:00:00.000Z');
    expect(screen.getByRole('link', { name: 'Visit 3 · Regular visits every week' })).toHaveAttribute('href', routes.app.series('srs_yard_sam'));
    expect(screen.getByRole('region', { name: messages.bookingHub.scheduledCard.title })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: messages.actions.skip_visit }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: messages.feedback.confirm }));
    expect(onAction).toHaveBeenCalledWith({ action: 'skip_visit' });
    expect(onError).not.toHaveBeenCalled();
  });

  it("keeps the address from the helper until it's paid", () => {
    mount(yardVisitScheduledHelper, '2026-11-20T15:00:00.000Z');
    expect(screen.getByText(messages.bookingHub.address.after_confirmation)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Pay/ })).not.toBeInTheDocument();
  });
});

describe('BookingHubScreen tips (UI-057)', () => {
  it("shows the client's tip: the card, its own payment line and the timeline event", () => {
    mount(deskBookingPosterTipped, '2026-11-21T19:30:00.000Z');
    expect(screen.getByText('You tipped $9.00')).toBeInTheDocument();
    const payments = screen.getByRole('region', { name: messages.bookingHub.payments });
    expect(within(payments).getByText(messages.bookingHub.tip)).toBeInTheDocument();
    expect(within(payments).getAllByText('$9.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Tip added · $9.00').length).toBeGreaterThan(0);
  });

  it('offers the tip card only with tip handlers', () => {
    mount(deskBookingPosterTipAvailable, '2026-11-21T19:30:00.000Z');
    expect(screen.queryByRole('region', { name: 'Add a tip for Jordan T.' })).not.toBeInTheDocument();
    cleanup();
    render(<NextIntlClientProvider locale="en" messages={messages}><TimeZoneProvider timeZone="America/Chicago">
      <BookingHubScreen data={deskBookingPosterTipAvailable} handlers={{ onAction: vi.fn() }} sheets={fakeBookingSheetHandlers} tip={fakeBookingTipHandlers} now="2026-11-21T19:30:00.000Z" />
    </TimeZoneProvider></NextIntlClientProvider>);
    expect(screen.getByRole('region', { name: 'Add a tip for Jordan T.' })).toBeInTheDocument();
  });
});

describe('BookingHubScreen change requests', () => {
  it('omits the change banner when no open change is supplied', () => {
    mount();
    expect(screen.queryByRole('region', { name: messages.bookingHub.change.title })).not.toBeInTheDocument();
  });

  it.each([
    [deskBookingPosterWithOpenChange, 'You proposed a change: waiting for Jordan T.'],
    [deskBookingHelperWithOpenChange, 'Maya R. proposed a change: review it.'],
  ] as const)('shows the supplied proposal for $0.viewerRole without removing actions', (data, text) => {
    const { container } = mount(data);
    const banner = screen.getByRole('region', { name: messages.bookingHub.change.title });
    expect(banner).toHaveTextContent(text);
    expect(within(banner).getByRole('link', { name: messages.bookingHub.change.view })).toHaveAttribute('href', routes.app.bookingChange(data.id, data.openChange!.id));
    expect(Array.from(container.querySelectorAll('[data-action-id]'), (node) => node.getAttribute('data-action-id'))).toEqual(data.actions.map(({ id }) => id));
  });

  it('shows the supplied payment difference to the client after acceptance', () => {
    mount({ ...deskBookingPosterWithOpenChange, openChange: { ...deskBookingPosterWithOpenChange.openChange!, status: 'accepted_pending_funding' } });
    expect(screen.getByRole('region', { name: messages.bookingHub.change.title })).toHaveTextContent('Accepted: pay $22.00 to apply it.');
  });

  it('shows the payment wait to the helper after acceptance', () => {
    mount({ ...deskBookingHelperWithOpenChange, openChange: { ...deskBookingHelperWithOpenChange.openChange!, status: 'accepted_pending_funding' } });
    expect(screen.getByRole('region', { name: messages.bookingHub.change.title })).toHaveTextContent('Accepted: waiting for Maya R. to pay the difference.');
  });
});

describe('BookingHubScreen dispute integration', () => {
  it('omits the dispute card when no dispute is projected', () => {
    mount();
    expect(screen.queryByRole('region', { name: messages.bookingHub.dispute.title })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: messages.bookingHub.dispute.resolvedTitle })).not.toBeInTheDocument();
  });

  it.each([deskBookingPosterDisputed, deskBookingHelperDisputed, deskBookingHelperDisputedContacted])('shows the supplied $viewerRole dispute near the top without changing actions', (data) => {
    const { container } = mount(data);
    const dispute = screen.getByRole('region', { name: messages.bookingHub.dispute.title });
    expect(dispute).toBeVisible();
    const sections = Array.from(container.querySelectorAll('section'));
    expect(sections[0]).toBe(dispute);
    expect(Array.from(container.querySelectorAll('[data-action-id]'), (node) => node.getAttribute('data-action-id'))).toEqual(data.actions.map(({ id }) => id));
    expect(within(dispute).queryByRole('link', { name: messages.bookingHub.dispute.viewCase }) !== null).toBe(data.dispute!.canOpenCase);
  });

  it.each([deskBookingPosterSettled, deskBookingHelperSettled])('shows a $viewerRole settlement with the completion method and decision', (data) => {
    mount(data);
    expect(screen.getByText('Completed through a settlement')).toBeVisible();
    const dispute = screen.getByRole('region', { name: messages.bookingHub.dispute.resolvedTitle });
    expect(dispute).toHaveTextContent(data.dispute!.resolution!.summary);
    expect(dispute).toHaveTextContent(data.viewerRole === 'poster' ? '$16.50 was refunded to your card' : 'You receive $40.50 for this booking');
  });
});

describe('BookingHubScreen privacy and supplied data', () => {
  it('keeps the existing app caller compatible while failing closed until sheet handlers are supplied', async () => {
    const onAction = vi.fn(fakeHandler<Parameters<BookingHubHandlers['onAction']>[0]>({ ok: true, code: 'updated' }, 0));
    render(<NextIntlClientProvider locale="en" messages={messages}><TimeZoneProvider timeZone="America/Chicago">
      <BookingHubScreen data={{ ...deskBookingPosterConfirmed, actions: [{ id: 'cancel', kind: 'destructive', enabled: true }] }} handlers={{ onAction }} now="2026-11-21T16:00:00.000Z" />
    </TimeZoneProvider></NextIntlClientProvider>);
    await userEvent.click(screen.getByRole('button', { name: messages.actions.cancel }));
    expect(await screen.findByText(messages.bookingSheets.cancel.loadError)).toBeVisible();
    expect(screen.getByRole('alertdialog')).toBeVisible();
    expect(onAction).not.toHaveBeenCalled();
  });

  it('renders the address only through ExactAddressPanel with the route-built maps link', () => {
    mount();
    expect(addressRenderer).toHaveBeenCalledWith(expect.objectContaining({
      address: deskExactAddress,
      mapsHref: routes.external.googleMapsSearch(deskExactAddress),
    }));
    const panel = screen.getByRole('region', { name: messages.location.exactAddress });
    expect(within(panel).getByText(deskExactAddress.line1)).toBeVisible();
    expect(screen.getAllByText(deskExactAddress.line1)).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(deskBookingPosterConfirmed.task.title);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it.each(ADDRESS_VISIBILITY.filter((visibility) => visibility !== 'visible'))('does not expose a mistakenly supplied address when %s', (addressVisibility) => {
    const { container, onError } = mount({ ...deskBookingHelperConfirmed, addressVisibility, exactAddress: deskExactAddress });
    expect(addressRenderer).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain(deskExactAddress.line1);
    expect(container.textContent).not.toContain(deskExactAddress.line2);
    expect(container.textContent).not.toContain(deskExactAddress.accessNotes);
    expect(screen.queryByRole('button', { name: messages.location.copyAddress })).not.toBeInTheDocument();
    expect(onError).not.toHaveBeenCalled();
  });

  it('omits the exact-address panel when no address is supplied', () => {
    mount({ ...deskBookingPosterConfirmed, exactAddress: undefined });
    expect(addressRenderer).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: messages.location.exactAddress })).not.toBeInTheDocument();
  });

  it('shows client payments, payment method and charge date', () => {
    mount();
    const payments = screen.getByRole('region', { name: 'Payments' });
    expect(payments).toHaveTextContent('$66.00');
    expect(payments).toHaveTextContent(/Visa.*1881/);
    expect(payments).toHaveTextContent(formatDateTime(deskBookingPosterConfirmed.payments![0].at, 'en', 'America/Chicago'));
    expect(within(payments).getByText(messages.status.payment.succeeded)).toBeVisible();
  });

  it('never renders the payment section or card details to helpers, even if supplied', () => {
    const { container } = mount({ ...deskBookingHelperConfirmed, payments: deskBookingPosterConfirmed.payments });
    expect(screen.queryByRole('region', { name: 'Payments' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Payments' })).not.toBeInTheDocument();
    expect(container.textContent).not.toContain('1881');
    expect(container.textContent).not.toContain('Visa');
    expect(screen.queryByText('Total charged')).not.toBeInTheDocument();
    expect(screen.getByText("You'll earn").closest('div')).toHaveTextContent('$54.00');
  });

  it('uses the client money variant and shows supplied refunds without recalculation', () => {
    mount(deskBookingPosterCanceledLate);
    expect(screen.getByText('Total charged').closest('div')).toHaveTextContent('$66.00');
    expect(screen.queryByText("You'll earn")).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Payments' })).toHaveTextContent('$54.00');
  });

  it('links the client to their task when it is open for offers again after the helper canceled', () => {
    mount({ ...deskBookingPosterCanceledLate, cancelReason: 'helper', taskReopened: true });
    expect(screen.getByText(messages.bookingHub.taskReopened.body)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: messages.bookingHub.taskReopened.link })).toHaveAttribute('href', routes.app.task(deskBookingPosterCanceledLate.task.id));
  });

  it('uses a compact helper card for the client', () => {
    mount();
    expect(screen.getByRole('link', { name: deskBookingPosterConfirmed.helper.displayName })).toHaveAttribute('href', routes.helperProfile(deskBookingPosterConfirmed.helper.handle));
  });

  it('shows Saved beside the supplied actions and preserves their order and availability', () => {
    const data: BookingView = {
      ...deskBookingPosterCompleted,
      helperSaved: true,
      actions: [{ id: 'message', kind: 'secondary', enabled: false, disabledReason: { code: 'not_allowed' } }],
    };
    const { container } = mount(data);
    const action = screen.getByRole('button', { name: messages.actions.message });
    expect(action).toBeDisabled();
    expect(action.closest('[role="group"]')!.parentElement).toHaveTextContent(messages.bookingHub.saved);
    expect(Array.from(container.querySelectorAll('[data-action-id]'), (node) => node.getAttribute('data-action-id'))).toEqual(['message']);
    expect(screen.queryByRole('button', { name: messages.actions.save_helper })).not.toBeInTheDocument();
  });

  it('still shows Saved when the domain supplies no actions', () => {
    mount({ ...deskBookingPosterCompleted, helperSaved: true, actions: [] });
    expect(screen.getByText(messages.bookingHub.saved)).toBeVisible();
  });

  it('does not remove supplied actions based on saved or review flags', () => {
    const { container } = mount({ ...deskBookingPosterCompleted, helperSaved: true, myReview: deskReviewSubmittedData.mine });
    expect(Array.from(container.querySelectorAll('[data-action-id]'), (node) => node.getAttribute('data-action-id'))).toEqual(deskBookingPosterCompleted.actions.map(({ id }) => id));
    expect(screen.getByRole('button', { name: messages.actions.save_helper })).toBeEnabled();
    expect(screen.getByRole('button', { name: messages.actions.review })).toBeEnabled();
  });

  it('shows a sent review and keeps it hidden based on the supplied publication state', () => {
    mount({ ...deskBookingPosterCompleted, myReview: deskReviewSubmittedData.mine }, '2026-12-06T12:00:00.000Z');
    const review = screen.getByRole('region', { name: messages.bookingHub.review.title });
    expect(review).toHaveTextContent('You rated this 5 stars');
    expect(review).toHaveTextContent(messages.bookingHub.review.hidden);
    expect(review).not.toHaveTextContent('Visible since');
  });

  it('shows the supplied publication date and preserves low ratings', () => {
    mount({ ...deskBookingHelperCompleted, myReview: { ...deskReviewPublishedData.mine!, rating: 1 } });
    const review = screen.getByRole('region', { name: messages.bookingHub.review.title });
    expect(review).toHaveTextContent('You rated this 1 star');
    expect(review).toHaveTextContent(`Visible since ${formatDate(deskReviewPublishedData.mine!.publishedAt!, { timeZone: 'America/Chicago' })}`);
    expect(review.querySelector('time')).toHaveAttribute('dateTime', deskReviewPublishedData.mine!.publishedAt);
    expect(review).not.toHaveTextContent(messages.bookingHub.review.hidden);
  });

  it('omits saved and review states when the projection does not include them', () => {
    mount(deskBookingPosterCompleted);
    expect(screen.queryByText(messages.bookingHub.saved)).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: messages.bookingHub.review.title })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: messages.actions.save_helper })).toBeEnabled();
  });

  it('shows client identity and verification to the helper', () => {
    const { container } = mount(deskBookingHelperConfirmed);
    expect(screen.getByRole('heading', { name: deskBookingHelperConfirmed.poster.displayName })).toBeVisible();
    expect(container.textContent).toContain(deskBookingHelperConfirmed.poster.initials);
    expect(container.textContent).toContain(formatMonthYear(deskBookingHelperConfirmed.poster.memberSince, 'en', 'America/Chicago'));
    expect(screen.getByText('Phone verified')).toBeVisible();
  });

  it('shows address expiry from the supplied deadline and stops rendering the hidden address', () => {
    const first = mount(deskBookingHelperCompleted);
    expect(first.container.textContent).toMatch(/address until.*Mon, Nov 23.*1:05 pm/i);
    first.unmount();
    addressRenderer.mockClear();
    mount(deskBookingHelperCompletedAddressHidden);
    expect(addressRenderer).not.toHaveBeenCalled();
    expect(screen.queryByText(deskExactAddress.line1)).not.toBeInTheDocument();
    expect(screen.getByText(/address.*hidden/i)).toBeVisible();
  });

  it('explains the address wait and remote meeting-link arrangement', () => {
    const first = mount(deskBookingHelperPendingFunding);
    expect(screen.getByText(/exact address.*booking is confirmed/i)).toBeVisible();
    first.unmount();
    mount(remoteBookingHelperConfirmed);
    expect(screen.getByText(/Remote task: share a meeting link in messages/i)).toBeVisible();
    expect(screen.queryByRole('region', { name: messages.location.exactAddress })).not.toBeInTheDocument();
  });

  it('shows the agreed start and the original task window independently', () => {
    const { container } = mount();
    const { terms, task } = deskBookingPosterConfirmed;
    expect(container.textContent).toContain(formatDateTime(terms.start, 'en', 'America/Chicago'));
    expect(container.textContent).toContain(formatDate(task.schedule.windowStart, { timeZone: 'America/Chicago' }));
    expect(container.textContent).toContain(formatTimeRange(task.schedule.windowStart, task.schedule.windowEnd, 'en', 'America/Chicago'));
  });

  it('shows each supplied check-in update', () => {
    const { container } = mount({ ...deskBookingHelperInProgress, checkIn: { ...deskBookingHelperInProgress.checkIn, lateByMinutes: 20 } });
    expect(container.textContent).toMatch(/On my way at 9:58 am/);
    expect(container.textContent).toMatch(/Running 20 minutes late/);
    expect(container.textContent).toMatch(/Arrived at 10:24 am/);
  });

  it('shows the supplied access report and client response deadline without deriving timers', () => {
    mount(deskBookingPosterCantAccessReported);
    const checkIn = screen.getByRole('region', { name: messages.bookingHub.checkIn });
    expect(checkIn).toHaveTextContent(/Jordan T\. couldn.t get in at 10:50 am/);
    expect(screen.getByText('Answer by 11:20 am or the booking is canceled')).toBeVisible();
    expect(screen.getByRole('button', { name: messages.actions.im_here })).toBeEnabled();
  });

  it('shows an access-only check-in without the empty check-in copy, and keeps the response prompt client-only', () => {
    mount({
      ...deskBookingPosterCantAccessReported,
      viewerRole: 'helper',
      checkIn: { cantAccessAt: deskBookingPosterCantAccessReported.checkIn!.cantAccessAt },
    });
    expect(screen.getByRole('region', { name: messages.bookingHub.checkIn })).toHaveTextContent(/couldn.t get in at 10:50 am/);
    expect(screen.queryByText(messages.bookingHub.noCheckIn)).not.toBeInTheDocument();
    expect(screen.queryByText('Answer by 11:20 am or the booking is canceled')).not.toBeInTheDocument();
  });

  it('shows the hourly estimate and cap, charging for the cap', () => {
    const { container } = mount(movingBookingPosterConfirmed);
    expect(container.textContent).toContain(movingBookingPosterConfirmed.terms.scopeText);
    expect(container.textContent).toContain('$35.00');
    expect(container.textContent).toContain('3.5 h');
    expect(container.textContent).toContain('4 h');
    expect(screen.getByText('Total charged').closest('div')).toHaveTextContent('$154.00');
    expect(screen.getByText(/You paid for up to 4 hours.*Unused hours are refunded after you approve/)).toBeVisible();
  });

  it('shows an expense allowance the charge funds, inside the canonical total', () => {
    const { container } = mount(deskBookingPosterCompletionWithExpenses);
    const allowance = deskBookingPosterCompletionWithExpenses.terms.expenseAllowance!;
    expect(container.textContent).toContain(formatMoney(allowance.amountCents));
    expect(container.textContent).toContain(allowance.description);
    // $60.00 + $6.00 fee + the $20.00 allowance, as funded.
    expect(screen.getByText('Total charged').closest('div')).toHaveTextContent(formatMoney(deskBookingPosterCompletionWithExpenses.terms.breakdown.posterTotalCents));
    expect(deskBookingPosterCompletionWithExpenses.terms.breakdown.posterTotalCents).toBe(8600);
  });

  it('shows absolute and relative funding and approval deadlines', () => {
    const first = mount(deskBookingPosterPendingFunding);
    expect(first.container.textContent).toMatch(/Finish paying by.*9:31 am/);
    expect(first.container.textContent).toContain('in 29 minutes');
    expect(screen.getByText('Total due').closest('div')).toHaveTextContent('$66.00');
    expect(screen.queryByText('Total charged')).not.toBeInTheDocument();
    first.unmount();
    const next = mount(deskBookingPosterCompletionSubmitted, '2026-11-21T17:48:00.000Z');
    expect(next.container.textContent).toMatch(/Approve by.*Tue.*11:48 am/);
    expect(next.container.textContent).toContain('approved automatically');
    expect(next.container.textContent).toContain('in 3 days');
  });

  it('uses the contracted help route', () => {
    mount();
    expect(screen.getAllByRole('link').some((link) => link.getAttribute('href') === routes.help())).toBe(true);
  });

  it('keeps headings in order and renders empty optional sections without missing copy', () => {
    const { onError } = mount({ ...deskBookingPosterConfirmed, checkIn: {}, payments: [], timeline: [] });
    const headings = screen.getAllByRole('heading');
    const levels = headings.map((heading) => Number(heading.tagName.substring(1)));
    for (let index = 1; index < levels.length; index += 1) expect(levels[index]).toBeLessThanOrEqual(levels[index - 1] + 1);
    expect(screen.getByText(messages.bookingHub.noCheckIn)).toBeVisible();
    expect(screen.getByText(messages.bookingHub.noPayments)).toBeVisible();
    expect(screen.getByText(messages.timeline.empty)).toBeVisible();
    expect(onError).not.toHaveBeenCalled();
  });
});

describe.each(roles)('BookingHubScreen %s copy coverage', (viewerRole) => {
  it.each(BOOKING_STATUSES)('has a status badge and explanatory copy for %s', (status) => {
    const { container, onError } = mount({ ...deskBookingPosterConfirmed, viewerRole, status });
    const header = screen.getByRole('heading', { level: 1 }).closest('header')!;
    expect(header).toHaveTextContent(messages.status.booking[viewerRole][status]);
    const t = createTranslator({ locale: 'en', messages, namespace: 'bookingHub' });
    expect(screen.getByText(t(`state.${viewerRole}.${status}`, {
      name: deskBookingPosterConfirmed.poster.displayName,
      date: formatDate(deskBookingPosterConfirmed.terms.start, { timeZone: 'America/Chicago' }),
      time: formatTime(deskBookingPosterConfirmed.terms.start, 'en', 'America/Chicago'),
      deadline: '',
      hasTime: status === 'pending_funding' || status === 'in_progress' || status === 'completion_submitted' ? 'no' : 'yes',
    }))).toBeVisible();
    expect(container.textContent).not.toMatch(/bookingHub\./);
    expect(onError).not.toHaveBeenCalled();
  });

  it.each(CANCEL_REASONS)('describes cancellation reason %s', (cancelReason) => {
    const { container, onError } = mount({ ...deskBookingPosterCanceledLate, viewerRole, cancelReason });
    const expected = messages.bookingHub.canceled[viewerRole][cancelReason]
      .replace('{name}', deskBookingPosterCanceledLate.poster.displayName)
      .replace('{helper}', deskBookingPosterCanceledLate.helper.displayName);
    expect(screen.getByText(expected)).toBeVisible();
    expect(container.textContent).not.toMatch(/bookingHub\./);
    expect(onError).not.toHaveBeenCalled();
  });

  it.each(COMPLETED_VIA)('describes completion via %s', (completedVia) => {
    const { container, onError } = mount({ ...deskBookingPosterCompleted, viewerRole, completedVia });
    const expected = messages.bookingHub.completed[viewerRole][completedVia].replace('{name}', deskBookingPosterCompleted.poster.displayName);
    expect(screen.getByText(expected)).toBeVisible();
    expect(container.textContent).not.toMatch(/bookingHub\./);
    expect(onError).not.toHaveBeenCalled();
  });
});

it.each(PAYMENT_STATUSES)('labels payment status %s without raw codes', (status) => {
  const { onError } = mount({ ...deskBookingPosterConfirmed, payments: [{ ...deskBookingPosterConfirmed.payments![0], status }] });
  const payments = screen.getByRole('region', { name: 'Payments' });
  expect(within(payments).getByText(messages.status.payment[status])).toBeVisible();
  expect(onError).not.toHaveBeenCalled();
});
