import type { CategorySlug, ISODateTime, Photo } from './common';
import type { HelperSummary, ServiceSummary } from './people';

/** Tags a client can give a helper in a review. The UI maps each to copy ("On time"). */
export const HELPER_REVIEW_TAGS = [
  'on_time',
  'friendly',
  'careful',
  'clear_communication',
  'skilled',
  'tidy',
  'good_value',
] as const;
export type HelperReviewTag = (typeof HELPER_REVIEW_TAGS)[number];

export interface HelperServiceDetail extends ServiceSummary {
  /** The helper's own words about this service (plain text). */
  description: string;
}

/** A published review of a helper. Reviews are double-blind until both are in (blueprint 02 §J7). */
export interface PublicReviewView {
  id: string;
  rating: 1 | 2 | 3 | 4 | 5;
  tags: HelperReviewTag[];
  body?: string;
  /** First name + last initial. */
  author: { displayName: string; initials: string };
  categorySlug: CategorySlug;
  publishedAt: ISODateTime;
}

export interface WorkSampleView {
  id: string;
  photo: Photo;
  categorySlug?: CategorySlug;
  caption?: string;
}

/**
 * `/helpers/[handle]`: first name + last initial, neighborhood-level area, badges, services,
 * reviews, and work samples. Never a last name, address, phone, or email.
 */
export interface HelperProfilePageData {
  helper: HelperSummary;
  bio: string;
  /** "Travels up to about 5 miles from East Austin." */
  serviceRadiusMiles: number;
  remoteOk: boolean;
  tools: string[];
  /** Display names, e.g. "English", "Spanish". */
  languages: string[];
  services: HelperServiceDetail[];
  /** Newest first, at most 10. The total is `helper.rating.count`. */
  reviews: PublicReviewView[];
  workSamples: WorkSampleView[];
}
