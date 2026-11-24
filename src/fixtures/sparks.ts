import { CONTACT_LEVELS, DIRECT_CHATS_PER_DAY, HELPER_CONTACT_EARNED_MIN, normalizeUsername, PLAN_DIRECT_CHATS_PER_DAY, routes, SPARK_LEVEL_THRESHOLDS, SPARK_LEVELS, SPARK_PACK_OFFERS, SPARK_PACKS, SPARK_RULES, SPARK_SOURCES, type NewChatHandlers, type NewDirectMessagePageData, type PeopleSearchData, type SparksPageData, type SparksSummary } from '@/contracts';
import { jordan, maya } from './people';

/** Sparks and direct conversations (2026-11-21): the canonical states for the previews and tests. */

const levels = SPARK_LEVELS.map((level) => ({ level, at: SPARK_LEVEL_THRESHOLDS[level], directChatsPerDay: DIRECT_CHATS_PER_DAY[level], ...((CONTACT_LEVELS as readonly string[]).includes(level) ? { helperContact: true as const } : {}) }));
const rules = SPARK_SOURCES.map((source) => ({ source, points: SPARK_RULES[source].points, ...(SPARK_RULES[source].dailyCap ? { dailyCap: SPARK_RULES[source].dailyCap } : {}) }));
const packs = SPARK_PACKS.map((pack) => ({ pack, ...SPARK_PACK_OFFERS[pack] }));

/** Jordan: 312 Sparks, 100 of them bought (Good neighbor). */
export const jordanSparks: SparksSummary = { total: 312, bought: 100, level: 'good_neighbor' };
/** Maya: 64 earned (Neighbor). */
export const mayaSparks: SparksSummary = { total: 64, bought: 0, level: 'neighbor' };

/** A new member with none yet. */
export const sparksNewData: SparksPageData = {
  summary: { total: 0, bought: 0, level: 'newcomer' },
  earned: 0,
  breakdown: SPARK_SOURCES.map((source) => ({ source, count: 0, points: 0 })),
  nextLevel: { level: 'neighbor', at: 50 },
  levels,
  helperContact: { at: HELPER_CONTACT_EARNED_MIN, unlocked: false },
  directChatsPerDay: 10,
  planDirectChatsPerDay: PLAN_DIRECT_CHATS_PER_DAY,
  hasPlan: false,
  rules,
  packs,
  purchases: [],
};

/** Jordan after buying a pack: 212 earned and 100 bought, back from checkout. */
export const sparksActiveData: SparksPageData = {
  ...sparksNewData,
  summary: jordanSparks,
  earned: 212,
  breakdown: [
    { source: 'posts', count: 6, points: 30 },
    { source: 'replies', count: 21, points: 42 },
    { source: 'helpful', count: 14, points: 42 },
    { source: 'thanks', count: 9, points: 18 },
    { source: 'bookings', count: 7, points: 70 },
    { source: 'reviews', count: 5, points: 10 },
  ],
  nextLevel: { level: 'friendly_face', at: 750 },
  directChatsPerDay: 25,
  purchases: [{ id: 'spk_jordan_1', pack: 'small', points: 100, priceCents: 99, status: 'paid', createdAt: '2026-11-21T15:00:00.000Z' }],
  notice: 'purchased',
};

/** With Pro (at least 100 a day; Plus gives 25) and a checkout still confirming. */
export const sparksPlanPendingData: SparksPageData = {
  ...sparksActiveData,
  directChatsPerDay: PLAN_DIRECT_CHATS_PER_DAY.pro,
  hasPlan: true,
  yourPlanDirectChatsPerDay: PLAN_DIRECT_CHATS_PER_DAY.pro,
  purchases: [{ id: 'spk_jordan_2', pack: 'medium', points: 550, priceCents: 499, status: 'pending', createdAt: '2026-11-21T16:00:00.000Z' }, ...sparksActiveData.purchases],
  notice: 'purchase_pending',
};

/** At the top level. */
const { nextLevel: _next, notice: _notice, ...active } = sparksActiveData;
export const sparksTopData: SparksPageData = {
  ...active,
  summary: { total: 5_240, bought: 1_200, level: 'local_legend' },
  earned: 4_040,
  helperContact: { at: HELPER_CONTACT_EARNED_MIN, unlocked: true },
  directChatsPerDay: 60,
  purchases: [],
};

/**
 * A Pillar by total whose earned part is short of 2,000 (2026-11-24): the level and its chats a day, but not the contact
 * details helpers share, since bought Sparks don't count toward them.
 */
export const sparksPillarBoughtData: SparksPageData = {
  ...active,
  summary: { total: 2_300, bought: 1_200, level: 'pillar' },
  earned: 1_100,
  breakdown: [
    { source: 'posts', count: 60, points: 300 },
    { source: 'replies', count: 150, points: 300 },
    { source: 'helpful', count: 80, points: 240 },
    { source: 'thanks', count: 50, points: 100 },
    { source: 'bookings', count: 14, points: 140 },
    { source: 'reviews', count: 10, points: 20 },
  ],
  nextLevel: { level: 'local_legend', at: 5_000 },
  directChatsPerDay: 40,
  purchases: [{ id: 'spk_jordan_3', pack: 'large', points: 1_200, priceCents: 999, status: 'paid', createdAt: '2026-11-23T15:00:00.000Z' }],
};

/** Buying isn't offered (no payment provider). */
export const sparksUnavailableData: SparksPageData = { ...sparksNewData, unavailable: true };

/** Maya writing to Jordan, a bookable helper, for the first time. */
export const newDirectMessageData: NewDirectMessagePageData = {
  recipient: { id: jordan.id, displayName: jordan.displayName, initials: jordan.initials, memberSince: jordan.memberSince, phoneVerified: true },
  username: 'jordan',
  helperHandle: jordan.handle,
  canRequest: true,
  allowance: { left: 2, perDay: 3 },
  firstMessagesMax: 3,
  contactMasking: true,
  maxLength: 2000,
};

/** Jordan writing to Maya, a client (no profile, no task request). */
export const newDirectMessageClientData: NewDirectMessagePageData = {
  recipient: { id: maya.id, displayName: maya.displayName, initials: maya.initials, memberSince: maya.memberSince, phoneVerified: true },
  username: 'maya',
  canRequest: false,
  allowance: { left: 24, perDay: 25 },
  firstMessagesMax: 3,
  contactMasking: true,
  maxLength: 2000,
};

/** The day's new conversations used up. */
export const newDirectMessageLimitData: NewDirectMessagePageData = { ...newDirectMessageData, refusal: 'limit_reached', allowance: { left: 0, perDay: 3, resetsAt: '2026-11-22T14:30:00.000Z' } };

/** Jordan takes direct messages only from people they've talked to about a task. */
export const newDirectMessageContactsOnlyData: NewDirectMessagePageData = { ...newDirectMessageData, refusal: 'task_contacts_only' };


// ---- New message in place (2026-11-23): suggestions as the @username is typed, and a sample profile -------------------

/** Nothing typed yet: the allowance only (a newcomer with 2 of 3 left today). */
export const peopleSearchEmptyData: PeopleSearchData = { query: '', people: [], allowance: { left: 2, perDay: 3 }, level: 'newcomer' };
/** Maya has typed "jo": Jordan (a helper she already talks to), a neighbor, and a sample profile. */
export const peopleSearchData: PeopleSearchData = {
  query: 'jo',
  people: [
    { id: jordan.id, username: 'jordan', displayName: jordan.displayName, initials: jordan.initials, helper: true, threadId: 'thr_maya_jordan_direct' },
    { id: 'usr_josie_park', username: 'josie_p', displayName: 'Josie P.', initials: 'JP', helper: false },
    { id: 'usr_demo_jonah', username: 'jonah', displayName: 'Jonah L.', initials: 'JL', helper: true, sample: true },
  ],
  allowance: { left: 2, perDay: 3 },
  level: 'newcomer',
};
/** "jox": nobody's username starts with it. */
export const peopleSearchNoMatchData: PeopleSearchData = { ...peopleSearchEmptyData, query: 'jox' };
/** The day's new conversations used up. */
export const peopleSearchLimitData: PeopleSearchData = { ...peopleSearchEmptyData, allowance: { left: 0, perDay: 3, resetsAt: '2026-11-22T14:30:00.000Z' } };
/** Writing to a sample profile on the live site: Jonah, a demo helper who never answers. */
export const newDirectMessageSampleData: NewDirectMessagePageData = {
  ...newDirectMessageData,
  recipient: { id: 'usr_demo_jonah', displayName: 'Jonah L.', initials: 'JL', memberSince: '2026-09-30T15:00:00.000Z', phoneVerified: true },
  username: 'jonah',
  sample: true,
  // A seed helper's handle: the previews' links (View profile, Send a task request) must reach a real page.
  helperHandle: jordan.handle,
};

/**
 * New message's handlers for previews and tests: "jo…" suggests the three above, "jox" nobody, an empty box the
 * allowance only; the first message opens a new conversation.
 */
export const fakeNewChatHandlers: Pick<NewChatHandlers, 'onSearch' | 'onStart'> = {
  onSearch: async (text) => {
    const query = normalizeUsername(text);
    if (!query) return peopleSearchEmptyData;
    if (!query.startsWith('jo') || query.startsWith('jox')) return { ...peopleSearchNoMatchData, query };
    return { ...peopleSearchData, query, people: peopleSearchData.people.filter((person) => person.username.startsWith(query)) };
  },
  onStart: async () => ({ ok: true, code: 'sent', redirectTo: routes.app.thread('thr_new_direct') }),
};
/** With Pro, which sets the allowance (100 a day, more than any level's): no "Plus and Pro start more" line. */
export const peopleSearchProData: PeopleSearchData = { ...peopleSearchEmptyData, allowance: { left: 97, perDay: PLAN_DIRECT_CHATS_PER_DAY.pro }, level: 'neighbor', allowanceFrom: 'pro' };
