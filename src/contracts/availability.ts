import { z } from 'zod';
import type { AvailabilityActionId } from './action-ids';
import type { ActionHandler, FieldErrorCode } from './actions';
import { CATEGORY_SLUGS, type CategorySlug, type ISODateTime } from './common';
import type { HelperSetupState } from './helper-work';
import { invitePricingSchema } from './invites';
import type { PricingInput } from './money';
import type { ClientSummary } from './people';
import type { AvailabilityStatus, InviteStatus } from './status';

/**
 * Availability posts (UI-029; blueprint 02 J3 step 4, 03 §3): a helper publishes an open slot, such as
 * "Sat Dec 12, 9 am–1 pm · Yard cleanup · East Austin + 5 mi · $30/h". Clients see active slots on the
 * helper's profile and request one (`routes.app.requestHelper(handle, { slotId })`): the same funded invite
 * as any request, with the slot's start and price pre-filled. The slot is **held** while that invite waits
 * (`sent`, `countered`), **booked** when the helper accepts, and **active** again when the invite is declined,
 * canceled, or expires. A slot **expires** at its start. One category per slot; the area is the helper's
 * service area.
 */

const code = (value: FieldErrorCode) => value;

/** A slot as clients see it (the helper's public profile, the request page). */
export interface AvailabilitySlotView {
  id: string;
  categorySlug: CategorySlug;
  start: ISODateTime;
  end: ISODateTime;
  /** The helper's price for the slot (the task price, before the client's fee). */
  pricing: PricingInput;
}

/** The helper's own post on `/app/availability`. */
export interface AvailabilityPostView extends AvailabilitySlotView {
  status: AvailabilityStatus;
  /** The helper's service area: "East Austin", up to `radiusMiles` away. */
  areaName: string;
  radiusMiles: number;
  /** Held or booked: the client's request. `routes.app.offers(inviteId)` opens it. */
  request?: { inviteId: string; client: ClientSummary; status: InviteStatus };
  /** Booked: `routes.app.booking(bookingId)`. */
  bookingId?: string;
  /** `cancel_post` while active or held (cancelling a held post declines its request). */
  actions: AvailabilityActionId[];
}

/** `routes.app.availability()`. */
export interface MyAvailabilityPageData {
  /** Upcoming posts (active, held, booked) soonest first, then expired and canceled ones, newest first. */
  posts: AvailabilityPostView[];
  /** Posting needs a bookable helper; the form offers `setup.bookableCategories` only. */
  setup: HelperSetupState;
  /** The helper's service area, shown on every post. */
  areaName: string;
  radiusMiles: number;
  /** The helper's listed price per category, pre-filled when a category is chosen. */
  listedPricing: Partial<Record<CategorySlug, PricingInput>>;
  /**
   * Market-time dates the form allows (`YYYY-MM-DD`): from today to 14 days ahead. A slot starts at least
   * `leadHours` from now, lasts at most `maxHours`, and a helper has at most `maxActive` active or held posts.
   */
  limits: { firstDate: string; lastDate: string; leadHours: number; maxHours: number; maxActive: number; activeCount: number };
}

/** A new slot, in market time (like the posting wizard's schedule). */
export const availabilityPostInputSchema = z
  .object({
    categorySlug: z.enum(CATEGORY_SLUGS, code('required')),
    date: z.string(code('required')).regex(/^\d{4}-\d{2}-\d{2}$/, code('required')),
    startTime: z.string(code('required')).regex(/^\d{2}:\d{2}$/, code('required')),
    endTime: z.string(code('required')).regex(/^\d{2}:\d{2}$/, code('required')),
    pricing: invitePricingSchema,
  })
  .refine((value) => value.endTime > value.startTime, { path: ['endTime'], message: code('out_of_range') });
export type AvailabilityPostInput = z.input<typeof availabilityPostInputSchema>;

/**
 * - `onCreate`: ok `saved`. Errors: `validation_failed` (`fieldErrors`: `startTime` `out_of_range` when it
 *   starts too soon or overlaps another post; `date` `out_of_range` beyond the last date; `endTime`
 *   `out_of_range` when it ends before it starts or runs longer than `maxHours`; `categorySlug` `invalid`
 *   when the helper doesn't offer it), `limit_reached` (`maxActive` posts), `not_allowed` (not bookable),
 *   `unknown`.
 * - `onCancel`: ok `canceled`. Errors: `not_allowed` (already booked, expired or canceled), `unknown`.
 */
export interface AvailabilityHandlers {
  onCreate: ActionHandler<AvailabilityPostInput>;
  onCancel: ActionHandler<{ postId: string }>;
}
