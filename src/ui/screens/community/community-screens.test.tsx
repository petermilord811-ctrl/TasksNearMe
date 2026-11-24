/** @vitest-environment jsdom */
import type React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CommunityPostHandlers, CommunityPostPageData, CommunityReactInput, PortalHandlers, PortalPageData } from '@/contracts';
import { routes } from '@/contracts/routes';
import { communityPostHelperViewData, communityPostPageData, communityPostReplyBlockedData, fakeHandler, portalBlockedData, portalEmptyData, portalFeedData, portalFilteredEmptyData, portalListByDayData, portalListData, portalLongThreadData, portalNoOpenTasksData, portalOpenTasksByDayData, portalOpenTasksData, portalOpenTasksEmptyData, portalOpenTasksFilteredData, portalOpenTasksHelperData, portalPostWithTaskData, portalSavedData, portalTasksData } from '@/fixtures';
import { resetLastVisits } from '@/ui/lib/last-visit';
import messages from '../../../../messages/en/ui';
import { RouteDialogFrame } from '@/ui/components/layout/route-dialog-frame';
import { CommunityPostDialog, CommunityPostScreen } from './community-post-screen';
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
  it('links "Across {market}" to everything citywide (sweep P10)', () => {
    portal({ ...portalListData, sections: portalListData.sections!.map((section) => (section.kind === 'market' ? { ...section, count: 9 } : section)) });
    const link = screen.getByRole('link', { name: /See all 9 citywide/ });
    expect(link.getAttribute('href')).toContain('area=citywide');
  });

  it('lists by the day posted on Neighbors, newest day first (sweep P9)', () => {
    portal(portalListByDayData);
    const days = [...document.querySelectorAll('[id^="portal-day-"]')].map((heading) => heading.id.slice('portal-day-'.length));
    expect(days.length).toBeGreaterThan(1);
    expect(days).toEqual([...days].sort().reverse());
  });

  it('lists one neighborhood’s open tasks by the day they’re on, soonest first, with no grouping to choose (2026-11-23)', () => {
    portal(portalTasksData);
    const days = [...document.querySelectorAll('[id^="portal-day-"]')].map((heading) => heading.id.slice('portal-day-'.length));
    expect(days.length).toBeGreaterThan(1);
    expect(days).toEqual([...days].sort());
    // Today and Tomorrow by name, as the board says them; each day counts its open tasks.
    expect(screen.getByRole('heading', { level: 2, name: /^Today/ }).textContent).toContain('1 open task');
    expect(screen.getByRole('heading', { level: 2, name: /^Tomorrow/ })).toBeDefined();
    expect(screen.queryByRole('navigation', { name: 'Group' })).toBeNull();
  });

  it('names the place, lists its neighborhoods with counts, and asks first', () => {
    portal(portalFeedData);
    // The phone's sticky row and the wide screens' heading each name the place (CSS shows one of them, plan 10.7).
    expect(screen.getAllByRole('heading', { level: 1, name: 'Mueller and nearby' })).toHaveLength(2);
    const areas = within(screen.getByRole('navigation', { name: 'Neighborhoods' }));
    expect(areas.getByRole('link', { name: /^Near you/ }).getAttribute('aria-current')).toBe('page');
    expect(areas.getByRole('link', { name: /^All of Austin/ }).getAttribute('href')).toBe(routes.app.community({ area: 'all' }));
    // One slim line (2026-11-22): the prompt opens the new-post dialog, where the kind is chosen; tasks are posted from
    // the app's own "Post a task".
    const composer = within(screen.getByRole('region', { name: 'Start a post' }));
    expect(composer.getByRole('link', { name: 'Share something with your neighbors…' }).getAttribute('href')).toBe(routes.app.newCommunityPost());
    expect(composer.queryByRole('link', { name: 'Post a task' })).toBeNull();
  });

  it('shows a general post by its words, named by its first line, with its time as its link (2026-11-22)', () => {
    portal(portalFeedData);
    const post = within(screen.getByRole('article', { name: 'The sunset over the Mueller lake tonight was something.' }));
    // No title of its own: its words, and no title link.
    expect(post.getByText(/The herons are back on the little island/)).toBeDefined();
    expect(post.queryByRole('link', { name: /The sunset over the Mueller lake/ })).toBeNull();
    expect(post.getAllByRole('link').some((link) => link.getAttribute('href') === routes.app.communityPost('cpo_lake_sunset'))).toBe(true);
    // The Posts tab counts it.
    expect(within(screen.getByRole('navigation', { name: 'Show' })).getByRole('link', { name: /^Posts/ }).getAttribute('href')).toBe(routes.app.community({ type: 'general' }));
  });

  it('shows the posts on Neighbors, each task once: in "Open tasks near you" and in the post that became one (2026-11-24)', () => {
    portal(portalFeedData);
    const post = screen.getByRole('article', { name: /Who do you recommend for a flat-pack desk/ });
    expect(within(post).getByText('Pinned answer')).toBeDefined();
    // Your own ask turns into a task draft.
    expect(within(post).getByRole('link', { name: 'Ask for help' }).getAttribute('href')).toBe(routes.app.newTask({ fromPost: 'cpo_desk' }));
    // No task cards or runs of task rows in the stream: tasks are Open tasks'.
    const stream = document.getElementById('portal-stream')!;
    expect(stream.querySelectorAll('[data-item="task"]')).toHaveLength(0);
    expect(stream.querySelectorAll('[data-item="post"]').length).toBe(portalFeedData.items.length);
    expect(within(stream).queryByRole('heading', { name: /New tasks near you/ })).toBeNull();
    // Her own task isn't news here: it waits in Your stuff (audit M20).
    expect(screen.queryByRole('article', { name: /Assemble a desk/ })).toBeNull();
    expect(screen.getAllByRole('link', { name: /Assemble a desk/ }).every((link) => link.getAttribute('href') === routes.app.task('tsk_desk'))).toBe(true);
    // The ask that became a task shows it.
    const shelf = screen.getByRole('article', { name: /How long does anchoring a tall bookshelf take/ });
    expect(within(shelf).getByRole('link', { name: /Posted as a task/ })).toBeDefined();
  });

  it('opens each task where it should for the viewer, and links a task back to the post it came from', () => {
    portal(portalOpenTasksHelperData, { onSaveTask: fakeHandler({ ok: true, code: 'updated' }) });
    const shelf = screen.getByRole('article', { name: /Assemble and anchor a tall bookshelf/ });
    expect(within(shelf).getByRole('link', { name: /How long does anchoring a tall bookshelf take/ }).getAttribute('href')).toBe(routes.app.communityPost('cpo_shelf_ask'));
    // No "Task" flair on Open tasks: everything there is one (2026-11-24).
    expect(within(shelf).queryByText('Task', { exact: true })).toBeNull();
  });

  it('shows a helper where they stand on each task, as find work says it (audit M23)', () => {
    portal(portalOpenTasksHelperData, { onSaveTask: fakeHandler({ ok: true, code: 'updated' }) });
    const card = (name: RegExp) => within(screen.getByRole('article', { name }));
    const computer = card(/Set up a new laptop/);
    expect(computer.getByText("You don't offer this service")).toBeDefined();
    expect(computer.getByRole('link', { name: 'View task' })).toBeDefined();
    expect(computer.queryByRole('link', { name: 'Make an offer' })).toBeNull();
    const bed = card(/queen bed frame/);
    expect(bed.getByText('Your offer expired')).toBeDefined();
    expect(bed.getByRole('link', { name: 'Send a new offer' }).getAttribute('href')).toBe(routes.app.findWorkTask('tsk_board_bed'));
    expect(bed.getByText('No live offers')).toBeDefined();
    const dresser = card(/six-drawer dresser/);
    expect(dresser.getByText('You made an offer')).toBeDefined();
    expect(dresser.getByRole('link', { name: 'View your offer' })).toBeDefined();
    expect(card(/two-door wardrobe/).getByRole('link', { name: 'Make an offer' })).toBeDefined();
  });

  it('keeps every filter when the view, sort or type changes', () => {
    portal({ ...portalFeedData, query: { ...portalFeedData.query, category: 'furniture-assembly', time: '7d' } });
    expect(within(screen.getByRole('navigation', { name: 'View' })).getByRole('link', { name: 'List' }).getAttribute('href')).toBe(routes.app.community({ category: 'furniture-assembly', time: '7d', view: 'list' }));
    expect(within(screen.getByRole('navigation', { name: 'Sort' })).getByRole('link', { name: 'New' }).getAttribute('href')).toBe(routes.app.community({ category: 'furniture-assembly', time: '7d', sort: 'new' }));
    // Tasks left the Show tabs for the switch (2026-11-23): its Open tasks keeps the service and the time.
    expect(within(screen.getByRole('navigation', { name: 'Show' })).queryByRole('link', { name: /^Tasks/ })).toBeNull();
    for (const nav of screen.getAllByRole('navigation', { name: 'Neighbors or open tasks' })) {
      expect(within(nav).getByRole('link', { name: /^Open tasks/ }).getAttribute('href')).toBe(routes.app.community({ category: 'furniture-assembly', time: '7d', type: 'task' }));
    }
    // The filters in use come off one at a time.
    expect(within(screen.getByRole('navigation', { name: 'Filters in use' })).getByRole('link', { name: 'Remove filter: Past week' }).getAttribute('href')).toBe(routes.app.community({ category: 'furniture-assembly' }));
  });

  it('puts the Neighbors | Open tasks switch at the top, Neighbors marked, with the place’s open tasks counted (2026-11-23)', () => {
    portal(portalFeedData);
    // One for phones (the sticky bar) and one for wide screens; CSS shows one of them.
    const switches = screen.getAllByRole('navigation', { name: 'Neighbors or open tasks' });
    expect(switches).toHaveLength(2);
    for (const nav of switches) {
      expect(within(nav).getByText('Neighbors').closest('[aria-current="page"]')).not.toBeNull();
      expect(within(nav).queryByRole('link', { name: /^Neighbors/ })).toBeNull();
      const tasks = within(nav).getByRole('link', { name: /^Open tasks/ });
      expect(tasks.textContent).toContain('7');
      expect(tasks.getAttribute('href')).toBe(routes.app.community({ type: 'task' }));
    }
    // The heading's count opens the same tab.
    expect(screen.getAllByRole('link', { name: '7 open tasks' }).every((link) => link.getAttribute('href') === routes.app.community({ type: 'task' }))).toBe(true);
  });

  it('shows the place’s newest open tasks beside Neighbors: the rail’s card and the Feed’s strip (2026-11-23)', () => {
    portal(portalFeedData);
    // The rail's card and the Feed's strip share their name (CSS shows one of them).
    const regions = screen.getAllByRole('region', { name: 'Open tasks near you' });
    expect(regions).toHaveLength(2);
    const card = within(regions.find((region) => region.querySelector('#portal-open-tasks'))!);
    const rows = card.getAllByRole('link').filter((link) => link.getAttribute('href') !== routes.app.community({ type: 'task' }));
    expect(rows).toHaveLength(5);
    // Newest first, each where it opens for Maya (the public task page).
    expect(rows[0]!.textContent).toContain('Put together a queen bed frame tonight');
    expect(rows[0]!.getAttribute('href')).toBe(routes.publicTask('put-together-a-queen-bed-frame-tonight-mueller-g7h8'));
    expect(card.getByRole('link', { name: /See all 7 open tasks/ }).getAttribute('href')).toBe(routes.app.community({ type: 'task' }));
    // The Feed's strip (no rail on phones and tablets) after the first three items.
    const strip = regions.find((region) => region.querySelector('#portal-open-tasks-strip'));
    expect(strip).toBeDefined();
    expect(within(strip!).getAllByRole('article')).toHaveLength(5);
    const feed = screen.getByRole('list', { name: 'Feed' });
    const items = [...feed.children];
    expect(items.findIndex((item) => item.contains(strip!))).toBe(3);
  });

  it('says so when no task is open nearby, with the way to post one', () => {
    portal(portalNoOpenTasksData);
    const card = within(screen.getByRole('region', { name: 'Open tasks near you' }));
    expect(card.getByText('No open tasks here right now.')).toBeDefined();
    expect(card.getByRole('link', { name: 'Post a task' }).getAttribute('href')).toBe(routes.app.newTask());
    // Nothing to swipe through in the Feed.
    expect(document.getElementById('portal-open-tasks-strip')).toBeNull();
  });

  it('opens Open tasks as the board inside the app: rows by neighborhood, its sorts, its composer, no post tabs (2026-11-23)', () => {
    portal(portalOpenTasksData);
    for (const nav of screen.getAllByRole('navigation', { name: 'Neighbors or open tasks' })) {
      expect(within(nav).getByText('Open tasks').closest('[aria-current="page"]')).not.toBeNull();
      expect(within(nav).getByRole('link', { name: 'Neighbors' }).getAttribute('href')).toBe(routes.app.community());
    }
    expect(screen.queryByRole('navigation', { name: 'Show' })).toBeNull();
    // The board's composer: words become a task to post.
    expect(screen.getByRole('region', { name: 'Post in Austin' })).toBeDefined();
    // The board's sorts in a menu, as the board has them (Soonest chosen): the phone's row and the toolbar each have it.
    expect(screen.queryByRole('navigation', { name: 'Sort' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Sort: Soonest' })).toHaveLength(2);
    // The Neighbors tab's look at this one isn't here (this is the list itself).
    expect(screen.queryByRole('region', { name: 'Open tasks near you' })).toBeNull();
    // Rows by neighborhood, counted in open tasks; remote work last.
    expect(screen.getByRole('heading', { level: 2, name: /^Mueller/ }).textContent).toContain('4 open tasks');
    expect(screen.getByRole('heading', { level: 2, name: /^Remote/ })).toBeDefined();
    // Save this search: the board's view with the same place, for alerts.
    expect(screen.getByRole('link', { name: 'Save this search' }).getAttribute('href')).toBe(routes.app.newSavedSearch(portalOpenTasksData.boardHref));
  });

  it('lists Open tasks by the day they’re on, today first', () => {
    portal(portalOpenTasksByDayData);
    const days = [...document.querySelectorAll('[id^="portal-day-"]')].map((heading) => heading.id.slice('portal-day-'.length));
    expect(days).toEqual([...days].sort());
    expect(document.querySelector('[id^="portal-day-"]')?.textContent).toMatch(/^Today/);
  });

  it('shows the board’s filters in use on Open tasks, each removable, and clears them all', () => {
    portal(portalOpenTasksFilteredData);
    const inUse = within(screen.getByRole('navigation', { name: 'Filters in use' }));
    const { query } = portalOpenTasksFilteredData;
    expect(inUse.getByRole('link', { name: 'Remove filter: $50 to $99' }).getAttribute('href')).toBe(routes.app.community({ ...query, minPrice: undefined, maxPrice: undefined }));
    expect(inUse.getByRole('link', { name: 'Remove filter: Morning (before noon)' }).getAttribute('href')).toBe(routes.app.community({ ...query, slots: [] }));
    expect(inUse.getByRole('link', { name: 'Remove filter: 0 or 1 offers so far' }).getAttribute('href')).toBe(routes.app.community({ ...query, few: false }));
    expect(inUse.getByRole('link', { name: 'Clear all' }).getAttribute('href')).toBe(routes.app.community({ type: 'task' }));
  });

  it('says when no open task is near, with the way to post one', () => {
    portal(portalOpenTasksEmptyData);
    expect(screen.getByText('No open tasks in Mueller right now')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Post a task and get offers' }).getAttribute('href')).toBe(routes.app.newTask());
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
    const save = within(screen.getByRole('article', { name: /Rent the dolly/ })).getByRole('button', { name: /^(Save|Remove from Saved): Rent the dolly/ });
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
    expect(within(mueller).getByRole('link', { name: 'See all 7 in Mueller' }).getAttribute('href')).toBe(routes.app.community({ view: 'list', area: 'mueller' }));
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

  it('verifies the phone right there when the page brings the phone steps (2026-11-23)', () => {
    portal(portalBlockedData, { onStartPhoneChange: fakeHandler({ ok: true, code: 'sent' }), onConfirmPhoneChange: fakeHandler({ ok: true, code: 'updated' }) });
    const composer = within(screen.getByRole('region', { name: 'Start a post' }));
    expect(composer.getByRole('button', { name: 'Verify your phone' })).toBeDefined();
    expect(composer.queryByRole('link', { name: 'Verify your phone' })).toBeNull();
  });
});

describe('CommunityPostScreen', () => {
  it('says why an open post takes no reply from this reader, and how to fix it (sweep P3)', () => {
    post(communityPostReplyBlockedData);
    expect(screen.getByText(/Verify your phone number to post and reply\./)).toBeDefined();
    expect(screen.getByRole('link', { name: 'Verify your phone' }).getAttribute('href')).toBe(routes.app.account());
    expect(screen.queryByText('Replies are closed.')).toBeNull();
    cleanup();
    post({ ...communityPostReplyBlockedData, viewer: { ...communityPostReplyBlockedData.viewer, replyBlocked: 'suspended' } });
    expect(screen.getByText(/Your account can't post right now\./)).toBeDefined();
    expect(screen.queryByRole('link', { name: 'Verify your phone' })).toBeNull();
    cleanup();
    // A closed post says it's closed.
    post({ ...communityPostHelperViewData, viewer: { ...communityPostHelperViewData.viewer, canReply: false } });
    expect(screen.getByText('Replies are closed.')).toBeDefined();
  });

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
    const replies = within(screen.getByRole('region', { name: '4 replies' })).getAllByRole('article');
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

  it('opens over the page as a dialog named for its author, the post titled under it, without the side column (2026-11-23)', () => {
    const handlers: CommunityPostHandlers = { onReact: fakeHandler({ ok: true, code: 'updated' }), onReply: fakeHandler({ ok: true, code: 'sent' }), onPin: fakeHandler({ ok: true, code: 'updated' }), onDelete: fakeHandler({ ok: true, code: 'updated' }) };
    wrap(<RouteDialogFrame><CommunityPostDialog data={communityPostPageData} handlers={handlers} now={now} /></RouteDialogFrame>);
    // Maya's own post: "Your post"; someone else's is named for them (the reply-blocked one below is Maya's, read by Lee).
    const dialog = screen.getByRole('dialog', { name: 'Your post' });
    expect(within(dialog).getByRole('heading', { level: 2, name: /Who do you recommend/ })).toBeDefined();
    expect(within(dialog).queryByRole('heading', { level: 1, name: /Who do you recommend/ })).toBeNull();
    expect(within(dialog).getByRole('region', { name: '4 replies' })).toBeDefined();
    expect(within(dialog).queryByRole('complementary')).toBeNull();
    expect(within(dialog).queryByRole('link', { name: messages.community.back })).toBeNull();
    cleanup();
    wrap(<RouteDialogFrame><CommunityPostDialog data={communityPostReplyBlockedData} handlers={{ ...handlers, onStartPhoneChange: fakeHandler({ ok: true, code: 'sent' }), onConfirmPhoneChange: fakeHandler({ ok: true, code: 'updated' }) }} now={now} /></RouteDialogFrame>);
    expect(screen.getByRole('dialog', { name: "Maya R.'s post" })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Verify your phone' })).toBeDefined();
  });

  it('shows the task a post became, and no "Ask for help" any more', () => {
    post(portalPostWithTaskData);
    expect(screen.getByRole('link', { name: /Posted as a task/ }).getAttribute('href')).toBe(routes.app.task('tsk_desk'));
    expect(screen.queryByRole('link', { name: 'Ask for help' })).toBeNull();
  });
});
