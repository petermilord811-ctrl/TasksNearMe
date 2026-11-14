import type { CommunityAuthor } from '@/contracts';

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

export const FEED_PAGE_SIZE = 20;
/** "Top" looks at the last 30 days. */
export const TOP_WINDOW_DAYS = 30;
