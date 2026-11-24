import type { CommunityAuthor, CommunityHelperCard, CommunityNewPostPageData, CommunityPostPageData, CommunityPostView, CommunityReplyView, CommunityStarter, Photo } from '@/contracts';

/** The community (completion plan 7.7–7.8), as the community service returns it for Maya in Mueller. */

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

/** Photos on posts and replies (plan 10.1), from the placeholder images in public/samples. */
const photo = (id: string, file: string, alt: string, width = 800, height = 600): Photo => ({ id, src: `/samples/${file}`, alt, width, height });
export const communityPhotos = {
  boxes: photo('fil_community_boxes', 'work-desk.svg', 'A desk and a bookshelf still in their boxes'),
  shelf: photo('fil_community_shelf', 'work-bookshelf.svg', 'The bookshelf that needs anchoring'),
  leaves: photo('fil_community_leaves', 'work-yard.svg', 'Leaves covering the front yard'),
  wardrobe: photo('fil_community_wardrobe', 'photo-wide.svg', 'The finished wardrobe against the bedroom wall', 1200, 600),
  lake: photo('fil_community_lake', 'neighborhood-lake.svg', 'The Mueller lake at sunset'),
  herons: photo('fil_community_herons', 'neighborhood-herons.svg', 'Two herons on the little island'),
  path: photo('fil_community_path', 'neighborhood-path.svg', 'The lakeside path under the trees'),
};

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
  photo: communityPhotos.shelf,
  editedAt: '2026-11-17T14:52:00.000Z',
  helpfulNames: ['Priya S.', 'Ana P.'],
};
/** A reply to a reply (plan 10.10): "Replying to Lee M.". */
const replyToLee: CommunityReplyView = {
  id: 'cre_maya_to_lee',
  author: maya,
  body: 'Saturday morning works. Do you bring your own drill and wall anchors?',
  createdAt: '2026-11-17T15:10:00.000Z',
  reactions: none,
  pinned: false,
  canEdit: true,
  replyTo: { id: 'cre_lee_self', authorName: 'Lee M.' },
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
  photos: [communityPhotos.boxes, communityPhotos.shelf],
  canEdit: true,
  canReply: true,
  follow: 'following',
  // Plan 10.4: Sam named by three neighbors, Lee by himself.
  recommended: [{ helper: samCard, count: 3 }, { helper: { ...leeCard, selfTag: true }, count: 1 }],
  helpfulNames: ['Priya S.', 'Nate O.'],
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
  photos: [communityPhotos.leaves],
  editedAt: '2026-11-17T09:41:00.000Z',
  canReply: true,
  follow: 'none',
  helpfulNames: ['Nate O.'],
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
  photos: [communityPhotos.wardrobe],
  canReply: true,
  follow: 'none',
  helpfulNames: ['Ana P.', 'Lee M.'],
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
  canReply: true,
  follow: 'none',
  helpfulNames: ['Priya S.', 'Maya R.'],
};


/**
 * A general post (2026-11-22, any social post): words and photos, no title of its own. The title is its first line, as
 * the community service makes it (untitledPostTitle), and names the card for screen readers. Its three photos show as a
 * carousel (2026-11-23); the recommendation request's two do too.
 */
const general: CommunityPostView = {
  id: 'cpo_lake_sunset',
  kind: 'general',
  title: 'The sunset over the Mueller lake tonight was something.',
  body: 'The sunset over the Mueller lake tonight was something.\nThe herons are back on the little island, too. Worth a walk before dinner if you can.',
  areaName: 'Mueller',
  author: nate,
  createdAt: '2026-11-17T14:05:00.000Z',
  lastActivityAt: '2026-11-17T14:30:00.000Z',
  replyCount: 1,
  reactions: { thanks: 3, helpful: 8, mine: [] },
  photos: [communityPhotos.lake, communityPhotos.herons, communityPhotos.path],
  canReply: true,
  follow: 'none',
  helpfulNames: ['Priya S.', 'Ana P.'],
  previewReplies: [{ id: 'cre_lake_1', author: priya, body: 'We saw them this morning from the playground. Great shot!', createdAt: '2026-11-17T14:30:00.000Z', reactions: { thanks: 0, helpful: 2, mine: [] }, pinned: false }],
};

/** November's seasonal starters in Austin (plan 10.18), as the composer offers them. */
export const communityStarters: CommunityStarter[] = [
  { kind: 'recommendation', categorySlug: 'furniture-assembly', title: 'Who do you recommend for putting together a bed frame?' },
  { kind: 'recommendation', categorySlug: 'yard-cleanup', title: "Who's good at a fall leaf cleanup?" },
];

/** The community's posts near Maya, liveliest first (the portal's fixtures, src/fixtures/portal.ts, build on them); the general post last. */
export const communityFeedPosts: CommunityPostView[] = [recommendation, question, thanks, tip, general];

/** The general post's page (2026-11-22). */
export const communityGeneralPost = general;

export const communityPostPageData: CommunityPostPageData = {
  market,
  post: { ...recommendation, previewReplies: [] },
  replies: [pinnedAnswer, selfTag, tipReply, replyToLee],
  viewer: { canReply: true, canPin: true, isAuthor: true, isStaff: false },
  recommendOptions: [],
  alreadyRecommended: false,
  related: [
    { id: 'cpo_crib', title: 'Anyone used a helper for a crib and changing table?', kind: 'question', replyCount: 4, areaName: 'Mueller' },
    { id: 'cpo_thanks_sam', title: 'Thank you, Sam, for the wardrobe!', kind: 'thanks', replyCount: 1, areaName: 'Mueller' },
  ],
  canTranslate: true,
};

/** Maya reads Nate's general post (2026-11-22): no title of its own, its words first. */
export const communityGeneralPostPageData: CommunityPostPageData = {
  ...communityPostPageData,
  post: { ...general, previewReplies: [] },
  replies: general.previewReplies,
  viewer: { canReply: true, canPin: false, isAuthor: false, isStaff: false },
  related: [{ id: 'cpo_crib', title: 'Anyone used a helper for a crib and changing table?', kind: 'question', replyCount: 4, areaName: 'Mueller' }],
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

/** Lee reads Maya's request before verifying his phone (texts are on): he's told why he can't reply yet (sweep P3). */
export const communityPostReplyBlockedData: CommunityPostPageData = {
  ...communityPostHelperViewData,
  viewer: { canReply: false, replyBlocked: 'phone_required', canPin: false, isAuthor: false, isStaff: false },
  recommendOptions: [],
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
  kind: 'general',
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
  starters: communityStarters,
  draftKey: 'community-draft:austin:preview-maya',
};

export const communityNewThanksData: CommunityNewPostPageData = { ...communityNewPostPageData, kind: 'thanks' };

/** "Thank Sam on Neighbors" from the finished booking (plan 10.12): the thanks form with that booking chosen. */
export const communityNewThanksFromBookingData: CommunityNewPostPageData = { ...communityNewPostPageData, kind: 'thanks', bookingId: 'bkg_wardrobe' };

/** A question that picked a service ("Ask helpers who do this", 2026-11-24): the helpers who do it nearby hear about it. */
export const communityNewQuestionServiceData: CommunityNewPostPageData = { ...communityNewPostPageData, kind: 'question', categorySlug: 'moving-help' };
