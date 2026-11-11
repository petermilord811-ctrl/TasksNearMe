/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CASE_RESOLUTIONS, CASE_STATUSES, PROBLEM_REASONS, routes,
  type BookingDisputeView, type BookingViewerRole,
} from '@/contracts';
import {
  deskBookingHelperDisputed, deskBookingHelperDisputedContacted, deskBookingHelperSettled,
  deskBookingPosterDisputed, deskBookingPosterSettled,
} from '@/fixtures';
import { formatDate, formatMoney } from '@/shared/format';
import messages from '../../../../messages/en/ui';
import { BookingDisputeCard } from './booking-dispute-card';

afterEach(cleanup);

const roles: BookingViewerRole[] = ['poster', 'helper'];
const openDispute = deskBookingPosterDisputed.dispute!;
const settledDispute = deskBookingPosterSettled.dispute!;
const settlement = settledDispute.resolution!;
const helperSettlement = deskBookingHelperSettled.dispute!.resolution!;

function mount(dispute: BookingDisputeView = openDispute, viewerRole: BookingViewerRole = 'poster') {
  const onError = vi.fn();
  return {
    onError,
    ...render(<NextIntlClientProvider locale="en" messages={messages} onError={onError}>
      <BookingDisputeCard dispute={dispute} viewerRole={viewerRole} />
    </NextIntlClientProvider>),
  };
}

describe('BookingDisputeCard', () => {
  it('shows the supplied report reason, case status and Central-time opening date', () => {
    const { onError } = mount();
    expect(screen.getByRole('region', { name: messages.bookingHub.dispute.title })).toBeVisible();
    expect(screen.getByRole('heading', { name: messages.bookingHub.dispute.title })).toBeVisible();
    expect(screen.getByText(messages.reportProblem.reasons[openDispute.reason])).toBeVisible();
    expect(screen.getByText(messages.status.case.awaiting_support)).toBeVisible();
    expect(screen.getByText(`Opened ${formatDate(openDispute.openedAt)}`)).toHaveAttribute('dateTime', openDispute.openedAt);
    expect(onError).not.toHaveBeenCalled();
  });

  it.each(roles)('only offers %s the case link when the supplied permission allows it', (viewerRole) => {
    const first = mount({ ...openDispute, canOpenCase: false }, viewerRole);
    expect(screen.queryByRole('link', { name: messages.bookingHub.dispute.viewCase })).not.toBeInTheDocument();
    first.unmount();
    mount({ ...openDispute, canOpenCase: true }, viewerRole);
    expect(screen.getByRole('link', { name: messages.bookingHub.dispute.viewCase })).toHaveAttribute('href', routes.app.supportCase(openDispute.caseId));
  });

  it('explains how support will contact a helper who cannot open the case yet', () => {
    mount(deskBookingHelperDisputed.dispute!, 'helper');
    expect(screen.getByText("Support is reviewing a problem report about this booking. They'll contact you here if they need anything.")).toBeVisible();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows a contacted helper that support is waiting on them and links to the case', () => {
    mount(deskBookingHelperDisputedContacted.dispute!, 'helper');
    expect(screen.getByText(messages.status.case.awaiting_you)).toBeVisible();
    expect(screen.getByRole('link', { name: messages.bookingHub.dispute.viewCase })).toBeVisible();
    expect(screen.queryByText(messages.bookingHub.dispute.helperReview)).not.toBeInTheDocument();
  });

  it('shows the decision and supplied support summary once resolved', () => {
    mount(settledDispute);
    expect(screen.getByRole('region', { name: messages.bookingHub.dispute.resolvedTitle })).toBeVisible();
    expect(screen.getByText('Settled at a lower price')).toBeVisible();
    expect(screen.getByText(settlement.summary)).toBeVisible();
    expect(screen.getByText(messages.status.case.resolved)).toBeVisible();
  });

  it.each(roles)('keeps resolved-case access tied to canOpenCase for %s', (viewerRole) => {
    mount({ ...settledDispute, canOpenCase: false }, viewerRole);
    expect(screen.queryByRole('link', { name: messages.bookingHub.dispute.viewCase })).not.toBeInTheDocument();
  });

  it.each(roles)('shows only the %s money outcome even if both amounts are supplied', (viewerRole) => {
    const { container } = mount({
      ...settledDispute,
      resolution: { ...settlement, receivesCents: helperSettlement.receivesCents },
    }, viewerRole);
    const refund = `${formatMoney(settlement.refundCents!)} was refunded to your card`;
    const receives = `You receive ${formatMoney(helperSettlement.receivesCents!)} for this booking`;
    expect(screen.getByText(viewerRole === 'poster' ? refund : receives)).toBeVisible();
    expect(screen.queryByText(viewerRole === 'poster' ? receives : refund)).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent(formatMoney(viewerRole === 'poster' ? helperSettlement.receivesCents! : settlement.refundCents!));
  });

  it.each(roles)('does not substitute the other person\'s amount when the %s amount is absent', (viewerRole) => {
    const resolution = viewerRole === 'poster' ? helperSettlement : settlement;
    mount({ ...settledDispute, resolution }, viewerRole);
    expect(screen.getByText(resolution.summary)).toBeVisible();
    expect(screen.queryByText(/was refunded to your card/)).not.toBeInTheDocument();
    expect(screen.queryByText(/You receive .* for this booking/)).not.toBeInTheDocument();
  });

  it.each(roles)('preserves an explicitly supplied zero outcome for %s', (viewerRole) => {
    mount({ ...settledDispute, resolution: { ...settlement, refundCents: 0, receivesCents: 0 } }, viewerRole);
    expect(screen.getByText(viewerRole === 'poster' ? '$0.00 was refunded to your card' : 'You receive $0.00 for this booking')).toBeVisible();
  });

  it('does not invent a decision or money outcome when no resolution is supplied', () => {
    mount();
    expect(screen.queryByText(settlement.summary)).not.toBeInTheDocument();
    expect(screen.queryByText(/was refunded to your card/)).not.toBeInTheDocument();
    expect(screen.queryByText(/You receive .* for this booking/)).not.toBeInTheDocument();
  });

  it.each(PROBLEM_REASONS)('uses the existing problem reason copy for %s', (reason) => {
    const { onError } = mount({ ...openDispute, reason });
    expect(screen.getByText(messages.reportProblem.reasons[reason])).toBeVisible();
    expect(onError).not.toHaveBeenCalled();
  });

  describe.each(roles)('%s case status copy', (viewerRole) => {
    it.each(CASE_STATUSES)('labels %s for the viewer', (status) => {
      const { onError } = mount({ ...openDispute, status }, viewerRole);
      const expected = status === `awaiting_${viewerRole}` ? messages.status.case.awaiting_you : messages.status.case[status];
      expect(screen.getByText(expected)).toBeVisible();
      expect(onError).not.toHaveBeenCalled();
    });
  });

  it.each(CASE_RESOLUTIONS)('has readable decision copy for %s', (type) => {
    const { container, onError } = mount({ ...settledDispute, resolution: { ...settlement, type } });
    expect(screen.getByText(messages.bookingHub.dispute.resolutions[type])).toBeVisible();
    expect(container.textContent).not.toMatch(/bookingHub\.|reportProblem\.|status\.case\./);
    expect(onError).not.toHaveBeenCalled();
  });
});
