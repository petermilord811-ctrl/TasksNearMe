/**
 * Shared primitives for the UI ↔ app contract.
 * Owned by Claude. Codex imports these (types and constants only) and never edits them.
 * Everything in src/contracts must stay isomorphic: no server-only code, no React components.
 */

/** Integer amount in US cents. Format with `formatMoney` from `@/shared/format`. */
export type Cents = number;

/**
 * ISO-8601 timestamp in UTC, e.g. "2026-11-21T16:30:00.000Z". Displayed in the time zone of the market it belongs
 * to (completion plan 8.1): the contract carries that zone (`timeZone`) beside it.
 */
export type ISODateTime = string;

/** An IANA time zone, a market's own (`markets.time_zone`): "America/Chicago" (Austin), "America/New_York" (Gainesville). */
export type TimeZone = string;

/**
 * The fallback zone, the default market's, for a date that belongs to no market. Anything that belongs to a
 * market (a task, a booking, an availability slot, a person's home market) carries and uses that market's zone.
 */
export const MARKET_TIME_ZONE: TimeZone = 'America/New_York';

export const CATEGORY_SLUGS = [
  'furniture-assembly',
  'moving-help',
  'yard-cleanup',
  'light-cleaning',
  'computer-help',
] as const;
export type CategorySlug = (typeof CATEGORY_SLUGS)[number];

/** Which side of the marketplace the signed-in person is using right now. */
export type Mode = 'poster' | 'helper';

/** Who is looking at a booking-like object. */
export type ViewerRole = 'poster' | 'helper' | 'staff';

export const STAFF_ROLES = ['support_agent', 'support_lead', 'trust_safety', 'finance', 'admin'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** An image the UI can render. In the UI phase `src` points at /public assets. */
export interface Photo {
  id: string;
  src: string;
  alt: string;
  width: number;
  height: number;
  /** An animated GIF (2026-11-24, GIFs in chat): a conversation shows it as itself, not as a photo to open. */
  animated?: true;
}
