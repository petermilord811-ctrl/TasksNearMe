/**
 * Shared primitives for the UI ↔ app contract.
 * Owned by Claude. Codex imports these (types and constants only) and never edits them.
 * Everything in src/contracts must stay isomorphic: no server-only code, no React components.
 */

/** Integer amount in US cents. Format with `formatMoney` from `@/shared/format`. */
export type Cents = number;

/** ISO-8601 timestamp in UTC, e.g. "2026-11-21T16:30:00.000Z". Display in America/Chicago. */
export type ISODateTime = string;

export const MARKET_TIME_ZONE = 'America/Chicago';

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
}
