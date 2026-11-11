import { z } from 'zod';
import type { ActionResult, FieldErrorCode } from './actions';

/**
 * How posters pay (blueprint 04 §1 and §4, 02 J4). Card numbers never reach the app: saved cards
 * carry only a brand and the last four digits, and new cards go into the payment provider's own form.
 * Until Stripe is connected, development uses test cards with fixed outcomes, so every payment state
 * can be tried by hand and in e2e.
 */

export const CARD_BRANDS = ['visa', 'mastercard', 'amex', 'discover'] as const;
export type CardBrand = (typeof CARD_BRANDS)[number];

/** A card the poster saved earlier. */
export interface SavedPaymentMethod {
  id: string;
  brand: CardBrand;
  last4: string;
  /** 1–12. */
  expMonth: number;
  /** Four digits, e.g. 2028. */
  expYear: number;
  isDefault: boolean;
}

/** How a payment shows in lists and errors: "Visa •••• 1881", "Apple Pay". */
export interface PaymentMethodLabel {
  brand: CardBrand | 'apple_pay' | 'google_pay';
  /** Cards only. */
  last4?: string;
}

/**
 * Development test cards. Each gives one outcome:
 * - `success`: approved.
 * - `declined`: the bank declines (`payment_declined`).
 * - `insufficient_funds`: declined for funds (`insufficient_funds`).
 * - `requires_verification`: the bank asks the poster to verify (3-D Secure) first.
 */
export const DEV_TEST_CARDS = ['success', 'declined', 'insufficient_funds', 'requires_verification'] as const;
export type DevTestCard = (typeof DEV_TEST_CARDS)[number];

/**
 * How a new card is collected. Only `dev` exists until Stripe is connected; the Stripe Payment Element
 * (cards, Apple Pay, Google Pay) becomes a second kind then, with the same choice and result types.
 */
export interface DevCardCollection {
  kind: 'dev';
  testCards: readonly DevTestCard[];
}
export type NewCardCollection = DevCardCollection;

/** The payment section of a checkout. */
export interface PaymentPanelData {
  /** Saved cards, the default first. Empty: the new-card form is selected. */
  methods: SavedPaymentMethod[];
  newCard: NewCardCollection;
}

const code = (value: FieldErrorCode) => value;

/** What the poster pays with: a saved card, or a new (development test) card, optionally saved for next time. */
export const paymentChoiceSchema = z.discriminatedUnion(
  'kind',
  [
    z.object({ kind: z.literal('saved'), methodId: z.string(code('required')).min(1, code('required')) }),
    z.object({ kind: z.literal('dev_card'), card: z.enum(DEV_TEST_CARDS, code('required')), save: z.boolean() }),
  ],
  code('required'),
);
export type PaymentChoice = z.infer<typeof paymentChoiceSchema>;

/** A bank verification step (3-D Secure) the poster must finish before the payment goes through. */
export interface PaymentVerification {
  paymentId: string;
  /** `dev`: the UI shows a stand-in bank dialog with "Approve" and "Fail". */
  kind: 'dev';
}

/** What a checkout returns: a normal result, or a bank verification to finish first. */
export type PaymentAttemptResult =
  | ActionResult
  | { ok: false; code: 'requires_bank_verification'; verification: PaymentVerification };

/** Narrows a result to the bank verification case. */
export function needsBankVerification(
  result: PaymentAttemptResult,
): result is { ok: false; code: 'requires_bank_verification'; verification: PaymentVerification } {
  return !result.ok && result.code === 'requires_bank_verification' && 'verification' in result;
}
