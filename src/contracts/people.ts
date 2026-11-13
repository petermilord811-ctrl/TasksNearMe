import type { CategorySlug, Cents, ISODateTime, Photo } from './common';

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
  handle: string;
  headline: string;
  areaName: string;
  badges: VerificationBadges;
  rating?: RatingSummary;
  completedCount: number;
  responseTimeMinutes?: number;
  services: ServiceSummary[];
  /** Founding-cohort number when the helper is in it, e.g. 63 (of 100). */
  foundingHelperNumber?: number;
}

export interface ClientSummary extends PersonSummary {
  ratingAsClient?: RatingSummary;
}
