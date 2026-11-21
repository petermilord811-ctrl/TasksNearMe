/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import { TASK_STATUSES, BOOKING_STATUSES, OFFER_STATUSES, INVITE_STATUSES, PAYMENT_STATUSES, EARNINGS_STATUSES, REWARD_STATUSES, CASE_STATUSES, type ViewerRole, type TaskStatus } from '@/contracts';
import uiMessages from '../../../../messages/en/ui';
import statusMessages from '../../../../messages/en/ui/status.json';
import { useBookingStatus, useTaskStatus } from './use-status';
import { StatusBadge } from './status-badge';

afterEach(cleanup);

function BookingExample({ viewer }: { viewer: ViewerRole }) { return <StatusBadge {...useBookingStatus('completion_submitted', viewer)} />; }
function TaskExample({ status }: { status: TaskStatus }) { return <StatusBadge {...useTaskStatus(status)} />; }

describe('status labels', () => {
  // A draft that people meet is Book again's private request, waiting on the helper (J-C7).
  it.each([['draft', 'Request sent', 'neutral'], ['open', 'Open', 'brand'], ['assigned', 'Booked', 'info'], ['completed', 'Done', 'success'], ['canceled', 'Canceled', 'neutral'], ['expired', 'Expired', 'neutral']] as const)('shows the %s task label and tone', (status, label, tone) => {
    render(<NextIntlClientProvider locale="en" messages={uiMessages}><TaskExample status={status} /></NextIntlClientProvider>);
    expect(screen.getByText(label).parentElement).toHaveClass(`bg-badge-${tone}`);
  });

  it.each([['poster', 'Needs your approval'], ['helper', 'Waiting for approval']] as const)('shows the %s completion label', (viewer, label) => {
    render(<NextIntlClientProvider locale="en" messages={uiMessages}><BookingExample viewer={viewer} /></NextIntlClientProvider>);
    expect(screen.getByText(label)).toBeVisible();
  });

  it('covers every status enum used by this ticket', () => {
    for (const status of TASK_STATUSES) expect(statusMessages.task).toHaveProperty(status);
    for (const viewer of ['poster', 'helper', 'staff'] as const) for (const status of BOOKING_STATUSES) expect(statusMessages.booking[viewer]).toHaveProperty(status);
    for (const status of OFFER_STATUSES) expect(statusMessages.offer).toHaveProperty(status === 'pending' ? 'pending_poster' : status);
    for (const status of INVITE_STATUSES) expect(statusMessages.invite).toHaveProperty(status === 'sent' ? 'sent_poster' : status);
    for (const status of PAYMENT_STATUSES) expect(statusMessages.payment).toHaveProperty(status);
    for (const status of EARNINGS_STATUSES) expect(statusMessages.earnings).toHaveProperty(status);
    for (const status of REWARD_STATUSES) expect(statusMessages.reward).toHaveProperty(status);
    for (const status of CASE_STATUSES) expect(statusMessages.case).toHaveProperty(status);
  });
});
