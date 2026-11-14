/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CommunityFeedMore, CommunityPostView } from '@/contracts';
import { routes } from '@/contracts/routes';
import { communityFeedPageData, fakeHandler } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { CommunityFeedList } from './feed-list';

/** The community feed, continuous (completion plan 7.7): the next pages are added under the posts shown. */
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }) }));
afterEach(cleanup);

const now = '2026-11-17T15:00:00.000Z';
const [first, second, third, fourth] = communityFeedPageData.posts as [CommunityPostView, CommunityPostView, CommunityPostView, CommunityPostView];
const query = { scope: 'nearby', sort: 'active' } as const;
const titled = (post: CommunityPostView, id: string, title: string): CommunityPostView => ({ ...post, id, title });

function renderList(props: Partial<Parameters<typeof CommunityFeedList>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="en" timeZone="America/Chicago" messages={messages}>
      <CommunityFeedList posts={[first, second]} query={query} page={1} pageCount={2} now={now} onReact={fakeHandler({ ok: true, code: 'updated' })} {...props} />
    </NextIntlClientProvider>,
  );
}

describe('CommunityFeedList', () => {
  it('adds the next page under the posts shown, once each, then says you’re caught up', async () => {
    // Page 2 repeats a post that moved up while reading: it shows once.
    const page2: CommunityFeedMore = { posts: [second, titled(third, 'cpo_more_1', 'Who fixes fences?'), titled(fourth, 'cpo_more_2', 'Leaf pickup dates')], page: 2, pageCount: 2 };
    const onMore = vi.fn(async () => page2);
    const { container } = renderList({ onMore });
    // The feed's own list (posts hold lists of their own): its items are the posts.
    const posts = () => container.querySelector('ol')!.children;
    expect(posts()).toHaveLength(2);

    await act(async () => {
      fireEvent.click(screen.getByRole('link', { name: 'Show more posts' }));
    });
    expect(onMore).toHaveBeenCalledWith({ scope: 'nearby', sort: 'active', page: 2 });
    expect(posts()).toHaveLength(4);
    expect(within(posts()[2] as HTMLElement).getByText('Who fixes fences?')).toBeDefined();
    expect(screen.getByText('2 more posts added')).toBeDefined();
    expect(screen.queryByRole('link', { name: 'Show more posts' })).toBeNull();
    expect(screen.getByText("You're all caught up")).toBeDefined();
  });

  it('is a link to the next page without loading in place, and says why when a page fails', async () => {
    const { unmount } = renderList();
    expect(screen.getByRole('link', { name: 'Show more posts' }).getAttribute('href')).toBe(routes.app.community({ ...query, page: 2 }));
    unmount();

    renderList({ onMore: vi.fn(async () => null) });
    await act(async () => {
      fireEvent.click(screen.getByRole('link', { name: 'Show more posts' }));
    });
    expect(screen.getByRole('alert').textContent).toBe("Couldn't load more posts. Try again.");
    // Still there to try again.
    expect(screen.getByRole('link', { name: 'Show more posts' })).toBeDefined();
  });

  it('has nothing more to show on the last page', () => {
    renderList({ pageCount: 1 });
    expect(screen.queryByRole('link', { name: 'Show more posts' })).toBeNull();
    expect(screen.getByText("You're all caught up")).toBeDefined();
  });
});
