/** @vitest-environment jsdom */
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { helpArticlePeek, helpCenterPeek, helperPeek, helperSelfPeek, legalPeek } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { PeekSheet, type PeekSheetProps } from './peek-sheet';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
// jsdom has no layout observer; the verification badges' tooltips (Radix) measure with one.
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

function renderSheet(props: Partial<PeekSheetProps>) {
  const handlers = { onOpenChange: vi.fn(), onBack: vi.fn(), onShow: vi.fn(), onRetry: vi.fn(), onMessage: vi.fn(), onRequest: vi.fn(), onToggleSaved: vi.fn(async () => true) };
  const all: PeekSheetProps = { open: true, target: { kind: 'helper', handle: 'sam-k' }, load: { status: 'loading' }, placement: 'right', modal: true, canGoBack: false, ...handlers, ...props };
  const wrap = (node: React.ReactNode) => <NextIntlClientProvider locale="en" timeZone="America/Chicago" messages={messages}>{node}</NextIntlClientProvider>;
  render(wrap(<PeekSheet {...all} />));
  return all;
}

describe('PeekSheet', () => {
  it('shows a helper’s profile with Request, Message, Save and the full profile in a new tab', async () => {
    const user = userEvent.setup();
    const props = renderSheet({ load: { status: 'ready', data: helperPeek } });
    const sheet = screen.getByRole('dialog', { name: 'Sam K.' });
    expect(within(sheet).getByText('@sam_k')).toBeInTheDocument();
    const full = within(sheet).getByRole('link', { name: 'Open full profile' });
    expect(full).toHaveAttribute('href', '/helpers/sam-k');
    expect(full).toHaveAttribute('target', '_blank');
    await user.click(within(sheet).getByRole('button', { name: 'Request Sam K.' }));
    expect(props.onRequest).toHaveBeenCalledWith('sam-k');
    await user.click(within(sheet).getByRole('button', { name: 'Message' }));
    expect(props.onMessage).toHaveBeenCalledWith('sam-k');
    const save = within(sheet).getByRole('button', { name: 'Save' });
    await user.click(save);
    await waitFor(() => expect(props.onToggleSaved).toHaveBeenCalledWith(helperPeek.kind === 'helper' ? helperPeek.data.profile.helper.id : '', true));
    expect(within(sheet).getByRole('button', { name: 'Saved' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows your own profile without the buttons that act on it', () => {
    renderSheet({ load: { status: 'ready', data: helperSelfPeek } });
    expect(screen.getByText('This is your profile, as others see it.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Request/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('opens a help center article in the sheet, and an article’s related ones too, with Back', async () => {
    const user = userEvent.setup();
    const center = renderSheet({ target: { kind: 'help' }, load: { status: 'ready', data: helpCenterPeek } });
    const first = helpCenterPeek.kind === 'help' && helpCenterPeek.data.kind === 'center' ? helpCenterPeek.data.data.topics[0]!.articles[0]! : null;
    await user.click(screen.getByRole('button', { name: new RegExp(first!.title) }));
    expect(center.onShow).toHaveBeenCalledWith({ kind: 'help', slug: first!.slug });
    cleanup();
    const article = renderSheet({ target: { kind: 'help', slug: 'when-am-i-charged' }, load: { status: 'ready', data: helpArticlePeek }, canGoBack: true });
    expect(screen.getByRole('link', { name: 'Open in new tab' })).toHaveAttribute('href', '/help/when-am-i-charged');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(article.onBack).toHaveBeenCalledTimes(1);
  });

  it('shows a policy, and says when it didn’t load', async () => {
    const user = userEvent.setup();
    renderSheet({ target: { kind: 'legal', doc: 'terms' }, load: { status: 'ready', data: legalPeek } });
    expect(screen.getByRole('dialog', { name: legalPeek.kind === 'legal' ? legalPeek.data.title : '' })).toBeInTheDocument();
    cleanup();
    const failed = renderSheet({ load: { status: 'error' } });
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(failed.onRetry).toHaveBeenCalledTimes(1);
  });
});
