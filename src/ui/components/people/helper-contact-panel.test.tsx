/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MARKET_TIME_ZONE, type HelperContactAccess, type HelperContactReveal } from '@/contracts';
import { helperContactLockedAccess, helperContactRevealAccess, helperContactRevealData } from '@/fixtures';
import { formattersFor } from '@/ui/lib/format';
import uiMessages from '../../../../messages/en/ui';
import { HelperContactPanel } from './helper-contact-panel';

/** The contact details a helper shares with top Sparks levels (2026-11-24), on their profile. */

afterEach(cleanup);

function show(access: HelperContactAccess, onReveal: (input: { helperId: string }) => Promise<HelperContactReveal>) {
  return render(<NextIntlClientProvider locale="en" messages={uiMessages}>
    <HelperContactPanel helperId="usr_jordan" name="Jordan T." access={access} onReveal={onReveal} />
  </NextIntlClientProvider>);
}

describe('HelperContactPanel', () => {
  it('keeps the details out of the page until Show, then links them', async () => {
    const onReveal = vi.fn(async () => helperContactRevealData);
    show(helperContactRevealAccess, onReveal);
    expect(screen.getByRole('region', { name: 'Contact details' })).toHaveTextContent('Jordan T. shares their email and phone number with neighbors who’ve earned a top Sparks level, like you.');
    expect(screen.queryByText('jordan@example.test')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show email and phone' }));
    await waitFor(() => expect(screen.getByRole('link', { name: 'Email: jordan@example.test' })).toHaveAttribute('href', 'mailto:jordan@example.test'));
    expect(onReveal).toHaveBeenCalledWith({ helperId: 'usr_jordan' });
    expect(screen.getByRole('link', { name: 'Phone: (512) 555-0201' })).toHaveAttribute('href', 'tel:+15125550201');
    expect(screen.getByRole('link', { name: /paying outside TasksNearMe/ })).toHaveAttribute('target', '_blank');
  });

  it('names only what is shared, and says when the day’s limit is reached', async () => {
    show({ state: 'reveal', shares: ['phone'] }, async () => ({ ok: false, code: 'rate_limited', retryAt: '2026-11-25T00:00:00.000Z' }));
    expect(screen.getByText('Jordan T. shares their phone number with neighbors who’ve earned a top Sparks level, like you.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show phone number' }));
    const after = formattersFor('en', MARKET_TIME_ZONE).formatDateTime('2026-11-25T00:00:00.000Z');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(`You’ve reached today’s limit for showing contact details. Try again after ${after}.`));
  });

  it('says how far someone short of 2,000 earned Sparks is, with no way to show', () => {
    show(helperContactLockedAccess, async () => helperContactRevealData);
    expect(screen.getByText('Jordan T. shares their email and phone number with neighbors who’ve earned 2,000 Sparks (Pillar and Local legend). Bought Sparks don’t count.')).toBeInTheDocument();
    expect(screen.getByText('You’ve earned 212 of 2,000.')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Earned Sparks toward contact details' })).toHaveAttribute('aria-valuenow', '212');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /How to earn Sparks/ })).toHaveAttribute('target', '_blank');
  });
});
