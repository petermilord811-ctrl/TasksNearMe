/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../../../../messages/en/ui';
import { InstantPayoutCard } from './instant-payout-card';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const offer = { availableCents: 6000, feeCents: 90, netCents: 5910 };

describe('InstantPayoutCard', () => {
  it('says what arrives and what it costs, and cashes out only after confirming', async () => {
    const user = userEvent.setup();
    const onInstantPayout = vi.fn(async () => ({ ok: true as const, code: 'submitted' as const }));
    render(<NextIntlClientProvider locale="en" messages={messages}><InstantPayoutCard offer={offer} onInstantPayout={onInstantPayout} /></NextIntlClientProvider>);
    expect(screen.getByRole('heading', { name: messages.earnings.instant.title })).toBeInTheDocument();
    expect(screen.getByText(/\$60\.00 can go to your debit card in minutes/)).toBeInTheDocument();
    expect(screen.getByText(/Instant payout fee: \$0\.90 .*You get \$59\.10/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cash out $59.10' }));
    expect(screen.getByRole('alertdialog', { name: 'Cash out $59.10 now?' })).toBeInTheDocument();
    expect(onInstantPayout).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: messages.earnings.instant.confirm }));
    await waitFor(() => expect(onInstantPayout).toHaveBeenCalledOnce());
    expect(await screen.findByText(messages.earnings.instant.sent)).toBeInTheDocument();
    expect(navigation.refresh).toHaveBeenCalled();
  });

  it('keeps the helper on the page when the cash-out is refused', async () => {
    const user = userEvent.setup();
    const onInstantPayout = vi.fn(async () => ({ ok: false as const, code: 'rate_limited' as const }));
    render(<NextIntlClientProvider locale="en" messages={messages}><InstantPayoutCard offer={offer} onInstantPayout={onInstantPayout} /></NextIntlClientProvider>);
    await user.click(screen.getByRole('button', { name: 'Cash out $59.10' }));
    await user.click(screen.getByRole('button', { name: messages.earnings.instant.confirm }));
    await waitFor(() => expect(onInstantPayout).toHaveBeenCalledOnce());
    expect(navigation.refresh).not.toHaveBeenCalled();
    expect(screen.queryByText(messages.earnings.instant.sent)).not.toBeInTheDocument();
  });
});
