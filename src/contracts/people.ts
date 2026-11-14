import type { CategorySlug, Cents, ISODateTime, Photo } from './common';
import type { BadgeView } from './badges';

/**
 * Someone's activity as people they talk to see it (completion plan 7.1): `now` within 5 minutes, `today` within
 * 24 hours. Never exact times, never on public pages, and nothing for people who turned it off.
 */
export const PRESENCE_STATES = ['now', 'today'] as const;
export type PresenceState = (typeof PRESENCE_STATES)[number];

export interface PersonSummary {
  id: string;
  /** First name + last initial, e.g. "Maya R.". Never the full last name. */
  displayName: string;
  initials: string;
  /** Their profile photo, when they added one (helpers' show publicly; clients' only inside the app). */
  photo?: Photo;
  memberSince: ISODateTime;
  phoneVerified: boolean;
}

export interface VerificationBadges {
  idVerifiedAt?: ISODateTime;
  backgroundCheckedAt?: ISODateTime;
  /** "Address verified · Nov 2026": a proof of the home address was approved (never the address itself). */
  addressVerifiedAt?: ISODateTime;
  phoneVerified: boolean;
}

export interface ServiceSummary {
  categorySlug: CategorySlug;
  pricingType: 'fixed' | 'hourly';
  fromPriceCents?: Cents;
  hourlyRateCents?: Cents;
  minHours?: number;
}

export interface RatingSummary {
  /** 1.0–5.0, one decimal. */
  average: number;
  count: number;
}

export interface HelperSummary extends PersonSummary {
  /** Up to 3 achievement badges, most notable first (completion plan 6.4). */
  topBadges?: BadgeView[];
  handle: string;
  headline: string;
  areaName: string;
  badges: VerificationBadges;
  rating?: RatingSummary;
  completedCount: number;
  /** Neighbors who booked them and thanked or named them in the community (completion plan 7.8); absent at 0. */
  recommendedBy?: number;
  /** How fast they usually answer a new conversation, as a range (completion plan 7.12). */
  responseTime?: 'hour' | 'few_hours' | 'day';
  services: ServiceSummary[];
  /** Founding-cohort number when the helper is in it, e.g. 63 (of 100). */
  foundingHelperNumber?: number;
  /**
   * "Reliable" (blueprint 01 P2): over the last 12 months, at least 5 completed bookings, no no-show or strike, and
   * at most 1 in 10 canceled. Set where helpers are compared (browsing helpers, offers on a task).
   */
  reliable?: boolean;
}

export interface ClientSummary extends PersonSummary {
  ratingAsClient?: RatingSummary;
}
