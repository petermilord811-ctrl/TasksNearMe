import type { CommunityAuthor, CommunityFeedPageData, CommunityHelperCard, CommunityNewPostPageData, CommunityPostPageData, CommunityPostView, CommunityReplyView } from '@/contracts';

/** The community feed (completion plan 7.7–7.8), as the community service returns it for Maya in Mueller. */

const market = { slug: 'austin', name: 'Austin' };
const author = (displayName: string, initials: string, role: CommunityAuthor['role'], extra: Partial<CommunityAuthor> = {}): CommunityAuthor => ({ displayName, initials, role, verified: false, isYou: false, ...extra });

const maya = author('Maya R.', 'MR', 'poster', { verified: true, isYou: true });
const lee = author('Lee M.', 'LM', 'helper', { verified: true, areaName: 'Windsor Park', helperHandle: 'lee-m' });
const sam = author('Sam K.', 'SK', 'helper', { verified: true, areaName: 'Mueller', helperHandle: 'sam-k' });
const priya = author('Priya S.', 'PS', 'poster', { verified: true });
const nate = author('Nate O.', 'NO', 'neighbor');
const ana = author('Ana P.', 'AP', 'poster');

const samCard: CommunityHelperCard = { handle: 'sam-k', displayName: 'Sam K.', initials: 'SK', headline: 'Furniture assembly, done carefully and level', rating: { average: 4.9, count: 23 }, recommendedBy: 6, selfTag: false };
const leeCard: CommunityHelperCard = { handle: 'lee-m', displayName: 'Lee M.', initials: 'LM', headline: 'Patient computer help and quick assembly', rating: { average: 5, count: 11 }, recommendedBy: 2, selfTag: true };

const none = { thanks: 0, helpful: 0, mine: [] };

const pinnedAnswer: CommunityReplyView = {
  id: 'cre_sam_rec',
  author: priya,
  body: 'Sam put together our crib and a dresser in under two hours, and he brought his own drill. He even leveled the dresser on our old floors.',
  createdAt: '2026-11-17T13:20:00.000Z',
  reactions: { thanks: 2, helpful: 5, mine: ['helpful'] },
  pinned: true,
  recommendedHelper: samCard,
};
const selfTag: CommunityReplyView = {
  id: 'cre_lee_self',
  author: lee,
  body: 'I do flat-pack furniture most weekends. Happy to take a look on Saturday morning.',
  createdAt: '2026-11-17T14:05:00.000Z',
  reactions: none,
  pinned: false,
  recommendedHelper: leeCard,
};
const tipReply: CommunityReplyView = {
  id: 'cre_nate_tip',
  author: nate,
  body: 'Count the hardware bags before anyone starts. Ours was missing a cam lock and the store mailed one free.',
  createdAt: '2026-11-17T14:40:00.000Z',
  reactions: { thanks: 1, helpful: 2, mine: [] },
  pinned: false,
};

const recommendation: CommunityPostView = {
  id: 'cpo_desk',
  kind: 'recommendation',
  title: 'Who do you recommend for a flat-pack desk and bookshelf?',
  body: 'Just moved into Mueller and have a desk and a tall bookshelf still in boxes. Looking for someone careful who can anchor the shelf to the wall. Weekend mornings work best.',
  categorySlug: 'furniture-assembly',
  areaName: 'Mueller',
  author: maya,
  createdAt: '2026-11-17T12:10:00.000Z',
  lastActivityAt: '2026-11-17T14:40:00.000Z',
  replyCount: 3,
  reactions: { thanks: 0, helpful: 4, mine: [] },
  previewReplies: [pinnedAnswer],
};

const question: CommunityPostView = {
  id: 'cpo_leaves',
  kind: 'question',
  title: 'Does the city still pick up bagged leaves in December?',
  body: 'Our two live oaks are dropping everything at once. Is curbside yard trimmings pickup still weekly this time of year, or should I book someone to haul it?',
  categorySlug: 'yard-cleanup',
  areaName: 'Windsor Park',
  author: ana,
  createdAt: '2026-11-17T09:30:00.000Z',
  lastActivityAt: '2026-11-17T11:02:00.000Z',
  replyCount: 2,
  reactions: { thanks: 1, helpful: 3, mine: ['thanks'] },
  previewReplies: [
    { id: 'cre_leaves_1', author: nate, body: 'Still weekly on your trash day. Paper lawn bags only, and keep them under 40 pounds.', createdAt: '2026-11-17T10:15:00.000Z', reactions: { thanks: 2, helpful: 4, mine: [] }, pinned: false },
    { id: 'cre_leaves_2', author: lee, body: 'If you have more than 10 bags, a haul-away is usually faster than waiting two weeks.', createdAt: '2026-11-17T11:02:00.000Z', reactions: none, pinned: false },
  ],
};

const thanks: CommunityPostView = {
  id: 'cpo_thanks_sam',
  kind: 'thanks',
  title: 'Thank you, Sam, for the wardrobe!',
  body: 'Two-door wardrobe, about 100 parts, done in three hours and anchored to the wall. The doors line up perfectly. Booking him again for the dresser.',
  categorySlug: 'furniture-assembly',
  areaName: 'Mueller',
  author: priya,
  createdAt: '2026-11-16T22:00:00.000Z',
  lastActivityAt: '2026-11-17T08:00:00.000Z',
  replyCount: 1,
  reactions: { thanks: 7, helpful: 2, mine: [] },
  thankedHelper: { ...samCard, selfTag: false },
  previewReplies: [{ id: 'cre_thanks_1', author: sam, body: 'Thanks, Priya! The dresser is on my list for Saturday.', createdAt: '2026-11-17T08:00:00.000Z', reactions: { thanks: 3, helpful: 0, mine: [] }, pinned: false }],
};

const tip: CommunityPostView = {
  id: 'cpo_truck_tip',
  kind: 'tip',
  title: 'Rent the dolly when you book the truck',
  body: 'The rental place near I-35 runs out of furniture dollies by Saturday morning. Add one when you reserve the truck online and your movers will thank you.',
  categorySlug: 'moving-help',
  author: nate,
  createdAt: '2026-11-16T18:45:00.000Z',
  lastActivityAt: '2026-11-16T18:45:00.000Z',
  replyCount: 0,
  reactions: { thanks: 4, helpful: 9, mine: [] },
  previewReplies: [],
};

export const communityFeedPageData: CommunityFeedPageData = {
  market,
  query: { scope: 'nearby', sort: 'active', page: 1 },
  yourArea: { slug: 'mueller', name: 'Mueller' },
  posts: [recommendation, question, thanks, tip],
  totalCount: 4,
  pageCount: 1,
  stats: { postsThisWeek: 18, repliesToday: 7 },
};

export const communityFeedEmptyData: CommunityFeedPageData = {
  ...communityFeedPageData,
  query: { scope: 'nearby', sort: 'active', kind: 'tip', page: 1 },
  posts: [],
  totalCount: 0,
  stats: { postsThisWeek: 0, repliesToday: 0 },
};

/** Not phone-verified yet: reading works, posting waits. */
export const communityFeedBlockedData: CommunityFeedPageData = { ...communityFeedPageData, postBlocked: 'phone_required' };

export const communityPostPageData: CommunityPostPageData = {
  market,
  post: { ...recommendation, previewReplies: [] },
  replies: [pinnedAnswer, selfTag, tipReply],
  viewer: { canReply: true, canPin: true, isAuthor: true, isStaff: false },
  recommendOptions: [],
  alreadyRecommended: false,
};

/** Lee reads Maya's request: he can name a helper he booked, or himself. */
export const communityPostHelperViewData: CommunityPostPageData = {
  ...communityPostPageData,
  post: { ...recommendation, author: { ...maya, isYou: false } },
  replies: [pinnedAnswer, tipReply],
  viewer: { canReply: true, canPin: false, isAuthor: false, isStaff: false },
  recommendOptions: [
    { handle: 'sam-k', displayName: 'Sam K.', self: false },
    { handle: 'lee-m', displayName: 'Lee M.', self: true },
  ],
};

/** Staff see a hidden reply, marked, with the moderation controls. */
export const communityPostStaffData: CommunityPostPageData = {
  ...communityPostPageData,
  post: { ...recommendation, author: { ...maya, isYou: false } },
  replies: [pinnedAnswer, { ...tipReply, id: 'cre_spam', body: 'Cheap movers, text me for a deal [hidden]', author: author('Rex T.', 'RT', 'neighbor'), moderation: { status: 'hidden', reason: 'Advertising' } }],
  viewer: { canReply: true, canPin: false, isAuthor: false, isStaff: true },
};

export const communityNewPostPageData: CommunityNewPostPageData = {
  market,
  kind: 'recommendation',
  categories: [{ slug: 'furniture-assembly' }, { slug: 'moving-help' }, { slug: 'yard-cleanup' }, { slug: 'light-cleaning' }, { slug: 'computer-help' }],
  areas: [
    { slug: 'allandale', name: 'Allandale' },
    { slug: 'crestview', name: 'Crestview' },
    { slug: 'east-austin', name: 'East Austin' },
    { slug: 'hyde-park', name: 'Hyde Park' },
    { slug: 'mueller', name: 'Mueller' },
    { slug: 'windsor-park', name: 'Windsor Park' },
  ],
  yourArea: { slug: 'mueller', name: 'Mueller' },
  thankOptions: [{ bookingId: 'bkg_wardrobe', helperName: 'Sam K.', taskTitle: 'Assemble a wardrobe', completedAt: '2026-10-27T20:00:00.000Z' }],
};

export const communityNewThanksData: CommunityNewPostPageData = { ...communityNewPostPageData, kind: 'thanks' };
