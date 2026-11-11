import type { CategorySlug, ISODateTime } from './common';
import type { TaskLocation } from './location';
import type { PricingInput } from './money';
import type { RatingSummary } from './people';
import type { TaskStatus } from './status';

export interface TaskSchedule {
  windowStart: ISODateTime;
  windowEnd: ISODateTime;
  /** "Any time on this date" rather than a fixed window. */
  flexible: boolean;
}

/** What helpers and the public may know about the person who posted (never a last name). */
export interface TaskPosterSummary {
  displayName: string;
  initials: string;
  memberSince: ISODateTime;
  phoneVerified: boolean;
  ratingAsClient?: RatingSummary;
}

/**
 * A task as anyone may see it: public board, category pages, public task page.
 * The location is a general area (or remote), never an address; `excerpt` has contact details scrubbed.
 */
export interface TaskPublicView {
  id: string;
  slug: string;
  title: string;
  categorySlug: CategorySlug;
  excerpt: string;
  location: TaskLocation;
  schedule: TaskSchedule;
  budget: PricingInput;
  offerCount: number;
  status: TaskStatus;
  postedAt: ISODateTime;
  poster: TaskPosterSummary;
}
