import { z } from 'zod';
import type { ActionDescriptor, ActionHandler, ActionResult, FieldErrorCode, QueryHandler } from './actions';
import type { OfferActionId } from './action-ids';
import type { CategorySlug, Cents, ISODateTime, Photo } from './common';
import type { InviteView } from './invites';
import type { CategoryView } from './marketing';
import type { PriceBreakdown, PricingInput } from './money';
import type { OnboardingStep } from './routes';
import type { OfferStatus } from './status';
import type { TaskDetailsValue } from './posting';
import type { TaskBoardQuery, TaskPublicView } from './tasks';

/**
 * The helper's side of the marketplace (blueprint 02 J2): find work, a task from the helper's view,
 * making and managing offers. Only bookable helpers can send offers; everyone else sees what to
 * finish first. Distances are bands from the helper's area, never exact.
 */

export const FIND_WORK_DISTANCES = ['any', 'within_2_mi', 'within_5_mi', 'within_10_mi'] as const;
export type FindWorkDistance = (typeof FIND_WORK_DISTANCES)[number];

export interface FindWorkQuery extends TaskBoardQuery {
  /** Default `any`. Measured from the helper's area. */
  distance?: FindWorkDistance;
}

/** Why a helper can't make an offer on a task. */
export const OFFER_BLOCKED_REASONS = [
  'not_bookable',
  'needs_background_check',
  'category_not_offered',
  'outside_area',
  'task_closed',
  'own_task',
] as const;
export type OfferBlockedReason = (typeof OFFER_BLOCKED_REASONS)[number];

export interface FindWorkCard {
  task: TaskPublicView;
  /** The helper's own offer on this task, when there is one. */
  myOffer?: { id: string; status: OfferStatus };
  /** Absent when the helper can offer. */
  blockedReason?: OfferBlockedReason;
}

export interface HelperSetupState {
  /** Can send offers in at least one category. */
  bookable: boolean;
  bookableCategories: CategorySlug[];
  /** Where to continue onboarding when something is missing. */
  nextOnboardingStep?: OnboardingStep;
}

/** `/app/find-work`: open tasks near the helper, newest or soonest first. */
export interface FindWorkPageData {
  query: {
    category?: CategorySlug;
    when: NonNullable<TaskBoardQuery['when']>;
    remoteOnly: boolean;
    sort: NonNullable<TaskBoardQuery['sort']>;
    page: number;
    distance: FindWorkDistance;
  };
  categories: CategoryView[];
  cards: FindWorkCard[];
  totalCount: number;
  pageCount: number;
  setup: HelperSetupState;
}

/** The helper's own offer, in the helper's money. */
export interface HelperOfferView {
  id: string;
  status: OfferStatus;
  pricing: PricingInput;
  proposedStart: ISODateTime;
  /** As the helper wrote it (the poster sees contact details masked). */
  message: string;
  brings: string[];
  expiresAt: ISODateTime;
  revision: number;
  submittedAt: ISODateTime;
  /** Helper variant: price, service fee, what you'll earn. */
  breakdown: PriceBreakdown;
  /** From the domain: revise, withdraw, reconfirm (stale), message. */
  actions: ActionDescriptor<OfferActionId>[];
}

/** `/app/find-work/[taskId]`: a task from the helper's side (never the address before booking). */
export interface HelperTaskView {
  task: TaskPublicView;
  /** The full description, contact details masked. */
  description: string;
  details: TaskDetailsValue;
  photos: Photo[];
  expenseAllowance?: { amountCents: Cents; description: string };
  myOffer?: HelperOfferView;
  /** Absent when the helper can offer. `own_task`: the helper posted it. */
  blockedReason?: OfferBlockedReason;
  setup: HelperSetupState;
  /** For the offer form. */
  offerRules: OfferRules;
  /** Prefilled offer: the poster's budget and the window start. */
  offerDefaults: OfferInput;
}

export interface OfferRules {
  /** The task's date in the market time zone, "2026-11-21". */
  date: string;
  /** Allowed start times in the market time zone, 30-minute steps ("10:00", "10:30", …). */
  startTimes: string[];
  /** The offer must match the task's pricing type. */
  pricingType: 'fixed' | 'hourly';
  minPriceCents: Cents;
  /** Hourly tasks: the cap may not be below the poster's estimate. */
  minHoursCap?: number;
  messageMaxLength: number;
}

const code = (value: FieldErrorCode) => value;

/** The offer form, checked against the task's rules (client and server use the same schema). */
export function createOfferInputSchema(rules: OfferRules) {
  return z
    .object({
      pricing: z.discriminatedUnion('type', [
        z.object({ type: z.literal('fixed'), priceCents: z.number(code('required')).int().positive(code('required')) }),
        z.object({
          type: z.literal('hourly'),
          rateCents: z.number(code('required')).int().positive(code('required')),
          estimatedHours: z.number(code('required')).positive(code('required')).multipleOf(0.5, code('invalid')),
          hoursCap: z.number(code('required')).positive(code('required')).multipleOf(0.5, code('invalid')),
        }),
      ]),
      /** Market-local "HH:MM" from `rules.startTimes`. */
      startTime: z.string(code('required')).regex(/^([01]\d|2[0-3]):[0-5]\d$/, code('required')),
      message: z.string(code('required')).trim().max(rules.messageMaxLength, code('too_long')),
      brings: z.array(z.string().trim().min(2, code('too_short')).max(40, code('too_long'))).max(10, code('too_long')),
    })
    .superRefine((offer, ctx) => {
      const issue = (path: (string | number)[], message: FieldErrorCode) => ctx.addIssue({ code: 'custom', path, message });
      if (offer.pricing.type !== rules.pricingType) return issue(['pricing', 'type'], 'invalid');
      if (!rules.startTimes.includes(offer.startTime)) issue(['startTime'], 'out_of_range');
      if (offer.pricing.type === 'fixed') {
        if (offer.pricing.priceCents < rules.minPriceCents) issue(['pricing', 'priceCents'], 'out_of_range');
      } else {
        const { rateCents, estimatedHours, hoursCap } = offer.pricing;
        if (hoursCap < estimatedHours) issue(['pricing', 'hoursCap'], 'out_of_range');
        if (rules.minHoursCap && hoursCap < rules.minHoursCap) issue(['pricing', 'hoursCap'], 'out_of_range');
        if (rateCents * estimatedHours < rules.minPriceCents) issue(['pricing', 'rateCents'], 'out_of_range');
      }
    });
}
export type OfferInput = z.input<ReturnType<typeof createOfferInputSchema>>;

/**
 * Handlers on the helper task view.
 * - `onQuote`: the helper's breakdown for a price (the UI never computes fees).
 * - `onSubmitOffer`: ok `sent`. Errors: `validation_failed` (dotted `fieldErrors`), `not_allowed`
 *   (not bookable or task closed), `limit_reached` (too many active offers), `rate_limited`.
 * - `onReviseOffer`: ok `updated` (a new revision; the poster is told).
 * - `onOfferAction`: `withdraw_offer`, `reconfirm_offer` (ok `updated`). Messaging the poster
 *   arrives with messaging (UI-014).
 */
export interface HelperWorkHandlers {
  onQuote: QueryHandler<{ pricing: PricingInput }, PriceBreakdown>;
  onSubmitOffer: ActionHandler<OfferInput>;
  onReviseOffer: ActionHandler<OfferInput>;
  onOfferAction: (input: { offerId: string; action: OfferActionId }) => Promise<ActionResult>;
}

export interface MyOfferRow {
  offer: Pick<HelperOfferView, 'id' | 'status' | 'pricing' | 'proposedStart' | 'expiresAt' | 'revision' | 'breakdown'>;
  task: TaskPublicView;
}

/** `/app/offers`: the helper's offers (invites join this page in UI-010). */
export interface MyOffersPageData {
  /** `pending` and `stale`, soonest start first. */
  active: MyOfferRow[];
  /** `accepted`, newest first. */
  booked: MyOfferRow[];
  /** `declined`, `withdrawn`, `expired`, newest first. */
  closed: MyOfferRow[];
  /** Invites from clients (UI-025): open ones first (`sent`, `countered`), then the rest, newest first. */
  invites?: InviteView[];
  /** `routes.app.offers(inviteId)`: the invite to open in a sheet. */
  openInviteId?: string;
}
