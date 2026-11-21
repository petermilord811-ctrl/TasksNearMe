import { z } from 'zod';
import type { ActionDescriptor, ActionHandler, ActionResult, FieldErrorCode, QueryHandler } from './actions';
import type { BotCheckConfig, BotCheckInput } from './bot-check';
import type { OfferActionId } from './action-ids';
import type { CategorySlug, Cents, ISODateTime, Photo, TimeZone } from './common';
import type { InviteView } from './invites';
import type { CategoryView } from './marketing';
import type { PriceBreakdown, PricingInput } from './money';
import type { OnboardingStep } from './routes';
import type { OfferStatus } from './status';
import type { TaskDetailsValue } from './posting';
import type { TaskBoardQuery, TaskPublicView, TaskBoardQueryState } from './tasks';

/**
 * The helper's side of the marketplace (blueprint 02 J2): find work, a task from the helper's view,
 * making and managing offers. Only bookable helpers can send offers; everyone else sees what to
 * finish first. Distances are bands from the helper's area, never exact.
 */

export const FIND_WORK_DISTANCES = ['any', 'within_2_mi', 'within_5_mi', 'within_10_mi'] as const;
export type FindWorkDistance = (typeof FIND_WORK_DISTANCES)[number];

/** `nearest`: from the helper's area (remote tasks last). `pay`: what the client offers for the whole task, highest first. */
export const FIND_WORK_SORTS = ['soonest', 'newest', 'nearest', 'pay'] as const;
export type FindWorkSort = (typeof FIND_WORK_SORTS)[number];

/** Phones show the list or the map; wide screens show both. */
export const FIND_WORK_VIEWS = ['list', 'map'] as const;
export type FindWorkView = (typeof FIND_WORK_VIEWS)[number];

export interface FindWorkQuery extends Omit<TaskBoardQuery, 'sort' | 'view' | 'group'> {
  /** Default `any`. Measured from the helper's area. */
  distance?: FindWorkDistance;
  /** Default `soonest`. */
  sort?: FindWorkSort;
  /** Only the tasks the helper saved. */
  saved?: boolean;
  /** Default `list`. */
  view?: FindWorkView;
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
  /** What the helper would earn after the service fee: for the task, or per hour (and for the whole cap). */
  earnings: { type: 'fixed'; amountCents: Cents } | { type: 'hourly'; rateCents: Cents; capCents: Cents };
  /** The day it starts, in the market's time ("2026-11-21"), for day groups. */
  startDay: string;
  /** Posted in the last 24 hours. */
  isNew: boolean;
  /** The helper saved it for later. */
  saved: boolean;
  /**
   * One tap from the list (completion plan 4.3): only on fixed-price tasks the helper can offer on and hasn't
   * yet. The offer is the poster's price, from the start of the task's window, with no message (the poster sees
   * the helper's profile). `earningsCents` is what the helper would earn after the service fee.
   */
  quickOffer?: { priceCents: Cents; earningsCents: Cents; proposedStart: ISODateTime };
}

/** The map beside the list: the tiles, the helper's area (a neighborhood's center, never a home) and the market's center. */
export interface FindWorkMap {
  styleUrl: string;
  attribution: string;
  area?: { name: string; center: { lat: number; lng: number }; serviceRadiusMiles: number };
  marketCenter: { lat: number; lng: number };
}

export interface HelperSetupState {
  /** Can send offers in at least one category. */
  bookable: boolean;
  bookableCategories: CategorySlug[];
  /** Where to continue onboarding when something is missing. */
  nextOnboardingStep?: OnboardingStep;
}

/** `/app/find-work`: open tasks near the helper, newest or soonest first. */
/** Where a waiting helper lives, and the people waiting near their ZIP (its first three digits, about one metro). */
export interface FindWorkWaiting {
  /** The city they typed, its state ("Pretty Prairie", "KS"), and their ZIP. */
  city: string;
  state: string;
  zip: string;
  /** People on the waitlist near that ZIP, and helpers waiting there (this one included). */
  waiting: number;
  helpersWaiting: number;
}

export interface FindWorkPageData {
  query: {
    category?: CategorySlug;
    when: NonNullable<TaskBoardQuery['when']>;
    remoteOnly: boolean;
    sort: FindWorkSort;
    page: number;
    distance: FindWorkDistance;
    saved: boolean;
    view: FindWorkView;
  } & Partial<Pick<TaskBoardQueryState, 'type' | 'q' | 'areas' | 'minPrice' | 'maxPrice' | 'pricing' | 'posted' | 'times' | 'few'>>;
  categories: CategoryView[];
  /** The market's neighborhoods, for the neighborhood filter (completion plan 7.4). */
  areas?: { slug: string; name: string }[];
  cards: FindWorkCard[];
  totalCount: number;
  pageCount: number;
  setup: HelperSetupState;
  map: FindWorkMap;
  /** Today in the market's time, for "Today" and "Tomorrow". */
  today: string;
  /** The helper's market zone: the cards' dates and times are shown on its clock (completion plan 8.1). */
  timeZone: TimeZone;
  /** Open tasks the helper saved. */
  savedCount: number;
  /** The bot check for one-tap offers (contracts/bot-check.ts, action `offer`). Absent: none is set up. */
  botCheck?: BotCheckConfig;
  /**
   * The helper waits for their city (completion plan 8.4): they gave a ZIP no open market covers, so there's no list
   * (`cards` is empty) but "We're not in {city} yet", their setup to finish meanwhile, and who else is waiting there.
   */
  waitingFor?: FindWorkWaiting;
}

/**
 * Save for later and Not interested (hidden tasks leave the list; Undo brings them back). Both resolve with
 * ok `updated`; `not_found` for a task that isn't open any more.
 */
export interface FindWorkHandlers {
  onSaveTask: ActionHandler<{ taskId: string; saved: boolean }>;
  onHideTask: ActionHandler<{ taskId: string; hidden: boolean }>;
  /**
   * The one-tap offer (`card.quickOffer`), with the bot check's answer: ok `sent`. Errors: `not_allowed` (the
   * helper can't offer on it, or already has), `limit_reached` (too many active offers), `rate_limited`,
   * `not_found` (no longer open), `validation_failed` + `fieldErrors.botCheck` (the check was turned down).
   */
  onQuickOffer?: ActionHandler<{ taskId: string } & BotCheckInput>;
  /** Undo, right after a one-tap offer: withdraws the helper's active offer on that task (ok `updated`). */
  onUndoQuickOffer?: ActionHandler<{ taskId: string }>;
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
  /** `declined` because the task was canceled while this offer was open, not because another was chosen (sweep D9). */
  taskCanceled?: boolean;
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
  /** The `ai_drafting` flag, and drafting is set up: show "Write it for me" on the offer message. */
  aiDraftingEnabled: boolean;
  /** The bot check before sending a new offer (contracts/bot-check.ts, action `offer`). Absent: none is set up. */
  botCheck?: BotCheckConfig;
}

export interface OfferRules {
  /** The task's market zone (completion plan 8.1): `date` and `startTimes` are on its clock. */
  timeZone: TimeZone;
  /** The task's date in its market's zone, "2026-11-21". */
  date: string;
  /** Allowed start times in its market's zone, 30-minute steps ("10:00", "10:30", …). */
  startTimes: string[];
  /** The offer must match the task's pricing type. */
  pricingType: 'fixed' | 'hourly';
  /** The category's usual minimum: a price under it is allowed and only noted (`belowCategoryMinimum`; owner, 2026-11-21). */
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
      // The same ceilings as posting (contracts/posting.ts): $100,000, $1,000 an hour, 24 hours (security review).
      pricing: z.discriminatedUnion('type', [
        z.object({ type: z.literal('fixed'), priceCents: z.number(code('required')).int().positive(code('required')).max(10_000_000, code('out_of_range')) }),
        z.object({
          type: z.literal('hourly'),
          rateCents: z.number(code('required')).int().positive(code('required')).max(100_000, code('out_of_range')),
          estimatedHours: z.number(code('required')).positive(code('required')).multipleOf(0.5, code('invalid')).max(24, code('out_of_range')),
          hoursCap: z.number(code('required')).positive(code('required')).multipleOf(0.5, code('invalid')).max(24, code('out_of_range')),
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
      // A price under the category's usual minimum is allowed, as on the task itself (owner, 2026-11-21).
      if (offer.pricing.type === 'hourly') {
        const { estimatedHours, hoursCap } = offer.pricing;
        if (hoursCap < estimatedHours) issue(['pricing', 'hoursCap'], 'out_of_range');
        if (rules.minHoursCap && hoursCap < rules.minHoursCap) issue(['pricing', 'hoursCap'], 'out_of_range');
      }
    });
}
export type OfferInput = z.input<ReturnType<typeof createOfferInputSchema>>;

/**
 * Handlers on the helper task view.
 * - `onQuote`: the helper's breakdown for a price (the UI never computes fees).
 * - `onSubmitOffer`: ok `sent`. Errors: `validation_failed` (dotted `fieldErrors`), `not_allowed`
 *   (not bookable or task closed), `limit_reached` (too many active offers), `rate_limited`.
 * - `onReviseOffer`: ok `updated` (a new revision; the poster is told). Errors: `validation_failed`, `not_found`,
 *   `expired`, `version_conflict` (the offer changed meanwhile: booked, declined, or revised in another tab),
 *   `rate_limited`.
 * - `onOfferAction`: `withdraw_offer`, `reconfirm_offer` (ok `updated`; `version_conflict` when the offer changed
 *   meanwhile). Messaging the poster arrives with messaging (UI-014).
 */
/**
 * "Write it for me" on the offer message: drafted from the task as the helper sees it, the helper's
 * profile, the chosen start time and what they'll bring, plus any notes. Saves nothing; the helper edits it.
 */
export interface OfferMessageDraftInput {
  /** Market-local "HH:MM" from `offerRules.startTimes`. */
  startTime: string;
  brings: string[];
  /** Anything the helper wants it to say (at most 300 characters). */
  notes?: string;
}
/** `prohibited`: the notes ask for something TasksNearMe doesn't allow. `rate_limited`: 20 drafts an hour. */
export type OfferMessageDraftResult =
  | { ok: true; message: string }
  | { ok: false; code: 'unavailable' | 'rate_limited' | 'prohibited' };

export interface HelperWorkHandlers {
  onQuote: QueryHandler<{ pricing: PricingInput }, PriceBreakdown>;
  /** "Write it for me" (only when `aiDraftingEnabled`); bound to the task by the page. */
  onDraftOfferMessage: QueryHandler<OfferMessageDraftInput, OfferMessageDraftResult>;
  /** With the bot check's answer; `fieldErrors.botCheck` when it's turned down. */
  onSubmitOffer: ActionHandler<OfferInput & BotCheckInput>;
  onReviseOffer: ActionHandler<OfferInput>;
  onOfferAction: (input: { offerId: string; action: OfferActionId }) => Promise<ActionResult>;
}

export interface MyOfferRow {
  offer: Pick<HelperOfferView, 'id' | 'status' | 'pricing' | 'proposedStart' | 'expiresAt' | 'revision' | 'breakdown' | 'taskCanceled'>;
  task: TaskPublicView;
  /**
   * A booked offer whose booking changed since (an accepted change): the booking's price, earnings and start now.
   * The row shows these, with the offer's price as "was" (journeys on a phone).
   */
  current?: { pricing: PricingInput; breakdown: PriceBreakdown; start: ISODateTime };
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
