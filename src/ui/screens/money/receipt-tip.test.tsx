/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deskTipReceiptPageData, mayaPaymentsWithTipData } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { PaymentsScreen } from './payments-screen';
import { ReceiptScreen } from './receipt-screen';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn(); });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const noop = async () => ({ ok: true as const, code: 'updated' as const });

describe('tips on receipts (UI-057)', () => {
  it('lists the tip as its own line and counts it in the net', () => {
    render(<NextIntlClientProvider locale="en" messages={messages}><ReceiptScreen data={deskTipReceiptPageData} /></NextIntlClientProvider>);
    const activity = screen.getByRole('region', { name: messages.receipt.activity });
    const tip = within(activity).getByText(messages.receipt.tip).closest('li')!;
    expect(within(tip).getByText('$9.00')).toBeInTheDocument();
    expect(within(activity).getByText('$75.00')).toBeInTheDocument();
  });

  it('adds the tip to the booking row on the payments page', () => {
    render(<NextIntlClientProvider locale="en" messages={messages}>
      <PaymentsScreen data={mayaPaymentsWithTipData} handlers={{ onAddCard: noop, onRemoveCard: noop, onMakeDefault: noop }} now="2026-11-25T15:00:00.000Z" />
    </NextIntlClientProvider>);
    // The tipped row says the tip and what was paid in all; no "Refunded $0.00" where nothing came back (audit L30).
    const tipped = screen.getByText('Tip $9.00').closest('li')!;
    expect(within(tipped).getAllByText('$75.00').length).toBeGreaterThan(0);
    expect(within(tipped).queryByText(/Refunded/)).not.toBeInTheDocument();
    expect(screen.getByText('Charged $86.00 · Refunded $12.00')).toBeInTheDocument();
  });
});
