import { DIRECT_CHATS_PER_DAY, PLAN_DIRECT_CHATS_PER_DAY, SPARK_LEVEL_THRESHOLDS, SPARK_LEVELS, SPARK_PACK_OFFERS, SPARK_PACKS, SPARK_RULES, SPARK_SOURCES, type FindPersonPageData, type NewDirectMessagePageData, type SparksPageData, type SparksSummary } from '@/contracts';
import { jordan, maya } from './people';

/** Sparks and direct conversations (2026-11-21): the canonical states for the previews and tests. */

const levels = SPARK_LEVELS.map((level) => ({ level, at: SPARK_LEVEL_THRESHOLDS[level], directChatsPerDay: DIRECT_CHATS_PER_DAY[level] }));
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
  nextLevel: { level: 'pillar', at: 1000 },
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
  directChatsPerDay: 60,
  purchases: [],
};

/** Buying isn't offered (no payment provider). */
export const sparksUnavailableData: SparksPageData = { ...sparksNewData, unavailable: true };

/** Maya writing to Jordan, a bookable helper, for the first time. */
export const newDirectMessageData: NewDirectMessagePageData = {
  recipient: { id: jordan.id, displayName: jordan.displayName, initials: jordan.initials, memberSince: jordan.memberSince, phoneVerified: true },
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

/** New message with no one named yet (2026-11-22): find someone by @username; a newcomer with 2 of 3 left today. */
export const findPersonData: FindPersonPageData = { allowance: { left: 2, perDay: 3 }, level: 'newcomer' };
/** A username nobody we can reach has. */
export const findPersonNotFoundData: FindPersonPageData = { ...findPersonData, query: 'jordan_tx', notFound: true };
/** The day's new conversations used up: when the next frees up. */
export const findPersonLimitData: FindPersonPageData = { allowance: { left: 0, perDay: 3, resetsAt: '2026-11-22T14:30:00.000Z' }, level: 'newcomer' };

/** With Pro, which sets the allowance (100 a day, more than any level's): no "Plus and Pro start more" line. */
export const findPersonProData: FindPersonPageData = { allowance: { left: 97, perDay: PLAN_DIRECT_CHATS_PER_DAY.pro }, level: 'neighbor', allowanceFrom: 'pro' };
