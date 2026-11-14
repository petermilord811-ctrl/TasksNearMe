/** @vitest-environment jsdom */
import type React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CommunityFeedPageData, CommunityPostPageData, CommunityReactInput } from '@/contracts';
import { routes } from '@/contracts/routes';
import { communityFeedEmptyData, communityFeedPageData, communityPostHelperViewData, communityPostPageData, fakeHandler } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { CommunityFeedScreen } from './community-feed-screen';
import { CommunityPostScreen } from './community-post-screen';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
afterEach(cleanup);
const now = '2026-11-17T15:00:00.000Z';
const wrap = (node: React.ReactNode) => render(<NextIntlClientProvider locale="en" timeZone="America/Chicago" messages={messages}>{node}</NextIntlClientProvider>);
const feed = (data: CommunityFeedPageData, onReact = fakeHandler<CommunityReactInput>({ ok: true, code: 'updated' })) => wrap(<CommunityFeedScreen data={data} handlers={{ onReact }} now={now} />);
const post = (data: CommunityPostPageData) => wrap(<CommunityPostScreen data={data} now={now} handlers={{ onReact: fakeHandler({ ok: true, code: 'updated' }), onReply: fakeHandler({ ok: true, code: 'sent' }), onPin: fakeHandler({ ok: true, code: 'updated' }), onDelete: fakeHandler({ ok: true, code: 'updated' }) }} />);

describe('CommunityFeedScreen', () => {
  it('asks first, then lists the posts with their kinds, authors’ roles and the pinned answer', () => {
    feed(communityFeedPageData);
    expect(screen.getByRole('heading', { level: 1, name: 'Community' })).toBeDefined();
    const composer = within(screen.getByRole('region', { name: 'Start a post' }));
    expect(composer.getByRole('link', { name: 'Thank a helper' }).getAttribute('href')).toBe(routes.app.newCommunityPost('thanks'));
    expect(screen.getByText('18 posts this week · 7 replies today')).toBeDefined();
    const first = screen.getByRole('article', { name: /Who do you recommend for a flat-pack desk/ });
    expect(within(first).getByText('Pinned answer')).toBeDefined();
    expect(within(first).getByText('Recommended by 6 neighbors')).toBeDefined();
    expect(within(first).getByRole('link', { name: 'See all 3 replies' }).getAttribute('href')).toBe(routes.app.communityPost('cpo_desk'));
    // Your own post shows its counts, without buttons to react to yourself.
    expect(within(first).queryByRole('button', { name: /Helpful/ })).toBeNull();
  });

  it('links each scope, sort and kind to its own address', () => {
    feed(communityFeedPageData);
    expect(within(screen.getByRole('navigation', { name: 'Where' })).getByRole('link', { name: 'All of Austin' }).getAttribute('href')).toBe(routes.app.community({ scope: 'market' }));
    expect(within(screen.getByRole('navigation', { name: 'Sort' })).getByRole('link', { name: 'Top this month' }).getAttribute('href')).toBe(routes.app.community({ sort: 'top' }));
    expect(within(screen.getByRole('navigation', { name: 'Post type' })).getByRole('link', { name: 'Tip' }).getAttribute('href')).toBe(routes.app.community({ kind: 'tip' }));
  });

  it('reacts at once and keeps the change when the server agrees', async () => {
    const onReact = vi.fn(fakeHandler<CommunityReactInput>({ ok: true, code: 'updated' }));
    feed(communityFeedPageData, onReact);
    const question = screen.getByRole('article', { name: /bagged leaves/ });
    const helpful = within(question).getAllByRole('button', { name: /Helpful/ })[0]!;
    expect(helpful.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(helpful);
    expect(helpful.getAttribute('aria-pressed')).toBe('true');
    expect(onReact).toHaveBeenCalledWith({ targetKind: 'post', targetId: 'cpo_leaves', kind: 'helpful', on: true });
  });

  it('says when a filter has nothing yet', () => {
    feed(communityFeedEmptyData);
    expect(screen.getByRole('heading', { name: 'No posts like that yet' })).toBeDefined();
  });
});

describe('CommunityPostScreen', () => {
  it('puts the pinned answer first and lets the author pin and delete', () => {
    post(communityPostPageData);
    expect(screen.getByRole('heading', { level: 1, name: /Who do you recommend/ })).toBeDefined();
    const replies = within(screen.getByRole('region', { name: '3 replies' })).getAllByRole('article');
    expect(within(replies[0]!).getByText('Pinned answer')).toBeDefined();
    expect(within(replies[1]!).getByText('Recommended themself')).toBeDefined();
    expect(screen.getAllByRole('button', { name: /^More:/ }).length).toBeGreaterThan(0);
  });

  it('offers a helper the people they can recommend, themself last', () => {
    post(communityPostHelperViewData);
    const select = screen.getByLabelText('Recommend a helper (optional)') as HTMLSelectElement;
    expect([...select.options].map((option) => option.textContent)).toEqual(['No one in particular', 'Sam K.', 'Lee M. (you)']);
  });
});
