/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ActionResult } from '@/contracts';
import { routes } from '@/contracts/routes';
import { portalWelcome, portalWelcomeEmptyData } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { NeighborsWelcomeCard } from './neighbors-welcome';

afterEach(cleanup);
const show = (props: Parameters<typeof NeighborsWelcomeCard>[0]) => render(<NextIntlClientProvider locale="en" messages={messages}><NeighborsWelcomeCard {...props} /></NextIntlClientProvider>);

/** The welcome for new movers (2026-11-24). */
describe('NeighborsWelcomeCard', () => {
  it('names the place, its best-rated helpers and most helpful tips, and asks a question in the dialog', () => {
    show({ welcome: portalWelcome });
    expect(screen.getByRole('heading', { name: 'Welcome to Mueller' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Top-rated helpers nearby' })).toBeDefined();
    for (const helper of portalWelcome.helpers) expect(screen.getByRole('link', { name: helper.displayName }).getAttribute('href')).toBe(routes.helperProfile(helper.handle));
    const tip = portalWelcome.tips[0]!;
    expect(screen.getByRole('link', { name: new RegExp(tip.title) }).getAttribute('href')).toBe(routes.app.communityPost(tip.id));
    expect(screen.getByText('9 found it helpful')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Ask a question' }).getAttribute('href')).toBe(routes.app.newCommunityPost('question'));
    // Without a handler there's nothing to close.
    expect(screen.queryByRole('button', { name: 'Got it' })).toBeNull();
  });

  it('says so when the place has nothing yet', () => {
    show({ welcome: portalWelcomeEmptyData.welcome! });
    expect(screen.getByRole('heading', { name: 'Welcome to Austin' })).toBeDefined();
    expect(screen.getByText(/No helpers or tips in Austin yet/)).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Top-rated helpers nearby' })).toBeNull();
  });

  it('closes once "Got it" is saved, naming the welcome', async () => {
    let settle: (result: ActionResult) => void = () => undefined;
    const onDismiss = vi.fn(() => new Promise<ActionResult>((resolve) => { settle = resolve; }));
    show({ welcome: portalWelcome, onDismiss });
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Closing…' }).hasAttribute('disabled')).toBe(true));
    expect(onDismiss).toHaveBeenCalledWith({ id: portalWelcome.id });
    settle({ ok: true, code: 'updated' });
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Welcome to Mueller' })).toBeNull());
  });

  it('stays, and says it, when closing fails', async () => {
    show({ welcome: portalWelcome, onDismiss: async () => ({ ok: false, code: 'unknown' }) });
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe("That didn't close. Try again."));
    expect(screen.getByRole('heading', { name: 'Welcome to Mueller' })).toBeDefined();
  });
});
