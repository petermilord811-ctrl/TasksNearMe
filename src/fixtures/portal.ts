import {
  routes,
  type CommunityAuthor,
  type CommunityTaskDiscussion,
  type CommunityPostPageData,
  type CommunityPostView,
  type CommunityReplyView,
  type PortalArea,
  type PortalFacets,
  type PortalHelper,
  type PortalItem,
  type PortalPageData,
  type PortalQueryState,
  type PortalRail,
  type PortalSection,
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

const [recommendationBase, questionBase, thanksBase, tipBase] = communityFeedPosts as [CommunityPostView, CommunityPostView, CommunityPostView, CommunityPostView];
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

/** Hot: the liveliest first, posts and tasks together. */
const hotItems: PortalItem[] = [
  postItem(recommendation),
  taskItem(forMaya.bed),
  postItem(question),
  postItem(fenceTip),
  taskItem(forMaya.moving),
  postItem(thanks),
  taskItem(forMaya.wardrobe),
  postItem(shelfAsk),
  taskItem(forMaya.bookshelf),
  // Maya's own desk task isn't here: her open tasks wait in Your stuff (audit M20).
  postItem(tip),
  taskItem(forMaya.dresser),
  taskItem(forMaya.yard),
  taskItem(forMaya.computer),
];
const byNewest = [...hotItems].sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));

// ---- The place, its counts and the rail -----------------------------------------------------------------------

const query = (change: Partial<PortalQueryState> = {}): PortalQueryState => ({ saved: false, sort: 'hot', view: 'feed', group: 'area', page: 1, ...change });

const areas: PortalArea[] = [
  { slug: 'allandale', name: 'Allandale', count: 1, nearby: false, yours: false },
  { slug: 'crestview', name: 'Crestview', count: 1, nearby: true, yours: false },
  { slug: 'downtown', name: 'Downtown', count: 0, nearby: false, yours: false },
  { slug: 'east-austin', name: 'East Austin', count: 1, nearby: true, yours: false },
  { slug: 'hyde-park', name: 'Hyde Park', count: 0, nearby: true, yours: false },
  { slug: 'mueller', name: 'Mueller', count: 7, nearby: true, yours: true },
  { slug: 'windsor-park', name: 'Windsor Park', count: 2, nearby: true, yours: false },
  { slug: 'zilker', name: 'Zilker', count: 1, nearby: false, yours: false },
];

/** Near Mueller: 13 items (7 tasks and 6 posts; Maya's own task waits in Your stuff), 15 across Austin. */
const facets: PortalFacets = {
  types: { all: 13, task: 7, recommendation: 1, question: 2, tip: 2, thanks: 1 },
  categories: { 'furniture-assembly': 7, 'moving-help': 2, 'yard-cleanup': 3, 'light-cleaning': 0, 'computer-help': 1, general: 0 },
  nearby: 13,
  all: 15,
  times: { '24h': 6, '7d': 13, '30d': 13 },
  saved: 2,
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
};

/** The Feed near Maya, Hot: posts and tasks together, with the rail. */
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
  section('mueller', 'Mueller', 7, [postItem(recommendation), taskItem(forMaya.bed), postItem(thanks), taskItem(forMaya.wardrobe), postItem(shelfAsk)]),
  section('windsor-park', 'Windsor Park', 2, [postItem(question), postItem(fenceTip)]),
  section('crestview', 'Crestview', 1, [taskItem(forMaya.yard)]),
  section('east-austin', 'East Austin', 1, [taskItem(forMaya.moving)]),
  section('market', undefined, 2, [postItem(tip), taskItem(forMaya.computer)]),
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

/** Jordan (a helper) reads the same place: tasks open his offer page, and he can save them. */
export const portalHelperData: PortalPageData = {
  ...base,
  me: { initials: 'JT' },
  helps: true,
  stats: { ...base.stats, helpers: 8 },
  items: hotItems.map((item): PortalItem => {
    if (item.type === 'task') return { ...item, task: { ...item.task, relation: 'helper', href: routes.app.findWorkTask(item.task.task.id), saved: item.id === 'tsk_board_wardrobe', ...jordanStanding(item.id) } };
    const post = { ...item.post, author: { ...item.post.author, isYou: false } };
    const { askForHelpHref: _askForHelp, ...rest } = post;
    return { ...item, post: rest };
  }),
  rail: { ...rail, yourTasks: [], yourPosts: [], savedCount: 1, helpers: helpers.filter((helper) => helper.handle !== 'jordan-t') },
};

/** Tasks only, in one neighborhood. */
export const portalTasksData: PortalPageData = {
  ...base,
  query: query({ type: 'task', area: 'mueller' }),
  place: { kind: 'area', slug: 'mueller', name: 'Mueller' },
  items: [taskItem(forMaya.bed), taskItem(forMaya.wardrobe), taskItem(forMaya.bookshelf), taskItem(forMaya.dresser)],
  totalCount: 4,
  facets: { ...facets, types: { all: 7, task: 4, recommendation: 1, question: 1, tip: 0, thanks: 1 } },
  live: { areaIds: ['are_mueller'], areaSlugs: ['mueller'], withRemote: false },
  boardHref: routes.taskBoard('austin', { areas: ['mueller'], view: 'cards' }),
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
  facets: { types: { all: 0, task: 0, recommendation: 0, question: 0, tip: 0, thanks: 0 }, categories: { 'furniture-assembly': 0, 'moving-help': 0, 'yard-cleanup': 0, 'light-cleaning': 0, 'computer-help': 0, general: 0 }, nearby: 0, all: 0, times: { '24h': 0, '7d': 0, '30d': 0 }, saved: 0 },
  items: [],
  totalCount: 0,
  stats: { openTasks: 0, postsThisWeek: 0, helpers: 0 },
  rail: { yourTasks: [], yourPosts: [], savedCount: 0, helpers: [], trending: [] },
};

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
    taskItem(spanishTask(forMaya.bed, 'Armar una base de cama queen esta noche', 'Base de metal y madera con tablillas, todavía en la caja. Tengo todas las herramientas.')),
    postItem(spanishPost(question, '¿La ciudad todavía recoge hojas en bolsas en diciembre?', 'Nuestros dos robles están tirando todas las hojas a la vez. ¿La recolección sigue siendo semanal?')),
    taskItem(spanishTask(forMaya.moving, 'Ayuda para cargar un camión de mudanza (2 recámaras)', 'Ya renté el camión y todo estará en cajas y etiquetado. Sofá, cama queen y cómoda.')),
    postItem(spanishPost(tip, 'Renta la carretilla cuando reserves el camión', 'El lugar de renta cerca de la I-35 se queda sin carretillas el sábado por la mañana.')),
  ],
  totalCount: 5,
};
