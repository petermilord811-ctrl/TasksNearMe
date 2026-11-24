import {
  routes,
  type CommunityAuthor,
  type CommunityTaskDiscussion,
  type CommunityPostPageData,
  type CommunityPostView,
  type CommunityReplyView,
  type PortalArea,
  type PortalFacets,
  type NeighborsWelcomeView,
  type PortalHelper,
  type PortalItem,
  type PortalPageData,
  type PortalQueryState,
  type PortalRail,
  type PortalSection,
  type PortalTaskFacets,
  type PortalTaskView,
  type TaskPublicView,
} from '@/contracts';
import { samBadges } from './badges';
import { taskBoardPageData } from './board';
import { communityFeedPosts, communityNewPostPageData, communityPostPageData } from './community';
import { remoteComputerPublicTask } from './marketing';

/**
 * The neighborhood portal (completion plan 9.10, docs/ui/portal-9.10.md), as `getPortal` returns it for Maya in
 * Mueller on 2026-11-17 at 9 a.m. Austin time: the community's posts and the open tasks near her in one stream.
 * Built from the community and board fixtures; tasks keep their canonical prices and times.
 */

export const PORTAL_NOW = '2026-11-17T15:00:00.000Z';

const [recommendationBase, questionBase, thanksBase, tipBase, generalBase] = communityFeedPosts as [CommunityPostView, CommunityPostView, CommunityPostView, CommunityPostView, CommunityPostView];
const boardTask = (id: string): TaskPublicView => {
  const task = taskBoardPageData.tasks.find((candidate) => candidate.id === id);
  if (!task) throw new Error(`board fixture ${id} is missing`);
  return task;
};

// ---- People: the cards behind their names ---------------------------------------------------------------------

const withCard = (author: CommunityAuthor, card: CommunityAuthor['card']): CommunityAuthor => ({ ...author, ...(card ? { card } : {}) });
const mayaCard = { memberSince: '2026-09-03T16:00:00.000Z' };
const priyaCard = { memberSince: '2026-08-21T16:00:00.000Z' };
const anaCard = { memberSince: '2026-10-11T16:00:00.000Z' };
const nateCard = { memberSince: '2026-10-20T15:00:00.000Z' };
const samCard = {
  memberSince: '2026-08-02T16:00:00.000Z',
  helper: { headline: 'Furniture assembly, done carefully and level', rating: { average: 4.9, count: 23 }, completedCount: 25, recommendedBy: 6, responseTime: 'hour' as const, badges: samBadges.slice(0, 3), requestHref: routes.app.requestHelper('sam-k') },
};
const leeCard = {
  memberSince: '2026-09-14T16:00:00.000Z',
  helper: { headline: 'Patient computer help and quick assembly', rating: { average: 5, count: 11 }, completedCount: 12, recommendedBy: 2, responseTime: 'few_hours' as const, badges: [], requestHref: routes.app.requestHelper('lee-m') },
};

const cardFor = (author: CommunityAuthor): CommunityAuthor => {
  if (author.helperHandle === 'sam-k') return withCard(author, samCard);
  if (author.helperHandle === 'lee-m') return withCard(author, leeCard);
  if (author.displayName === 'Maya R.') return withCard(author, mayaCard);
  if (author.displayName === 'Priya S.') return withCard(author, priyaCard);
  if (author.displayName === 'Ana P.') return withCard(author, anaCard);
  return withCard(author, nateCard);
};
const withCards = (reply: CommunityReplyView): CommunityReplyView => ({
  ...reply,
  author: cardFor(reply.author),
  ...(reply.recommendedHelper && !reply.recommendedHelper.selfTag ? { recommendedHelper: { ...reply.recommendedHelper, requestHref: routes.app.requestHelper(reply.recommendedHelper.handle) } } : {}),
});
const portalPost = (post: CommunityPostView, extra: Partial<CommunityPostView> = {}): CommunityPostView => ({
  ...post,
  author: cardFor(post.author),
  previewReplies: post.previewReplies.map(withCards),
  ...(post.thankedHelper ? { thankedHelper: { ...post.thankedHelper, requestHref: routes.app.requestHelper(post.thankedHelper.handle) } } : {}),
  saved: false,
  ...extra,
});

// ---- Posts ----------------------------------------------------------------------------------------------------

/** Maya's own request: she can turn it into a task ("Ask for help"). */
const recommendation = portalPost(recommendationBase, { areaSlug: 'mueller', askForHelpHref: routes.app.newTask({ fromPost: recommendationBase.id }) });
const question = portalPost(questionBase, { areaSlug: 'windsor-park', saved: true });
const thanks = portalPost(thanksBase, { areaSlug: 'mueller' });
const tip = portalPost(tipBase, { saved: true });
// A general post (2026-11-22, any social post): words and a photo.
const general = portalPost(generalBase, { areaSlug: 'mueller' });
/** Priya asked first and then posted it as a task: the post shows the task, and the task the post. */
const shelfAsk = portalPost({
  ...recommendationBase,
  id: 'cpo_shelf_ask',
  kind: 'question',
  title: 'How long does anchoring a tall bookshelf take?',
  body: 'Six-foot bookshelf, drywall, the kit came with it. Is this an hour or an afternoon? Thinking of getting help.',
  author: { displayName: 'Priya S.', initials: 'PS', role: 'poster', verified: true, isYou: false },
  createdAt: '2026-11-16T14:20:00.000Z',
  lastActivityAt: '2026-11-16T16:05:00.000Z',
  replyCount: 2,
  reactions: { thanks: 1, helpful: 2, mine: [] },
  previewReplies: [],
}, {
  areaSlug: 'mueller',
  task: { id: 'tsk_board_shelf', title: 'Assemble and anchor a tall bookshelf', href: routes.publicTask('assemble-and-anchor-a-tall-bookshelf-mueller-a1b2'), state: 'open', offerCount: 1 },
});
const fenceTip = portalPost({
  ...tipBase,
  id: 'cpo_fence_tip',
  kind: 'tip',
  title: 'Leaf blowers are quieter before 9 on Saturdays here',
  body: 'Our HOA asks for no blowers before 9 on weekends. Worth telling whoever does your yard so nobody gets a note on the door.',
  categorySlug: 'yard-cleanup',
  areaName: 'Windsor Park',
  author: { displayName: 'Ana P.', initials: 'AP', role: 'poster', verified: false, isYou: false },
  createdAt: '2026-11-17T11:40:00.000Z',
  lastActivityAt: '2026-11-17T11:40:00.000Z',
  replyCount: 0,
  reactions: { thanks: 2, helpful: 3, mine: [] },
  previewReplies: [],
}, { areaSlug: 'windsor-park' });
/** A Mueller neighbor asking about a crib: Neighbors' fifth Mueller post, so its List section is full. */
const cribAsk = portalPost({
  ...questionBase,
  id: 'cpo_crib',
  kind: 'question',
  title: 'Anyone used a helper for a crib and changing table?',
  body: 'Baby due in January and two flat-pack boxes in the hallway. Did anyone have a helper put theirs together, and anchor the changing table?',
  categorySlug: 'furniture-assembly',
  areaName: 'Mueller',
  author: { displayName: 'Nate O.', initials: 'NO', role: 'neighbor', verified: false, isYou: false },
  createdAt: '2026-11-17T13:10:00.000Z',
  lastActivityAt: '2026-11-17T14:30:00.000Z',
  replyCount: 4,
  reactions: { thanks: 0, helpful: 1, mine: [] },
  previewReplies: [],
  saved: false,
}, { areaSlug: 'mueller' });

// ---- Tasks ----------------------------------------------------------------------------------------------------

const neighbor = (displayName: string, initials: string, memberSince: string) => ({ displayName, initials, memberSince, phoneVerified: true });
const bed: TaskPublicView = { ...boardTask('tsk_board_bed'), poster: neighbor('Ana P.', 'AP', anaCard.memberSince) };
const wardrobe: TaskPublicView = { ...boardTask('tsk_board_wardrobe'), poster: neighbor('Priya S.', 'PS', priyaCard.memberSince) };
const bookshelf: TaskPublicView = { ...boardTask('tsk_board_shelf'), poster: neighbor('Priya S.', 'PS', priyaCard.memberSince) };
const dresser: TaskPublicView = { ...boardTask('tsk_board_dresser'), poster: neighbor('Nate O.', 'NO', nateCard.memberSince) };
const moving: TaskPublicView = boardTask('tsk_board_moving');
const yard: TaskPublicView = { ...boardTask('tsk_yard'), poster: neighbor('Ana P.', 'AP', anaCard.memberSince) };
const computer: TaskPublicView = { ...remoteComputerPublicTask, taskType: 'computer', poster: neighbor('Nate O.', 'NO', nateCard.memberSince) };
/** Maya's own task: it opens her task's page. */
const desk: TaskPublicView = boardTask('tsk_desk');

type Relation = PortalTaskView['relation'];
const taskView = (task: TaskPublicView, relation: Relation, extra: Partial<PortalTaskView> = {}): PortalTaskView => ({
  task,
  relation,
  href: relation === 'yours' ? routes.app.task(task.id) : relation === 'helper' ? routes.app.findWorkTask(task.id) : routes.publicTask(task.slug),
  questionCount: 0,
  ...extra,
});

const postItem = (post: CommunityPostView): PortalItem => ({ type: 'post', id: post.id, at: post.createdAt, post });
const taskItem = (view: PortalTaskView): PortalItem => ({ type: 'task', id: view.task.id, at: view.task.postedAt, task: view });

const forMaya = {
  bed: taskView(bed, 'neighbor'),
  wardrobe: taskView(wardrobe, 'neighbor', { questionCount: 1 }),
  bookshelf: taskView(bookshelf, 'neighbor', { fromPost: { id: shelfAsk.id, title: shelfAsk.title } }),
  dresser: taskView(dresser, 'neighbor'),
  moving: taskView(moving, 'neighbor', { questionCount: 2 }),
  yard: taskView(yard, 'neighbor'),
  computer: taskView(computer, 'neighbor'),
};

/**
 * Hot: the liveliest first. Neighbors holds the posts (2026-11-24); the tasks are Open tasks', and the Feed shows their
 * newest in "Open tasks near you" and in the post that became one (the bookshelf ask).
 */
const hotItems: PortalItem[] = [
  postItem(recommendation),
  postItem(general),
  postItem(question),
  postItem(fenceTip),
  postItem(thanks),
  postItem(cribAsk),
  postItem(shelfAsk),
  postItem(tip),
];
const byNewest = [...hotItems].sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));

/**
 * "Open tasks near you" (2026-11-23): the newest open tasks near Maya (her own desk task never), for the rail's card and
 * the Feed's strip; 7 are open near her.
 */
const newestTasks: PortalTaskView[] = Object.values(forMaya).sort((a, b) => b.task.postedAt.localeCompare(a.task.postedAt)).slice(0, 5);

// ---- The place, its counts and the rail -----------------------------------------------------------------------

const query = (change: Partial<PortalQueryState> = {}): PortalQueryState => ({ saved: false, unanswered: false, sort: 'hot', view: 'feed', group: 'area', page: 1, ...change });

/** The market's neighborhoods with how many of the tab's items each holds: posts on Neighbors, tasks on Open tasks. */
const areasWith = (counts: Partial<Record<string, number>>): PortalArea[] => [
  { slug: 'allandale', name: 'Allandale', count: counts.allandale ?? 0, nearby: false, yours: false },
  { slug: 'crestview', name: 'Crestview', count: counts.crestview ?? 0, nearby: true, yours: false },
  { slug: 'downtown', name: 'Downtown', count: counts.downtown ?? 0, nearby: false, yours: false },
  { slug: 'east-austin', name: 'East Austin', count: counts['east-austin'] ?? 0, nearby: true, yours: false },
  { slug: 'hyde-park', name: 'Hyde Park', count: counts['hyde-park'] ?? 0, nearby: true, yours: false },
  { slug: 'mueller', name: 'Mueller', count: counts.mueller ?? 0, nearby: true, yours: true },
  { slug: 'windsor-park', name: 'Windsor Park', count: counts['windsor-park'] ?? 0, nearby: true, yours: false },
  { slug: 'zilker', name: 'Zilker', count: counts.zilker ?? 0, nearby: false, yours: false },
];

/** Neighbors near Mueller, counted from its posts as `getPortal` counts them; Allandale and Zilker have one each too. */
const posts = hotItems.flatMap((item) => (item.type === 'post' ? [item.post] : []));
const postsWhere = (test: (post: CommunityPostView) => boolean) => posts.filter(test).length;
const postsSince = (hours: number) => postsWhere((post) => Date.parse(PORTAL_NOW) - Date.parse(post.createdAt) <= hours * 3_600_000);
const areas = areasWith({ ...Object.fromEntries(['mueller', 'windsor-park'].map((slug) => [slug, postsWhere((post) => post.areaSlug === slug)])), allandale: 1, zilker: 1 });
const facets: PortalFacets = {
  types: { all: posts.length, general: postsWhere((post) => post.kind === 'general'), task: 0, recommendation: postsWhere((post) => post.kind === 'recommendation'), question: postsWhere((post) => post.kind === 'question'), tip: postsWhere((post) => post.kind === 'tip'), thanks: postsWhere((post) => post.kind === 'thanks') },
  categories: { 'furniture-assembly': postsWhere((post) => post.categorySlug === 'furniture-assembly'), 'moving-help': postsWhere((post) => post.categorySlug === 'moving-help'), 'yard-cleanup': postsWhere((post) => post.categorySlug === 'yard-cleanup'), 'light-cleaning': postsWhere((post) => post.categorySlug === 'light-cleaning'), 'computer-help': postsWhere((post) => post.categorySlug === 'computer-help'), general: postsWhere((post) => !post.categorySlug) },
  nearby: posts.length,
  all: posts.length + 2,
  times: { '24h': postsSince(24), '7d': postsSince(24 * 7), '30d': postsSince(24 * 30) },
  saved: postsWhere((post) => Boolean(post.saved)),
  unanswered: 1,
};

const helpers: PortalHelper[] = [
  { handle: 'sam-k', displayName: 'Sam K.', initials: 'SK', headline: 'Furniture assembly, done carefully and level', areaName: 'Mueller', verified: true, rating: { average: 4.9, count: 23 }, completedCount: 25, recommendedBy: 6, responseTime: 'hour', requestHref: routes.app.requestHelper('sam-k') },
  { handle: 'lee-m', displayName: 'Lee M.', initials: 'LM', headline: 'Patient computer help and quick assembly', areaName: 'Windsor Park', verified: true, rating: { average: 5, count: 11 }, completedCount: 12, recommendedBy: 2, responseTime: 'few_hours', requestHref: routes.app.requestHelper('lee-m') },
  { handle: 'jordan-t', displayName: 'Jordan T.', initials: 'JT', headline: 'Moving help with a truck and a dolly', areaName: 'East Austin', verified: true, rating: { average: 4.8, count: 6 }, completedCount: 7, recommendedBy: 1, responseTime: 'day', requestHref: routes.app.requestHelper('jordan-t') },
];

const rail: PortalRail = {
  yourTasks: [{ id: desk.id, title: desk.title, href: routes.app.task(desk.id), offerCount: desk.offerCount }],
  yourPosts: [{ id: recommendation.id, title: recommendation.title, kind: 'recommendation', replyCount: recommendation.replyCount, lastActivityAt: recommendation.lastActivityAt }],
  savedCount: 2,
  helpers,
  trending: [
    { id: tip.id, title: tip.title, kind: 'tip', replyCount: 0, helpful: 9 },
    { id: recommendation.id, title: recommendation.title, kind: 'recommendation', replyCount: 3, helpful: 4, areaName: 'Mueller' },
    { id: question.id, title: question.title, kind: 'question', replyCount: 2, helpful: 3, areaName: 'Windsor Park' },
    { id: thanks.id, title: thanks.title, kind: 'thanks', replyCount: 1, helpful: 2, areaName: 'Mueller' },
  ],
  // Plan 10.17: asks nobody answered yet, the oldest first.
  unanswered: [
    { id: 'cpo_gutter', title: 'Anyone know a helper who does gutter-level leaf cleanup from the ground?', kind: 'recommendation', createdAt: '2026-11-16T16:20:00.000Z', areaName: 'Windsor Park', categorySlug: 'yard-cleanup' },
    { id: 'cpo_printer', title: 'Printer keeps dropping off the Wi-Fi. Worth booking help?', kind: 'question', createdAt: '2026-11-17T08:05:00.000Z', categorySlug: 'computer-help' },
  ],
};

const { kind: _kind, ...composer } = communityNewPostPageData;

const base: PortalPageData = {
  market: { slug: 'austin', name: 'Austin', timeZone: 'America/Chicago' },
  query: query(),
  place: { kind: 'nearby', areaName: 'Mueller' },
  yourArea: { slug: 'mueller', name: 'Mueller' },
  areas,
  facets,
  items: hotItems,
  totalCount: hotItems.length,
  pageCount: 1,
  stats: { openTasks: 7, postsThisWeek: 6, helpers: 9 },
  rail,
  composer,
  me: { initials: 'MR' },
  helps: false,
  live: { areaIds: ['are_crestview', 'are_east_austin', 'are_hyde_park', 'are_mueller', 'are_windsor_park'], areaSlugs: ['crestview', 'east-austin', 'hyde-park', 'mueller', 'windsor-park'], withRemote: true },
  today: '2026-11-17',
  boardHref: routes.taskBoard('austin', { areas: ['crestview', 'east-austin', 'hyde-park', 'mueller', 'windsor-park'], view: 'cards' }),
  openTasks: { items: newestTasks, count: 7 },
};

/** The Feed near Maya, Hot: the posts, the newest open tasks after the third, and the rail. */
export const portalFeedData: PortalPageData = base;

/** Newest first, with a second page to load. */
export const portalNewData: PortalPageData = { ...base, query: query({ sort: 'new' }), items: byNewest.slice(0, 10), totalCount: byNewest.length + 10, pageCount: 2 };

const section = (key: string, areaName: string | undefined, count: number, items: PortalItem[]): PortalSection => ({
  key,
  kind: areaName ? 'area' : 'market',
  ...(areaName ? { areaSlug: key, areaName } : {}),
  count,
  items,
});

const sections: PortalSection[] = [
  section('mueller', 'Mueller', 7, [postItem(recommendation), postItem(general), postItem(thanks), postItem(cribAsk), postItem(shelfAsk)]),
  section('windsor-park', 'Windsor Park', 2, [postItem(question), postItem(fenceTip)]),
  section('market', undefined, 1, [postItem(tip)]),
];

/** The List, by neighborhood (Craigslist): each one's first five and its count, citywide last. */
export const portalListData: PortalPageData = {
  ...base,
  query: query({ view: 'list' }),
  sections,
  items: sections.flatMap((group) => group.items),
  totalCount: sections.reduce((sum, group) => sum + group.count, 0),
};

/** The List by day, newest first. */
export const portalListByDayData: PortalPageData = { ...base, query: query({ view: 'list', group: 'day', sort: 'new' }), items: byNewest, totalCount: byNewest.length };

/**
 * Where Jordan stands on the tasks, as find work says it (audit M23): computer help isn't one of his services, his
 * offer on the bed frame expired (he can send a new one), and the dresser has his offer waiting.
 */
const jordanStanding = (taskId: string): Pick<PortalTaskView, 'myOffer' | 'blockedReason'> =>
  taskId === computer.id ? { blockedReason: 'category_not_offered' } : taskId === bed.id ? { myOffer: { status: 'expired' } } : taskId === dresser.id ? { myOffer: { status: 'pending' } } : {};

/** A task as Jordan (a helper) sees it: it opens his offer page, he can save it, and it says where he stands. */
const forJordan = (view: PortalTaskView): PortalTaskView => ({ ...view, relation: 'helper', href: routes.app.findWorkTask(view.task.id), saved: view.task.id === 'tsk_board_wardrobe', ...jordanStanding(view.task.id) });

/** Jordan (a helper) reads the same place: the newest tasks open his offer page. */
export const portalHelperData: PortalPageData = {
  ...base,
  me: { initials: 'JT' },
  helps: true,
  stats: { ...base.stats, helpers: 8 },
  items: hotItems.map((item): PortalItem => {
    if (item.type === 'task') return item;
    const post = { ...item.post, author: { ...item.post.author, isYou: false } };
    const { askForHelpHref: _askForHelp, ...rest } = post;
    return { ...item, post: rest };
  }),
  rail: { ...rail, yourTasks: [], yourPosts: [], savedCount: 0, helpers: helpers.filter((helper) => helper.handle !== 'jordan-t'), unanswered: [rail.unanswered[0]!] },
  facets: { ...facets, saved: 0 },
  openTasks: { items: newestTasks.map(forJordan), count: 7 },
};

// ---- Open tasks: the switch's second tab (2026-11-23), the board inside Neighbors -------------------------------

/** The board's filters counted near Maya, as `getPortal` reads them on Open tasks (each leaves its own filter out). */
const taskFacets: PortalTaskFacets = {
  prices: { under50: 1, from50: 3, from100: 3, from200: 0 },
  pricing: { fixed: 5, hourly: 2 },
  when: { today: 1, this_week: 5, this_weekend: 2 },
  slots: { morning: 3, afternoon: 2, evening: 3 },
  few: 5,
};
const tasksQuery = (change: Partial<PortalQueryState> = {}): PortalQueryState => query({ type: 'task', sort: 'soonest', view: 'list', ...change });
/** Open tasks near Maya, counted from the tasks as `getPortal` counts them on that tab; Downtown has one too. */
const openTaskViews = Object.values(forMaya);
const tasksWhere = (test: (task: TaskPublicView) => boolean) => openTaskViews.filter((view) => test(view.task)).length;
const tasksIn = (areaName: string) => tasksWhere((task) => task.location.kind !== 'remote' && task.location.areaName === areaName);
const taskTabFacets: PortalFacets = {
  types: { all: openTaskViews.length, general: 0, task: openTaskViews.length, recommendation: 0, question: 0, tip: 0, thanks: 0 },
  categories: { 'furniture-assembly': tasksWhere((task) => task.categorySlug === 'furniture-assembly'), 'moving-help': tasksWhere((task) => task.categorySlug === 'moving-help'), 'yard-cleanup': tasksWhere((task) => task.categorySlug === 'yard-cleanup'), 'light-cleaning': tasksWhere((task) => task.categorySlug === 'light-cleaning'), 'computer-help': tasksWhere((task) => task.categorySlug === 'computer-help'), general: 0 },
  nearby: openTaskViews.length,
  all: openTaskViews.length + 1,
  times: { '24h': tasksWhere((task) => Date.parse(PORTAL_NOW) - Date.parse(task.postedAt) <= 86_400_000), '7d': openTaskViews.length, '30d': openTaskViews.length },
  saved: 0,
  unanswered: 0,
  tasks: taskFacets,
};
const openTasksBase: PortalPageData = {
  ...base,
  areas: areasWith({ mueller: tasksIn('Mueller'), crestview: tasksIn('Crestview'), 'east-austin': tasksIn('East Austin'), 'windsor-park': tasksIn('Windsor Park'), 'hyde-park': tasksIn('Hyde Park'), downtown: 1 }),
  facets: taskTabFacets,
  rail: { ...rail, savedCount: 0 },
  boardHref: routes.taskBoard('austin', { areas: ['crestview', 'east-austin', 'hyde-park', 'mueller', 'windsor-park'] }),
  openTasks: undefined,
};

/** Open tasks in one neighborhood (Mueller): by the day they're on, the soonest first. */
export const portalTasksData: PortalPageData = {
  ...openTasksBase,
  query: tasksQuery({ area: 'mueller' }),
  place: { kind: 'area', slug: 'mueller', name: 'Mueller' },
  items: [taskItem(forMaya.bed), taskItem(forMaya.dresser), taskItem(forMaya.wardrobe), taskItem(forMaya.bookshelf)],
  totalCount: 4,
  facets: { ...taskTabFacets, types: { ...taskTabFacets.types, all: 4, task: 4 } },
  live: { areaIds: ['are_mueller'], areaSlugs: ['mueller'], withRemote: false },
  boardHref: routes.taskBoard('austin', { areas: ['mueller'] }),
};

const taskSections: PortalSection[] = [
  section('mueller', 'Mueller', 4, [taskItem(forMaya.bed), taskItem(forMaya.dresser), taskItem(forMaya.wardrobe), taskItem(forMaya.bookshelf)]),
  section('crestview', 'Crestview', 1, [taskItem(forMaya.yard)]),
  section('east-austin', 'East Austin', 1, [taskItem(forMaya.moving)]),
  section('market', undefined, 1, [taskItem(forMaya.computer)]),
];

/** Open tasks near Maya (the tab's default): the board's dense rows by neighborhood, the soonest first, remote work last. */
export const portalOpenTasksData: PortalPageData = {
  ...openTasksBase,
  query: tasksQuery(),
  sections: taskSections,
  items: taskSections.flatMap((group) => group.items),
  totalCount: 7,
};

/** Open tasks by the day they're on (today, tomorrow, then dates), the soonest first. */
export const portalOpenTasksByDayData: PortalPageData = {
  ...openTasksBase,
  query: tasksQuery({ group: 'day' }),
  items: [forMaya.bed, forMaya.dresser, forMaya.wardrobe, forMaya.moving, forMaya.bookshelf, forMaya.computer, forMaya.yard].map(taskItem),
  totalCount: 7,
};

/**
 * Jordan (a helper) on Open tasks as cards (2026-11-24, where tasks are now): each opens his offer page and says where he
 * stands (his expired offer on the bed frame, his waiting one on the dresser, computer help not his), and he can save them.
 */
export const portalOpenTasksHelperData: PortalPageData = {
  ...openTasksBase,
  query: tasksQuery({ view: 'feed' }),
  me: { initials: 'JT' },
  helps: true,
  items: [forMaya.bed, forMaya.dresser, forMaya.wardrobe, forMaya.moving, forMaya.bookshelf, forMaya.computer, forMaya.yard].map(forJordan).map(taskItem),
  totalCount: 7,
  rail: { ...openTasksBase.rail, yourTasks: [], yourPosts: [], savedCount: 1, helpers: helpers.filter((helper) => helper.handle !== 'jordan-t') },
  facets: { ...taskTabFacets, saved: 1 },
};

/** The board's filters on Open tasks: $50 to $99, mornings, at most one offer so far. */
export const portalOpenTasksFilteredData: PortalPageData = {
  ...openTasksBase,
  query: tasksQuery({ minPrice: 50, maxPrice: 99, slots: ['morning'], few: true }),
  sections: [section('mueller', 'Mueller', 2, [taskItem(forMaya.dresser), taskItem(forMaya.bookshelf)])],
  items: [taskItem(forMaya.dresser), taskItem(forMaya.bookshelf)],
  totalCount: 2,
  facets: { ...taskTabFacets, tasks: { ...taskFacets, prices: { under50: 0, from50: 2, from100: 0, from200: 0 }, slots: { morning: 2, afternoon: 0, evening: 0 }, few: 2 } },
  boardHref: routes.taskBoard('austin', { areas: ['crestview', 'east-austin', 'hyde-park', 'mueller', 'windsor-park'], minPrice: 50, maxPrice: 99, times: ['morning'], few: true }),
};

/** Nothing open near Maya on Open tasks: the way to post one, and the whole city. */
export const portalOpenTasksEmptyData: PortalPageData = {
  ...openTasksBase,
  query: tasksQuery(),
  items: [],
  totalCount: 0,
  facets: { ...taskTabFacets, types: { ...taskTabFacets.types, all: 0, task: 0 }, tasks: { prices: { under50: 0, from50: 0, from100: 0, from200: 0 }, pricing: { fixed: 0, hourly: 0 }, when: { today: 0, this_week: 0, this_weekend: 0 }, slots: { morning: 0, afternoon: 0, evening: 0 }, few: 0 } },
  stats: { ...base.stats, openTasks: 0 },
};

/** Neighbors with no open task near Maya: the rail's card says so, with the way to post one. */
export const portalNoOpenTasksData: PortalPageData = {
  ...base,
  items: hotItems,
  totalCount: hotItems.length,
  stats: { ...base.stats, openTasks: 0 },
  openTasks: { items: [], count: 0 },
};

/** A member we can't place yet (plan 10.15): Neighbors is the whole city, and so are its open tasks. */
export const portalNoAreaData: PortalPageData = {
  ...base,
  place: { kind: 'market' },
  yourArea: undefined,
  areas: areas.map((area) => ({ ...area, nearby: false, yours: false })),
  askArea: true,
  openTasks: { items: newestTasks, count: 8 },
  stats: { ...base.stats, openTasks: 8 },
};

/** What Maya saved. */
export const portalSavedData: PortalPageData = {
  ...base,
  query: query({ saved: true }),
  items: [postItem(question), postItem(tip)],
  totalCount: 2,
};

/** Nothing fits: thanks in Windsor Park this week. */
export const portalFilteredEmptyData: PortalPageData = {
  ...base,
  query: query({ type: 'thanks', area: 'windsor-park', time: '7d' }),
  place: { kind: 'area', slug: 'windsor-park', name: 'Windsor Park' },
  items: [],
  totalCount: 0,
  facets: { ...facets, types: { ...facets.types, thanks: 0 } },
};

/** A quiet neighborhood on its first day: nothing posted yet anywhere near, and no one to show. */
export const portalEmptyData: PortalPageData = {
  ...base,
  areas: areas.map((area) => ({ ...area, count: 0 })),
  facets: { types: { all: 0, general: 0, task: 0, recommendation: 0, question: 0, tip: 0, thanks: 0 }, categories: { 'furniture-assembly': 0, 'moving-help': 0, 'yard-cleanup': 0, 'light-cleaning': 0, 'computer-help': 0, general: 0 }, nearby: 0, all: 0, times: { '24h': 0, '7d': 0, '30d': 0 }, saved: 0, unanswered: 0 },
  items: [],
  totalCount: 0,
  stats: { openTasks: 0, postsThisWeek: 0, helpers: 0 },
  rail: { yourTasks: [], yourPosts: [], savedCount: 0, helpers: [], trending: [], unanswered: [] },
};

/** Launch week (plan 10.16, 10.15): staff's welcome card, and a new member asked for their neighborhood. */
export const portalLaunchData: PortalPageData = {
  ...base,
  place: { kind: 'market' },
  yourArea: undefined,
  areas: areas.map((area) => ({ ...area, nearby: false, yours: false })),
  askArea: true,
  announcement: {
    id: 'can_welcome',
    title: 'Welcome to Neighbors in Austin',
    body: 'Ask who to hire, share what worked, and thank the helpers you booked. Exact addresses never go here: they go only to the helper you book.',
    endsAt: '2026-12-15T06:00:00.000Z',
  },
};

/** Asks nobody answered yet (plan 10.17): the Unanswered filter on. */
export const portalUnansweredData: PortalPageData = {
  ...base,
  query: query({ unanswered: true }),
  items: hotItems.filter((item) => item.type === 'post' && (item.post.kind === 'recommendation' || item.post.kind === 'question')).map((item) => (item.type === 'post' ? { ...item, post: { ...item.post, replyCount: 0, previewReplies: [] } } : item)).slice(0, 2),
  totalCount: 2,
};

/** Staff in production (plan 10, D1): the demo marketplace hidden from members, with their switch. */
export const portalStaffSamplesData: PortalPageData = { ...base, samples: { shown: false } };

/** Not phone-verified yet: reading works, posting waits. */
export const portalBlockedData: PortalPageData = { ...base, postBlocked: 'phone_required', composer: { ...composer, postBlocked: 'phone_required' } };

/** Staff see a hidden post in place, marked, with its reason. */
export const portalStaffData: PortalPageData = {
  ...base,
  items: [
    postItem(portalPost({
      ...tipBase,
      id: 'cpo_hidden_ad',
      title: 'Cheap movers this weekend, text me',
      body: 'Best prices in town, message me at [hidden] for a quote.',
      author: { displayName: 'Rex T.', initials: 'RT', role: 'neighbor', verified: false, isYou: false },
      categorySlug: 'moving-help',
      createdAt: '2026-11-17T12:30:00.000Z',
      lastActivityAt: '2026-11-17T12:30:00.000Z',
      reactions: { thanks: 0, helpful: 0, mine: [] },
      moderation: { status: 'hidden', reason: 'Advertising' },
    })),
    ...hotItems.slice(0, 4),
  ],
};

/** Priya's bookshelf task, on its own pages: the neighborhood post it came from. */
export const portalTaskDiscussion: CommunityTaskDiscussion = { postId: shelfAsk.id, title: shelfAsk.title, replyCount: shelfAsk.replyCount };

// ---- A long thread ---------------------------------------------------------------------------------------------

const voices: CommunityAuthor[] = [
  { displayName: 'Nate O.', initials: 'NO', role: 'neighbor', verified: false, isYou: false },
  { displayName: 'Ana P.', initials: 'AP', role: 'poster', verified: false, isYou: false },
  { displayName: 'Priya S.', initials: 'PS', role: 'poster', verified: true, isYou: false },
  { displayName: 'Lee M.', initials: 'LM', role: 'helper', verified: true, areaName: 'Windsor Park', helperHandle: 'lee-m', isYou: false },
];
const lines = [
  'We used Sam for a crib and a dresser. On time, brought his own drill.',
  'Ask whether they bring wall anchors; ours needed toggles for the drywall.',
  'Weekend mornings book up fast this month, so ask early in the week.',
  'Mueller apartments need a moving-in reservation for the elevator, even for a delivery.',
  'Two hours was plenty for a desk and a bookshelf in our place.',
  'Count the hardware bags first. Ours was missing a cam lock.',
];
const longReplies: CommunityReplyView[] = Array.from({ length: 30 }, (_, index) => ({
  id: `cre_long_${String(index + 1).padStart(2, '0')}`,
  author: cardFor(voices[index % voices.length]!),
  body: lines[index % lines.length]!,
  createdAt: new Date(Date.parse('2026-11-16T15:00:00.000Z') + index * 37 * 60_000).toISOString(),
  reactions: { thanks: index % 3, helpful: (index * 2) % 5, mine: [] },
  pinned: false,
}));

/** A busy thread: 30 replies (the page folds them after the first ten). */
export const portalLongThreadData: CommunityPostPageData = {
  ...communityPostPageData,
  post: { ...recommendation, replyCount: 30, previewReplies: [] },
  replies: longReplies,
};

/** Maya's request after she posted it as a task: the task's state instead of "Ask for help". */
export const portalPostWithTaskData: CommunityPostPageData = {
  ...communityPostPageData,
  post: {
    ...recommendation,
    askForHelpHref: undefined,
    saved: true,
    task: { id: 'tsk_desk', title: desk.title, href: routes.app.task('tsk_desk'), state: 'open', offerCount: 3 },
    previewReplies: [],
  },
  replies: communityPostPageData.replies.map(withCards),
};

// ---- Spanish ---------------------------------------------------------------------------------------------------

const spanishPost = (post: CommunityPostView, title: string, body: string): CommunityPostView => ({ ...post, title, body, previewReplies: [] });
const spanishTask = (view: PortalTaskView, title: string, excerpt: string): PortalTaskView => ({ ...view, task: { ...view.task, title, excerpt } });

/** The same place written by Spanish-speaking neighbors, for the Spanish pages. */
export const portalSpanishData: PortalPageData = {
  ...base,
  items: [
    postItem(spanishPost(recommendation, '¿A quién recomiendan para armar un escritorio y un librero?', 'Me acabo de mudar a Mueller y tengo un escritorio y un librero alto en cajas. Busco a alguien cuidadoso que pueda fijar el librero a la pared.')),
    postItem(spanishPost(question, '¿La ciudad todavía recoge hojas en bolsas en diciembre?', 'Nuestros dos robles están tirando todas las hojas a la vez. ¿La recolección sigue siendo semanal?')),
    postItem(spanishPost(tip, 'Renta la carretilla cuando reserves el camión', 'El lugar de renta cerca de la I-35 se queda sin carretillas el sábado por la mañana.')),
  ],
  totalCount: 3,
  openTasks: {
    items: [
      spanishTask(forMaya.bed, 'Armar una base de cama queen esta noche', 'Base de metal y madera con tablillas, todavía en la caja. Tengo todas las herramientas.'),
      spanishTask(forMaya.moving, 'Ayuda para cargar un camión de mudanza (2 recámaras)', 'Ya renté el camión y todo estará en cajas y etiquetado. Sofá, cama queen y cómoda.'),
    ],
    count: 7,
  },
};

/** "Welcome to Mueller" (2026-11-24): Maya just moved here; the best-rated helpers nearby and the most helpful tips. */
export const portalWelcome: NeighborsWelcomeView = {
  id: 'mkt_austin:2026-11-16T18:00:00.000Z',
  placeName: 'Mueller',
  helpers: [...helpers].sort((a, b) => (b.rating?.average ?? 0) - (a.rating?.average ?? 0) || b.completedCount - a.completedCount),
  tips: [
    { id: fenceTip.id, title: fenceTip.title, helpfulCount: 9, areaName: 'Windsor Park' },
    { id: tip.id, title: tip.title, helpfulCount: 5, areaName: 'Mueller' },
  ],
};
export const portalWelcomeData: PortalPageData = { ...base, welcome: portalWelcome };
/** A new account in a place with nothing yet: no helpers, no tips, the question to ask. */
export const portalWelcomeEmptyData: PortalPageData = { ...portalEmptyData, welcome: { id: 'mkt_austin:joined', placeName: 'Austin', helpers: [], tips: [] } };
