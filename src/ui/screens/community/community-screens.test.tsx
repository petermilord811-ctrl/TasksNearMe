/** @vitest-environment jsdom */
import type React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CommunityPostPageData, CommunityReactInput, PortalHandlers, PortalPageData } from '@/contracts';
import { routes } from '@/contracts/routes';
import { communityPostHelperViewData, communityPostPageData, fakeHandler, portalBlockedData, portalEmptyData, portalFeedData, portalFilteredEmptyData, portalListData, portalLongThreadData, portalPostWithTaskData, portalSavedData } from '@/fixtures';
import { resetLastVisits } from '@/ui/lib/last-visit';
import messages from '../../../../messages/en/ui';
import { CommunityPostScreen } from './community-post-screen';
import { PortalScreen } from './portal-screen';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
afterEach(cleanup);
const now = '2026-11-17T15:00:00.000Z';
const wrap = (node: React.ReactNode) => render(<NextIntlClientProvider locale="en" timeZone="America/Chicago" messages={messages}>{node}</NextIntlClientProvider>);
const portalHandlers = (change: Partial<PortalHandlers> = {}): PortalHandlers => ({
  onReact: fakeHandler({ ok: true, code: 'updated' }),
  onSavePost: fakeHandler({ ok: true, code: 'updated' }),
  onPost: fakeHandler({ ok: true, code: 'sent' }),
  ...change,
});
const portal = (data: PortalPageData, change: Partial<PortalHandlers> = {}) => wrap(<PortalScreen data={data} handlers={portalHandlers(change)} now={now} />);
const post = (data: CommunityPostPageData) => wrap(<CommunityPostScreen data={data} now={now} handlers={{ onReact: fakeHandler({ ok: true, code: 'updated' }), onReply: fakeHandler({ ok: true, code: 'sent' }), onPin: fakeHandler({ ok: true, code: 'updated' }), onDelete: fakeHandler({ ok: true, code: 'updated' }) }} />);

describe('PortalScreen', () => {
  it('names the place, lists its neighborhoods with counts, and asks first', () => {
    portal(portalFeedData);
    expect(screen.getByRole('heading', { level: 1, name: 'Mueller and nearby' })).toBeDefined();
    const areas = within(screen.getByRole('navigation', { name: 'Neighborhoods' }));
    expect(areas.getByRole('link', { name: /^Near you/ }).getAttribute('aria-current')).toBe('page');
    expect(areas.getByRole('link', { name: /^All of Austin/ }).getAttribute('href')).toBe(routes.app.community({ area: 'all' }));
    const composer = within(screen.getByRole('region', { name: 'Start a post' }));
    expect(composer.getByRole('link', { name: 'Thanks' }).getAttribute('href')).toBe(routes.app.newCommunityPost('thanks'));
    // "Post a task": a chip from `sm`, a + on phones; both open the wizard.
    const postTask = composer.getAllByRole('link', { name: 'Post a task' });
    expect(postTask).toHaveLength(2);
    for (const link of postTask) expect(link.getAttribute('href')).toBe(routes.app.newTask());
  });

  it('shows posts and tasks together, each task opening where it should for the viewer', () => {
    portal(portalFeedData);
    const post = screen.getByRole('article', { name: /Who do you recommend for a flat-pack desk/ });
    expect(within(post).getByText('Pinned answer')).toBeDefined();
    // Your own ask turns into a task draft.
    expect(within(post).getByRole('link', { name: 'Ask for help' }).getAttribute('href')).toBe(routes.app.newTask({ fromPost: 'cpo_desk' }));
    const task = screen.getByRole('article', { name: /Put together a queen bed frame tonight/ });
    expect(within(task).getByRole('link', { name: 'View task' }).getAttribute('href')).toBe(routes.publicTask('put-together-a-queen-bed-frame-tonight-mueller-g7h8'));
    const yours = screen.getByRole('article', { name: /Assemble a desk/ });
    expect(within(yours).getByRole('link', { name: 'Manage' }).getAttribute('href')).toBe(routes.app.task('tsk_desk'));
    // A task from a neighborhood post links back to it.
    const shelf = screen.getByRole('article', { name: /Assemble and anchor a tall bookshelf/ });
    expect(within(shelf).getByRole('link', { name: /How long does anchoring a tall bookshelf take/ }).getAttribute('href')).toBe(routes.app.communityPost('cpo_shelf_ask'));
  });

  it('keeps every filter when the view, sort or type changes', () => {
    portal({ ...portalFeedData, query: { ...portalFeedData.query, category: 'furniture-assembly', time: '7d' } });
    expect(within(screen.getByRole('navigation', { name: 'View' })).getByRole('link', { name: 'List' }).getAttribute('href')).toBe(routes.app.community({ category: 'furniture-assembly', time: '7d', view: 'list' }));
    expect(within(screen.getByRole('navigation', { name: 'Sort' })).getByRole('link', { name: 'New' }).getAttribute('href')).toBe(routes.app.community({ category: 'furniture-assembly', time: '7d', sort: 'new' }));
    expect(within(screen.getByRole('navigation', { name: 'Show' })).getByRole('link', { name: /^Tasks/ }).getAttribute('href')).toBe(routes.app.community({ category: 'furniture-assembly', time: '7d', type: 'task' }));
    // The filters in use come off one at a time.
    expect(within(screen.getByRole('navigation', { name: 'Filters in use' })).getByRole('link', { name: 'Remove filter: Past week' }).getAttribute('href')).toBe(routes.app.community({ category: 'furniture-assembly' }));
  });

  it('reacts at once and keeps the change when the server agrees', () => {
    const onReact = vi.fn(fakeHandler<CommunityReactInput>({ ok: true, code: 'updated' }));
    portal(portalFeedData, { onReact });
    const question = screen.getByRole('article', { name: /bagged leaves/ });
    const helpful = within(question).getAllByRole('button', { name: /Helpful/ })[0]!;
    expect(helpful.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(helpful);
    expect(helpful.getAttribute('aria-pressed')).toBe('true');
    expect(onReact).toHaveBeenCalledWith({ targetKind: 'post', targetId: 'cpo_leaves', kind: 'helpful', on: true });
  });

  it('saves a post at once, and puts it back when the server refuses', async () => {
    const onSavePost = vi.fn(async () => ({ ok: false as const, code: 'rate_limited' as const }));
    portal(portalFeedData, { onSavePost });
    const save = within(screen.getByRole('article', { name: /Rent the dolly/ })).getByRole('button', { name: /Rent the dolly/ });
    expect(save.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(save);
    expect(save.getAttribute('aria-pressed')).toBe('false');
    expect(onSavePost).toHaveBeenCalledWith({ postId: 'cpo_truck_tip', saved: false });
    await vi.waitFor(() => expect(save.getAttribute('aria-pressed')).toBe('true'));
  });

  it('lists the same items as rows by neighborhood, with counts and "See all"', () => {
    portal(portalListData);
    const mueller = screen.getByRole('region', { name: /^Mueller/ });
    expect(within(mueller).getAllByRole('article')).toHaveLength(5);
    expect(within(mueller).getByRole('link', { name: 'See all 8 in Mueller' }).getAttribute('href')).toBe(routes.app.community({ view: 'list', area: 'mueller' }));
    expect(screen.getByRole('region', { name: /^Across Austin/ })).toBeDefined();
  });

  it('says what to do when nothing matches, when nothing is saved, and on a quiet first day', () => {
    portal(portalFilteredEmptyData);
    expect(screen.getByRole('heading', { name: 'Nothing like that here yet' })).toBeDefined();
    cleanup();
    portal({ ...portalSavedData, items: [], totalCount: 0 });
    expect(screen.getByRole('heading', { name: 'Nothing saved yet' })).toBeDefined();
    cleanup();
    portal(portalEmptyData);
    expect(screen.getByRole('heading', { name: "It's quiet in Mueller so far" })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Who do you recommend for yard cleanup?' }).getAttribute('href')).toBe(routes.app.newCommunityPost('recommendation'));
  });

  it('asks for a verified phone before posting', () => {
    portal(portalBlockedData);
    expect(within(screen.getByRole('region', { name: 'Start a post' })).getByRole('status').textContent).toContain('Verify your phone number to post and reply.');
  });
});

describe('CommunityPostScreen', () => {
  it('marks the replies since your last visit, never your own, and says how many', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.parse(now));
    try {
      resetLastVisits();
      window.localStorage.clear();
      // The last look at the post ended at 2 pm; the self-tag (2:05 pm) and the tip (2:40 pm, yours here) came after.
      window.localStorage.setItem(`tnm:visit:post:${communityPostPageData.post.id}`, JSON.stringify({ seen: Date.parse('2026-11-17T14:00:00.000Z'), previous: null }));
      const [pinned, selfTag, tip] = communityPostPageData.replies;
      post({ ...communityPostPageData, replies: [pinned!, selfTag!, { ...tip!, author: { ...tip!.author, isYou: true } }] });
      expect(screen.getByRole('heading', { level: 2, name: /^3 replies/ }).textContent).toContain('1 new since your last visit');
      const marked = (reply: { id: string }) => within(document.getElementById(`reply-${reply.id}`)!).queryByTitle('Since your last visit');
      expect(marked(selfTag!)).not.toBeNull();
      expect(marked(pinned!)).toBeNull();
      expect(marked(tip!)).toBeNull();
    } finally {
      window.localStorage.clear();
      resetLastVisits();
      vi.useRealTimers();
    }
  });

  it('marks nothing on a first visit', () => {
    resetLastVisits();
    window.localStorage.clear();
    post(communityPostPageData);
    expect(screen.queryByTitle('Since your last visit')).toBeNull();
    expect(screen.queryByText(/new since your last visit/)).toBeNull();
    window.localStorage.clear();
    resetLastVisits();
  });

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

  it('folds a long thread after ten replies, and opens the rest on request', () => {
    post(portalLongThreadData);
    const replies = within(screen.getByRole('region', { name: '30 replies' }));
    expect(replies.getAllByRole('article')).toHaveLength(10);
    fireEvent.click(screen.getByRole('button', { name: 'Show 20 more replies' }));
    expect(replies.getAllByRole('article')).toHaveLength(30);
  });

  it('shows the task a post became, and no "Ask for help" any more', () => {
    post(portalPostWithTaskData);
    expect(screen.getByRole('link', { name: /Posted as a task/ }).getAttribute('href')).toBe(routes.app.task('tsk_desk'));
    expect(screen.queryByRole('link', { name: 'Ask for help' })).toBeNull();
  });
});
