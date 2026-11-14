/** @vitest-environment jsdom */
import type React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ThreadSummary } from '@/contracts';
import { routes } from '@/contracts/routes';
import { deskOfferThreadPageData, mayaInboxPageData } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { MessageLog } from '@/ui/screens/messages/message-log';
import { InboxList, keepThread } from './inbox-list';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(cleanup);
const now = '2026-11-17T16:00:00.000Z';
const wrap = (node: React.ReactNode) => render(<NextIntlClientProvider locale="en" timeZone="America/Chicago" messages={messages}>{node}</NextIntlClientProvider>);
const [booking, offer] = mayaInboxPageData.threads as [ThreadSummary, ThreadSummary];
const threads: ThreadSummary[] = [{ ...booking, unreadCount: 2 }, offer];

describe('InboxList', () => {
  it('filters by unread, offers and bookings, and searches names and tasks as you type', () => {
    wrap(<InboxList threads={threads} now={now} />);
    const list = () => screen.getByRole('list', { name: 'Conversations' });
    expect(within(list()).getAllByRole('link')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /^Unread/ }));
    expect(within(list()).getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /^Unread/ }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Offers' }));
    expect(within(list()).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([routes.app.thread(offer.id)]);
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search conversations' }), { target: { value: 'zzz' } });
    expect(screen.getByText('No conversations match.')).toBeDefined();
  });

  it('marks the open conversation beside it', () => {
    wrap(<InboxList threads={threads} now={now} currentId={offer.id} variant="pane" />);
    expect(screen.getByRole('link', { current: 'page' }).getAttribute('href')).toBe(routes.app.thread(offer.id));
  });

  it('keeps regular visits with bookings and requests with offers', () => {
    expect(keepThread({ ...booking, kind: 'series' }, 'bookings', '')).toBe(true);
    expect(keepThread({ ...offer, kind: 'invite' }, 'offers', '')).toBe(true);
    expect(keepThread(offer, 'bookings', '')).toBe(false);
    expect(keepThread(offer, 'all', offer.otherParty.displayName.toUpperCase())).toBe(true);
  });
});

describe('MessageLog', () => {
  it('puts "New messages" above the first unread one and shows a name once per group', () => {
    const data = deskOfferThreadPageData;
    const first = data.messages.find((message) => message.kind === 'text')!;
    wrap(<MessageLog messages={data.messages} otherParty={data.thread.otherParty} now={now} firstUnreadId={first.id} />);
    const items = screen.getAllByRole('listitem');
    const divider = items.findIndex((item) => item.textContent === 'New messages');
    expect(divider).toBeGreaterThan(-1);
    expect(items[divider + 1]!.textContent).toContain(data.thread.otherParty.displayName);
    // Two messages from the same person a minute apart: the second one's name is for screen readers only.
    const names = screen.getAllByText(data.thread.otherParty.displayName, { selector: 'p' });
    expect(names.filter((name) => name.className.includes('sr-only')).length).toBeGreaterThan(0);
  });
});
