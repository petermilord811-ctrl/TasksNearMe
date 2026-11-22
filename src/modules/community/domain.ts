import {
  CATEGORY_SLUGS,
  COMMUNITY_BODY_MIN,
  COMMUNITY_BODY_OPTIONAL_KINDS,
  COMMUNITY_POST_KINDS,
  PORTAL_ALL_AREAS,
  PORTAL_FEED_PAGE_SIZE,
  PORTAL_GENERAL,
  PORTAL_GROUPS,
  PORTAL_Q_MAX,
  PORTAL_SORTS,
  PORTAL_TIMES,
  PORTAL_TYPES,
  PORTAL_VIEWS,
  type CategorySlug,
  type CommunityAuthor,
  type CommunityPostKind,
  type CommunityStarter,
  type CommunityPostTask,
  type PortalCategory,
  type PortalQueryState,
  type PortalTime,
} from '@/contracts';

/**
 * The community's rules as plain functions (completion plan 7.7): limits by account age, who counts as a helper
 * or a poster, the posts that belong with the police rather than here, and when Helpful says something.
 */

const DAY_SECONDS = 24 * 60 * 60;

/** New accounts (their first week) post and reply less, which keeps one-off spam small. */
export function communityLimits(accountCreatedAt: Date, now: Date): { posts: { limit: number; windowSeconds: number }; replies: { limit: number; windowSeconds: number } } {
  const newAccount = now.getTime() - accountCreatedAt.getTime() < 7 * DAY_SECONDS * 1000;
  return newAccount
    ? { posts: { limit: 2, windowSeconds: DAY_SECONDS }, replies: { limit: 15, windowSeconds: DAY_SECONDS } }
    : { posts: { limit: 8, windowSeconds: DAY_SECONDS }, replies: { limit: 60, windowSeconds: DAY_SECONDS } };
}

export const REACTION_RULE = { limit: 300, windowSeconds: DAY_SECONDS };

/** Helpful counts that tell the author (once each): the first, then 5 and 25. */
export const HELPFUL_MILESTONES = [1, 5, 25] as const;

export function helpfulMilestone(before: number, after: number): number | null {
  return HELPFUL_MILESTONES.find((mark) => before < mark && after >= mark) ?? null;
}

/** Helper when they offer help here; poster when they've posted a task; otherwise a neighbor. */
export function authorRole(facts: { activeHelper: boolean; hasPostedTask: boolean }): CommunityAuthor['role'] {
  if (facts.activeHelper) return 'helper';
  if (facts.hasPostedTask) return 'poster';
  return 'neighbor';
}

/**
 * Reports of crime or suspicious people belong with the police (911 in an emergency), not in a feed about local
 * help: they invite profiling and rumors (the research report's Nextdoor lessons). Matched on whole words.
 */
const SAFETY_PATTERNS = [
  /\bsuspicious (?:person|people|man|men|woman|guy|guys|kid|kids|car|vehicle|truck|van|activity)\b/i,
  /\bbreak-?ins?\b/i,
  /\bbroke into\b/i,
  /\bburglar(?:y|ies|s)?\b/i,
  /\brobber(?:y|ies)\b/i,
  /\brobbed\b/i,
  /\bshootings?\b/i,
  /\bgunshots?\b/i,
  /\bporch pirates?\b/i,
  /\bcrime alert\b/i,
  /\b(?:persona|personas|actividad|carro|auto|vehículo|vehiculo) sospechos[oa]s?\b/i,
  /\brobos?\b/i,
  /\bbalacera\b/i,
];

export function isSafetyOrCrimePost(text: string): boolean {
  return SAFETY_PATTERNS.some((pattern) => pattern.test(text));
}

/** Initials for an avatar from a display name ("Maya R." → "MR"). */
export function initialsOf(name: string): string {
  const parts = name.replace(/\./g, '').split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')).toUpperCase() || '?';
}

/** Miles between two points (the "near you" radius is measured between neighborhood centers). */
export function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

/** Neighborhoods within this many miles of yours are "near you". */
export const NEARBY_MILES = 3;

/** Posts per page of the feed (the portal's Feed pages the same way, `PORTAL_FEED_PAGE_SIZE`). */
export const FEED_PAGE_SIZE = PORTAL_FEED_PAGE_SIZE;

// ---- The neighborhood portal (plan 9.10) ----------------------------------------------------------------------

/** Saves per person per day (a backstop; saving is free and private). */
export const SAVE_RULE = { limit: 300, windowSeconds: DAY_SECONDS };

/** The posts "Ask for help" turns into a task: asking for a recommendation, or asking a question. */
export const ASK_FOR_HELP_KINDS = ['recommendation', 'question'] as const satisfies readonly CommunityPostKind[];

/** A post's task as the post shows it: still taking offers, booked, done, or closed (canceled, expired, past, hidden). */
export function postTaskState(task: { status: string; windowEnd: Date; hiddenAt: Date | null }, now: Date): CommunityPostTask['state'] {
  if (task.status === 'assigned') return 'booked';
  if (task.status === 'completed') return 'done';
  if (task.status === 'open' && !task.hiddenAt && task.windowEnd.getTime() > now.getTime()) return 'open';
  return 'closed';
}

/** Hot (Reddit's, positives only): each `HOT_SECONDS` of age costs a tenfold difference in engagement. */
export const HOT_SECONDS = 45_000;

/** Engagement, as the sorts count it: a post's Helpful twice, Thanks and replies; a task's offers and questions. */
export const ENGAGEMENT = { helpful: 2, thanks: 1, reply: 1, offer: 1, question: 1 } as const;

/** The hot score, as the database computes it (for tests and for reasoning about the order). */
export function hotScore(engagement: number, postedAt: Date): number {
  return Math.log10(1 + Math.max(0, engagement)) + postedAt.getTime() / 1000 / HOT_SECONDS;
}

const TIME_MS: Record<PortalTime, number> = { '24h': DAY_SECONDS * 1000, '7d': 7 * DAY_SECONDS * 1000, '30d': 30 * DAY_SECONDS * 1000 };

/** The start of the time filter's window (absent: any time). */
export function portalSince(time: PortalTime | undefined, now: Date): Date | undefined {
  return time ? new Date(now.getTime() - TIME_MS[time]) : undefined;
}

type Params = Record<string, string | string[] | undefined>;
const firstOf = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
const pick = <T extends string>(value: string | undefined, options: readonly T[]): T | undefined => ((options as readonly string[]).includes(value ?? '') ? (value as T) : undefined);
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The portal's filters from its address (docs/ui/portal-9.10.md §4), with defaults filled in. Unknown values are
 * dropped (a neighborhood's slug is checked against the market by the service). The feed's older addresses still
 * work: `scope=market` is the whole market, `sort=active` is hot, `kind=` is the type.
 */
export function parsePortalQuery(params: Params): PortalQueryState {
  const areaParam = firstOf(params.area) ?? (firstOf(params.scope) === 'market' ? PORTAL_ALL_AREAS : undefined);
  const area = areaParam === PORTAL_ALL_AREAS || (areaParam && areaParam.length <= 60 && SLUG.test(areaParam)) ? areaParam : undefined;
  const categoryParam = firstOf(params.category);
  const category = categoryParam === PORTAL_GENERAL ? PORTAL_GENERAL : pick(categoryParam, CATEGORY_SLUGS);
  const type = pick(firstOf(params.type), PORTAL_TYPES) ?? pick(firstOf(params.kind), COMMUNITY_POST_KINDS);
  const time = pick(firstOf(params.time), PORTAL_TIMES);
  const q = firstOf(params.q)?.replace(/\s+/g, ' ').slice(0, PORTAL_Q_MAX).trim();
  const sortParam = firstOf(params.sort);
  const page = Number.parseInt(firstOf(params.page) ?? '', 10);
  return {
    ...(area ? { area } : {}),
    ...(category ? { category: category as PortalCategory } : {}),
    ...(type ? { type } : {}),
    ...(time ? { time } : {}),
    ...(q ? { q } : {}),
    saved: firstOf(params.saved) === '1',
    unanswered: firstOf(params.unanswered) === '1',
    sort: sortParam === 'active' ? 'hot' : pick(sortParam, PORTAL_SORTS) ?? 'hot',
    view: pick(firstOf(params.view), PORTAL_VIEWS) ?? 'feed',
    group: pick(firstOf(params.group), PORTAL_GROUPS) ?? 'area',
    page: Number.isFinite(page) && page > 1 ? Math.min(page, 500) : 1,
  };
}

/** Each word of a search (at most 6, each at least 2 characters), for "every word, somewhere in the text". */
export function searchWords(q: string | undefined): string[] {
  if (!q) return [];
  return [...new Set(q.toLowerCase().split(/[^\p{L}\p{N}']+/u).filter((word) => word.length >= 2))].slice(0, 6);
}

// ---- Neighbors, plan 10 (docs/ui/neighbors-10.md) ----------------------------------------------------------------

/** Details a post needs (plan 10.6): optional for an ask, `COMMUNITY_BODY_MIN` characters for a tip or a thanks. */
export function bodyRequired(kind: CommunityPostKind): boolean {
  return !(COMMUNITY_BODY_OPTIONAL_KINDS as readonly string[]).includes(kind);
}

/** Whether these details are enough for the kind of post. */
export function bodyFits(kind: CommunityPostKind, body: string): boolean {
  return !bodyRequired(kind) || body.trim().length >= COMMUNITY_BODY_MIN;
}

/**
 * Words that tend to start fights (plan 10.20, Nextdoor's "kindness reminder"): insults and name-calling, in English
 * and Spanish, matched on whole words. Not a filter: the author sees a reminder and can post anyway. Kept local (no
 * model), so nobody's words leave the server for a tone check.
 */
const UNKIND_PATTERNS = [
  // Name-calling (not words a job can need: "trash" and "disgusting" describe yards and kitchens, so they're left out).
  /\b(?:idiots?|idiotic|stupid|morons?|dumbass|losers?|pathetic|scum|jerks?|shut up|get a life|nobody asked|you people)\b/i,
  /\b(?:f+u+c+k+(?:ing|er|ers|ed)?|sh[i1]t(?:ty)?|bullshit|bitch(?:es|y)?|bastards?|assholes?)\b/i,
  /(?:^|[^\p{L}])(?:idiotas?|estúpid[oa]s?|estupid[oa]s?|imbécil(?:es)?|imbecil(?:es)?|pendej[oa]s?|cállate|callate|mierda|cabr[oó]n(?:es)?|put[oa]s?)(?![\p{L}])/iu,
];

/** The kindness reminder's check (plan 10.20). */
export function soundsUnkind(text: string): boolean {
  return UNKIND_PATTERNS.some((pattern) => pattern.test(text));
}

/** Followers hear about new replies at most once per post per hour (plan 10.9): the notice's key for that hour. */
export function followNoticeKey(postId: string, at: Date): string {
  return `cfollow:${postId}:${Math.floor(at.getTime() / 3_600_000)}`;
}

/** Edits per person per day (plan 10.5): a backstop against rewriting a thread after the fact. */
export const EDIT_RULE = { limit: 30, windowSeconds: DAY_SECONDS };

/** Recommendation-request alerts per helper per day, and helpers told about one request (plan 10.11). */
export const ASK_MATCH_LIMITS = { perDay: 3, perPost: 15 } as const;

/** Reports from different established accounts that hide a post or reply until staff look (plan 10.21). */
export const AUTO_HIDE_REPORTS = 3;
/** An account this old counts toward hiding something (a new one alone can't hide a neighbor's post). */
export const ESTABLISHED_ACCOUNT_DAYS = 7;

/** Whether reports from these reporters hide the item: enough different accounts old enough to count. */
export function reportsHide(reporters: { userId: string; createdAt: Date }[], now: Date): boolean {
  const established = new Set(reporters.filter((reporter) => now.getTime() - reporter.createdAt.getTime() >= ESTABLISHED_ACCOUNT_DAYS * DAY_SECONDS * 1000).map((reporter) => reporter.userId));
  return established.size >= AUTO_HIDE_REPORTS;
}

/** The weekly digest (plan 10.14): Sunday from 9 am on the market's clock, sent within the next 36 hours, or skipped. */
export const DIGEST_DAY_TIME = '09:00';
export const DIGEST_SEND_WINDOW_MS = 36 * 3_600_000;
/** Posts the person's place needs that week for a digest worth sending. */
export const DIGEST_MIN_POSTS = 3;

/** This week's digest moment for a market (the latest Sunday 9 am at or before `now`, in its zone). */
export function digestSendFrom(now: Date, timeZone: string, toUtc: (date: string, time: string, zone: string) => string, dayKeyOf: (at: Date, zone: string) => string): Date {
  const today = dayKeyOf(now, timeZone);
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 is Sunday
  const sunday = new Date(Date.parse(`${today}T12:00:00Z`) - weekday * DAY_SECONDS * 1000).toISOString().slice(0, 10);
  const thisWeek = new Date(toUtc(sunday, DIGEST_DAY_TIME, timeZone));
  if (thisWeek.getTime() <= now.getTime()) return thisWeek;
  const lastSunday = new Date(Date.parse(`${sunday}T12:00:00Z`) - 7 * DAY_SECONDS * 1000).toISOString().slice(0, 10);
  return new Date(toUtc(lastSunday, DIGEST_DAY_TIME, timeZone));
}

/** Whether a digest is due now for someone whose last went out at `lastAt`. */
export function digestDue(lastAt: Date | null, sendFrom: Date, now: Date): boolean {
  if (now.getTime() - sendFrom.getTime() > DIGEST_SEND_WINDOW_MS) return false;
  return lastAt === null || lastAt.getTime() < sendFrom.getTime();
}

/** One configured starter (markets.community_prompts), as stored. */
export interface PromptConfig {
  months: number[];
  kind: 'recommendation' | 'question' | 'tip';
  category?: string;
  en: string;
  es: string;
}

/** The starters for a month (1–12) in a language (plan 10.18): at most three, in the market's order. */
export function startersFor(prompts: readonly PromptConfig[] | null | undefined, month: number, locale: 'en' | 'es'): CommunityStarter[] {
  return (prompts ?? [])
    .filter((prompt) => prompt.months.includes(month) && (COMMUNITY_POST_KINDS as readonly string[]).includes(prompt.kind))
    .slice(0, 3)
    .map((prompt) => ({
      kind: prompt.kind,
      ...(prompt.category && (CATEGORY_SLUGS as readonly string[]).includes(prompt.category) ? { categorySlug: prompt.category as CategorySlug } : {}),
      title: (locale === 'es' ? prompt.es : prompt.en).trim(),
    }))
    .filter((starter) => starter.title.length >= 5);
}

/** Asks "Unanswered" collects (plan 10.17): the kinds that want an answer. */
export const UNANSWERED_KINDS = ASK_FOR_HELP_KINDS;
/** "Waiting for an answer" looks this far back. */
export const UNANSWERED_DAYS = 7;
