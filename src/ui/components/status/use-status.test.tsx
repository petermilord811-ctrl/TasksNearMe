/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import { BOOKING_STATUSES, OFFER_STATUSES, INVITE_STATUSES, PAYMENT_STATUSES, EARNINGS_STATUSES, REWARD_STATUSES, CASE_STATUSES, type ViewerRole } from '@/contracts';
import uiMessages from '../../../../messages/en/ui';
import statusMessages from '../../../../messages/en/ui/status.json';
import { useBookingStatus } from './use-status';
import { StatusBadge } from './status-badge';

afterEach(cleanup);

function BookingExample({ viewer }: { viewer: ViewerRole }) { return <StatusBadge {...useBookingStatus('completion_submitted', viewer)} />; }

describe('status labels', () => {
  it.each([['poster', 'Needs your approval'], ['helper', 'Waiting for approval']] as const)('shows the %s completion label', (viewer, label) => {
    render(<NextIntlClientProvider locale="en" messages={uiMessages}><BookingExample viewer={viewer} /></NextIntlClientProvider>);
    expect(screen.getByText(label)).toBeVisible();
  });

  it('covers every status enum used by this ticket', () => {
    for (const viewer of ['poster', 'helper', 'staff'] as const) for (const status of BOOKING_STATUSES) expect(statusMessages.booking[viewer]).toHaveProperty(status);
    for (const status of OFFER_STATUSES) expect(statusMessages.offer).toHaveProperty(status === 'pending' ? 'pending_poster' : status);
    for (const status of INVITE_STATUSES) expect(statusMessages.invite).toHaveProperty(status === 'sent' ? 'sent_poster' : status);
    for (const status of PAYMENT_STATUSES) expect(statusMessages.payment).toHaveProperty(status);
    for (const status of EARNINGS_STATUSES) expect(statusMessages.earnings).toHaveProperty(status);
    for (const status of REWARD_STATUSES) expect(statusMessages.reward).toHaveProperty(status);
    for (const status of CASE_STATUSES) expect(statusMessages.case).toHaveProperty(status);
  });
});
