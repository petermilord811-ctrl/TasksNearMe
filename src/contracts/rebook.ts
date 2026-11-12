import { z } from 'zod';
import type { ClientActionId, RebookActionId } from './action-ids';
import type { ActionHandler, FieldErrorCode, QueryHandler } from './actions';
import type { CategorySlug, Cents, ISODateTime } from './common';
import { mustAcceptField } from './forms';
import type { HelperSetupState } from './helper-work';
import { invitePricingSchema } from './invites';
import type { ExactAddress } from './location';
import type { PriceBreakdown, PricingInput } from './money';
import { paymentChoiceSchema, type PaymentAttemptResult, type PaymentPanelData } from './payments';
import type { ClientSummary, HelperSummary } from './people';
import type { RebookProposalStatus } from './status';

/**
 * My clients and rebooking proposals (UI-032; blueprint 01 "My clients", 02 J8, 03 §4 `offer_rebook`). A
 * helper sees the people they've completed bookings for and can propose the same task again: a new start,
 * a price (the last one pre-filled), and a message. The client accepts by paying (charged at once, like
 * booking an offer: a new task at the same place and a confirmed booking) or declines. A proposal expires
 * 48 h after it's sent or 2 h before the start, whichever is sooner; the helper can withdraw it while it
 * waits. One waiting proposal per helper and client.
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
  /** Market-time dates allowed (`YYYY-MM-DD`): today to 14 days ahead; the start at least `leadHours` away. */
  limits: { firstDate: string; lastDate: string; leadHours: number };
}

export const rebookProposalInputSchema = z.object({
  date: z.string(code('required')).regex(/^\d{4}-\d{2}-\d{2}$/, code('required')),
  startTime: z.string(code('required')).regex(/^\d{2}:\d{2}$/, code('required')),
  pricing: invitePricingSchema,
  message: z.string(code('invalid')).trim().max(1000, code('too_long')).optional(),
});
export type RebookProposalInput = z.input<typeof rebookProposalInputSchema>;

/**
 * - `onQuote`: the helper's numbers for a price (`helperEarningsCents`; the UI never computes money).
 * - `onPropose`: ok `sent` with `redirectTo` (My clients). Errors: `validation_failed` (`date` or
 *   `startTime` `out_of_range`: too soon or too far out), `not_allowed` (blocked, a proposal already
 *   waiting, the category isn't bookable now), `rate_limited`, `unknown`.
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
  breakdown: PriceBreakdown;
  /** While `sent`. */
  expiresAt?: ISODateTime;
  /** Accepted: the booking. */
  bookingId?: string;
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
 * - `onAccept` (client): ok `booked` with `redirectTo` (the new booking), or bank verification first.
 *   Errors: `payment_declined`, `insufficient_funds`, `expired`, `not_allowed`, `unknown`.
 * - `onFinishVerification`: after the dev bank dialog.
 * - `onDecline` (client), `onWithdraw` (helper): ok `updated`. Errors: `not_allowed`, `expired`, `unknown`.
 */
export interface ProposalHandlers {
  onAccept: QueryHandler<AcceptProposalInput, PaymentAttemptResult>;
  onFinishVerification: QueryHandler<{ paymentId: string; outcome: 'approved' | 'failed' }, PaymentAttemptResult>;
  onDecline: ActionHandler;
  onWithdraw: ActionHandler;
}
