import { z } from 'zod';
import type { ClientActionId, RebookActionId } from './action-ids';
import type { ActionHandler, FieldErrorCode, QueryHandler } from './actions';
import type { CategorySlug, Cents, ISODateTime, TimeZone } from './common';
import { mustAcceptField } from './forms';
import type { HelperSetupState } from './helper-work';
import { invitePricingSchema } from './invites';
import type { ExactAddress } from './location';
import type { PriceBreakdown, PricingInput } from './money';
import { paymentChoiceSchema, type CardRemovalHandlers, type PaymentAttemptResult, type PaymentPanelData } from './payments';
import type { ClientSummary, HelperSummary } from './people';
import { REPEAT_CHOICES, type SeriesSchedule } from './series';
import type { RebookProposalStatus } from './status';

/**
 * My clients and rebooking proposals (UI-032; blueprint 01 "My clients", 02 J8, 03 §4 `offer_rebook`). A
 * helper sees the people they've completed bookings for and can propose the same task again: a new start,
 * a price (the last one pre-filled), and a message. The client accepts by paying (charged at once, like
 * booking an offer: a new task at the same place and a confirmed booking) or declines. A proposal expires
 * 48 h after it's sent or 2 h before the start, whichever is sooner; the helper can withdraw it while it
 * waits. One waiting proposal per helper and client.
 *
 * Regular visits (blueprint 03 §7, src/contracts/series.ts): for cleaning and yard work, and when the market has
 * them, the helper can propose the task on a schedule (`repeat`). The proposal's start is the first visit;
 * accepting pays it and keeps the card on file for the next visits, each charged 2 days before.
 */

const code = (value: FieldErrorCode) => value;

/** A past client on `routes.app.clients()`. */
export interface MyClientRow {
  client: ClientSummary;
  /** Completed bookings together. */
  completedCount: number;
  /** The latest completed booking: what a proposal repeats. */
  lastBooking: { id: string; title: string; categorySlug: CategorySlug; completedAt: ISODateTime; pricing: PricingInput; earnedCents: Cents };
  /** A proposal waiting for the client (`routes.app.proposal(id)`). */
  openProposal?: { id: string; start: ISODateTime; expiresAt: ISODateTime };
  /**
   * `propose_rebook` (→ `routes.app.bookingRebook(lastBooking.id)`) unless a proposal is waiting, either
   * person blocked the other, or the helper can't take that category now.
   */
  actions: ClientActionId[];
}

/** `routes.app.clients()`: most recent booking first. */
export interface MyClientsPageData {
  clients: MyClientRow[];
  setup: HelperSetupState;
}

/** `routes.app.bookingRebook(bookingId)`: the helper proposes the past booking's task again. */
export interface ProposeRebookPageData {
  client: ClientSummary;
  booking: {
    id: string;
    title: string;
    categorySlug: CategorySlug;
    /** Where it was (neighborhood level; the new booking uses the same place). */
    areaName: string;
    lastPricing: PricingInput;
    lastStart: ISODateTime;
  };
  /** Dates allowed on the market's clock (`YYYY-MM-DD`): today to 14 days ahead; the start at least `leadHours` away. */
  limits: { firstDate: string; lastDate: string; leadHours: number };
  /** The booking's market zone: the date and start time are on its clock (completion plan 8.1). */
  timeZone: TimeZone;
  /** The task can repeat (its category has regular visits, and the market has them on): the "Repeat" choice. */
  canRepeat: boolean;
}

export const rebookProposalInputSchema = z.object({
  date: z.string(code('required')).regex(/^\d{4}-\d{2}-\d{2}$/, code('required')),
  startTime: z.string(code('required')).regex(/^\d{2}:\d{2}$/, code('required')),
  pricing: invitePricingSchema,
  message: z.string(code('invalid')).trim().max(1000, code('too_long')).optional(),
  /** Just once (the default), or regular visits on this cadence (only when `canRepeat`). */
  repeat: z.enum(REPEAT_CHOICES, code('invalid')).optional(),
});
export type RebookProposalInput = z.input<typeof rebookProposalInputSchema>;

/**
 * - `onQuote`: the helper's numbers for a price (`helperEarningsCents`; the UI never computes money).
 * - `onPropose`: ok `sent` with `redirectTo` (My clients). Errors: `validation_failed` (`date` or
 *   `startTime` `out_of_range`: too soon or too far out; `repeat` `invalid`: this task can't repeat),
 *   `not_allowed` (blocked, a proposal already waiting, the category isn't bookable now), `rate_limited`,
 *   `unknown`.
 */
export interface ProposeRebookHandlers {
  onQuote: QueryHandler<{ pricing: PricingInput }, PriceBreakdown>;
  onPropose: ActionHandler<RebookProposalInput>;
}

/** A proposal, projected for the viewer (clients see what they'd pay; helpers what they'd earn). */
export interface RebookProposalView {
  id: string;
  status: RebookProposalStatus;
  viewerRole: 'poster' | 'helper';
  client: ClientSummary;
  helper: HelperSummary;
  task: { title: string; categorySlug: CategorySlug; areaName: string };
  /** Clients only: their own address from the past booking (render with `ExactAddressPanel`). */
  exactAddress?: ExactAddress;
  start: ISODateTime;
  pricing: PricingInput;
  message?: string;
  /** Per visit when it repeats. */
  breakdown: PriceBreakdown;
  /** Regular visits: how they repeat (the start is the first visit), and the first four dates. */
  schedule?: SeriesSchedule;
  visitStarts?: ISODateTime[];
  /** While `sent`. */
  expiresAt?: ISODateTime;
  /** Accepted: the booking (the first visit when it repeats), and the series. */
  bookingId?: string;
  seriesId?: string;
  sentAt: ISODateTime;
  /** Clients: `accept_proposal`, `decline_proposal` while sent. Helpers: `withdraw_proposal` while sent. */
  actions: RebookActionId[];
}

/** `routes.app.proposal(proposalId)`. */
export interface ProposalPageData {
  proposal: RebookProposalView;
  /** Clients, while the proposal waits: the card panel (as on the confirmation page). */
  payment?: PaymentPanelData;
}

export const acceptProposalInputSchema = z.object({
  payment: paymentChoiceSchema,
  acceptTerms: mustAcceptField,
});
export type AcceptProposalInput = z.input<typeof acceptProposalInputSchema>;

/**
 * - `onAccept` (client): ok `booked` with `redirectTo` (the new booking; the series when it repeats), or bank
 *   verification first. A repeating proposal keeps the card for the next visits (a new card is saved).
 *   Errors: `payment_declined`, `insufficient_funds`, `expired`, `not_allowed`, `unknown`.
 * - `onFinishVerification`: after the dev bank dialog.
 * - `onDecline` (client), `onWithdraw` (helper): ok `updated`. Errors: `not_allowed`, `expired`, `unknown`.
 */
export interface ProposalHandlers extends CardRemovalHandlers {
  onAccept: QueryHandler<AcceptProposalInput, PaymentAttemptResult>;
  onFinishVerification: QueryHandler<{ paymentId: string; outcome: 'approved' | 'failed' }, PaymentAttemptResult>;
  onDecline: ActionHandler;
  onWithdraw: ActionHandler;
}
