/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jordan, priya } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import { VerificationBadges } from './verification-badges';

// jsdom has no layout observer; tooltip behavior is exercised with the real Radix primitive.
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('VerificationBadges', () => {
  it('opens the badge explanation on click and keeps the date available in compact mode', async () => {
    const user = userEvent.setup();
    render(<NextIntlClientProvider locale="en" messages={uiMessages}><VerificationBadges badges={jordan.badges} compact /></NextIntlClientProvider>);

    await user.click(screen.getByRole('button', { name: 'ID verified' }));
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('A government ID and selfie matched on');
    expect(tooltip).toHaveTextContent('2026');
    expect(tooltip).toHaveTextContent('does not guarantee work quality');
  });

  it('does not invent verification when none is supplied', () => {
    render(<NextIntlClientProvider locale="en" messages={uiMessages}><VerificationBadges badges={{ ...priya.badges, phoneVerified: false }} /></NextIntlClientProvider>);
    expect(screen.getByText('No verification badges yet')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
