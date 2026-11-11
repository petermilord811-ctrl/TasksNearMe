/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ADDRESS_VISIBILITY, BOOKING_STATUSES, CANCEL_REASONS, COMPLETED_VIA, PAYMENT_STATUSES, routes,
  type BookingHubHandlers, type BookingView, type BookingViewerRole,
} from '@/contracts';
import {
  deskBookingHelperCompleted, deskBookingHelperCompletedAddressHidden, deskBookingHelperConfirmed,
  deskBookingHelperInProgress, deskBookingHelperPendingFunding, deskBookingPosterCanceledLate,
  deskBookingPosterCompleted, deskBookingPosterCompletionSubmitted, deskBookingPosterConfirmed,
  deskBookingPosterPendingFunding, deskExactAddress, fakeHandler, movingBookingPosterConfirmed,
  remoteBookingHelperConfirmed,
} from '@/fixtures';
import { formatDate, formatDateTime, formatMonthYear, formatTime, formatTimeRange } from '@/shared/format';
import messages from '../../../../messages/en/ui';
import { BookingHubScreen } from './booking-hub-screen';

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
    ...render(<NextIntlClientProvider locale="en" messages={messages} onError={onError}>
      <BookingHubScreen data={data} handlers={{ onAction }} now={now} />
    </NextIntlClientProvider>),
  };
}

const roles: BookingViewerRole[] = ['poster', 'helper'];

describe('BookingHubScreen privacy and supplied data', () => {
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
    expect(payments).toHaveTextContent(formatDateTime(deskBookingPosterConfirmed.payments![0].at));
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

  it('uses a compact helper card for the client', () => {
    mount();
    expect(screen.getByRole('link', { name: deskBookingPosterConfirmed.helper.displayName })).toHaveAttribute('href', routes.helperProfile(deskBookingPosterConfirmed.helper.handle));
  });

  it('shows client identity and verification to the helper', () => {
    const { container } = mount(deskBookingHelperConfirmed);
    expect(screen.getByRole('heading', { name: deskBookingHelperConfirmed.poster.displayName })).toBeVisible();
    expect(container.textContent).toContain(deskBookingHelperConfirmed.poster.initials);
    expect(container.textContent).toContain(formatMonthYear(deskBookingHelperConfirmed.poster.memberSince));
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
    expect(container.textContent).toContain(formatDateTime(terms.start));
    expect(container.textContent).toContain(formatDate(task.schedule.windowStart));
    expect(container.textContent).toContain(formatTimeRange(task.schedule.windowStart, task.schedule.windowEnd));
  });

  it('shows each supplied check-in update', () => {
    const { container } = mount({ ...deskBookingHelperInProgress, checkIn: { ...deskBookingHelperInProgress.checkIn, lateByMinutes: 20 } });
    expect(container.textContent).toMatch(/On my way at 9:58 am/);
    expect(container.textContent).toMatch(/Running 20 minutes late/);
    expect(container.textContent).toMatch(/Arrived at 10:24 am/);
  });

  it('shows the hourly estimate, cap and allowance without adding the allowance to the canonical charge', () => {
    const { container } = mount(movingBookingPosterConfirmed);
    expect(container.textContent).toContain(movingBookingPosterConfirmed.terms.scopeText);
    expect(container.textContent).toContain('$35.00');
    expect(container.textContent).toContain('3.5 h');
    expect(container.textContent).toContain('4 h');
    expect(container.textContent).toContain('$20.00');
    expect(screen.getByText('Total charged').closest('div')).toHaveTextContent('$154.00');
    expect(screen.getByText(/You paid for up to 4 hours.*Unused hours are refunded after you approve/)).toBeVisible();
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
      date: formatDate(deskBookingPosterConfirmed.terms.start),
      time: formatTime(deskBookingPosterConfirmed.terms.start),
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
