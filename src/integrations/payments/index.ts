import { createHash, randomBytes } from 'node:crypto';
import type { CardBrand, DevTestCard } from '@/contracts';
import { DEV_TEST_CARDS } from '@/contracts';
import { createStripePayments } from './stripe';
import { devHelpersOn } from '@/shared/dev-helpers';
import { applyFault } from '@/platform/faults';

/**
 * Payments port, shaped like Stripe PaymentIntents (docs/blueprint/04 §1, §4). Development uses a
 * stateless stand-in: every payment method reference names a test card, and each test card always
 * gives the same outcome. With Stripe keys, `./stripe.ts` takes over (cards come from Stripe.js).
 */

export type PaymentFailureCode = 'payment_declined' | 'insufficient_funds';

export interface ChargeMethod {
  /** The provider's payment method reference (a saved card or a card collected for this payment). */
  providerRef: string;
  /** The person's customer at the provider (Stripe: the card is attached to it). */
  customerRef?: string;
}

export type ChargeResult =
  | { status: 'succeeded'; providerRef: string }
  | { status: 'failed'; providerRef: string; failureCode: PaymentFailureCode }
  /** The bank asks the customer to verify (3-D Secure) before the charge can go through. */
  | { status: 'requires_action'; providerRef: string };

export interface CollectedCard {
  providerRef: string;
  brand: CardBrand;
  last4: string;
  expMonth: number;
  expYear: number;
  /**
   * The provider's id for the card itself, the same on every account that adds it (Stripe's `card.fingerprint`): an
   * opaque id, not card data (abuse rehearsal J-AB4: a banned account's card is refused, block evasion is flagged).
   */
  fingerprint?: string;
}

/**
 * A card the browser collected, checked and attached to the person's customer (`prepareCard`). `customerRef` on a refusal:
 * the person's customer, when one was made (or found) before the card was refused; the caller keeps it, so deleting the
 * account deletes it at the provider too.
 */
export type PreparedCardResult =
  | { ok: true; card: CollectedCard; customerRef: string }
  | { ok: false; reason: 'not_supported'; customerRef?: string }
  /** The bank refused the card as it went on the customer (Stripe attaches no card its bank declines): a decline's codes. */
  | { ok: false; reason: 'declined'; failureCode: PaymentFailureCode; customerRef: string };

export type AuthorizeResult =
  | { status: 'authorized'; providerRef: string }
  | { status: 'failed'; providerRef: string; failureCode: PaymentFailureCode }
  | { status: 'requires_action'; providerRef: string };

/**
 * `offSession`: the person isn't here (a scheduled charge: a recurring visit, funding a booking made weeks
 * ahead). The card must be on their customer (`method.customerRef`). A bank that insists on the person
 * answers `requires_action`: ask them to pay in the app, where an ordinary (on-session) charge of the same
 * card runs the bank's step. The development stand-in ignores it.
 */
export interface PaymentRequest {
  amountCents: number;
  method: ChargeMethod;
  idempotencyKey: string;
  description: string;
  offSession?: boolean;
  /**
   * Our `payments` row. Stripe keeps it on the intent (`metadata[payment_id]`), so a webhook can find the row of a call
   * that never answered (a network error mid-call: the row has no intent id yet; money review #9).
   */
  paymentId?: string;
}

export interface PaymentProvider {
  readonly name: 'dev' | 'stripe';
  /** A charge captured right away (booking an offer). Same key, same result. */
  charge(input: PaymentRequest): Promise<ChargeResult>;
  /** After the customer's bank step. */
  completeAction(input: { providerRef: string; outcome: 'approved' | 'failed' }): Promise<
    { status: 'succeeded' } | { status: 'failed'; failureCode: PaymentFailureCode }
  >;
  /**
   * Holds the amount on the card without charging it (direct invites), captured later or released. Same
   * outcomes as `charge`, with `authorized` for success; a bank step finishes with `completeAction`.
   */
  authorize(input: PaymentRequest): Promise<AuthorizeResult>;
  /** Charges a held authorization (up to the held amount). */
  capture(input: { authorizationRef: string; amountCents: number; idempotencyKey: string }): Promise<{ status: 'succeeded' } | { status: 'failed'; failureCode: PaymentFailureCode }>;
  /** Releases a held authorization. */
  cancelAuthorization(input: { authorizationRef: string }): Promise<{ status: 'canceled' }>;
  /** Refunds part or all of a captured charge. Same key, same result. */
  refund(input: { chargeRef: string; amountCents: number; idempotencyKey: string }): Promise<{ status: 'succeeded' | 'failed'; refundRef: string }>;
  /**
   * Development only: the payment method for a test card (what the provider's card form would return). Its fingerprint
   * is the card's for that person (`ownerId`), so one person's test card never matches another's; tests that need two
   * accounts on one card write the fingerprint themselves.
   */
  collectDevCard?(card: DevTestCard, ownerId?: string): CollectedCard;
  /**
   * Stripe: a card collected by Stripe.js (`pm_…`): its brand and last four, attached to the person's
   * customer (made on first use; pass `ref` when one is stored). `not_supported`: not a card brand we take.
   */
  prepareCard?(input: { paymentMethodRef: string; customer: { ref?: string; userId: string; email: string; name: string } }): Promise<PreparedCardResult>;
  /** Stripe: the intent's client secret, for Stripe.js to run the bank's step in the browser (never stored). */
  clientSecretOf?(intentRef: string): Promise<string | null>;
  /** Stripe: takes a saved card off the person's customer when they remove it. */
  detachCard?(methodRef: string): Promise<void>;
  /** Stripe: deletes the person's customer (and every card on it) when their account is deleted. */
  forgetCustomer?(customerRef: string): Promise<void>;
}

/** The last four digits of Stripe's test cards with the same outcomes. */
const DEV_CARDS: Record<DevTestCard, { last4: string }> = {
  success: { last4: '4242' },
  declined: { last4: '0002' },
  insufficient_funds: { last4: '9995' },
  requires_verification: { last4: '3155' },
};

const DEV_REF_PREFIX = 'devpm_';

/** `devpm_<card>` for collected test cards; saved development cards use the same references. */
export function devCardRef(card: DevTestCard): string {
  return `${DEV_REF_PREFIX}${card}`;
}

function devCardOf(providerRef: string): DevTestCard {
  const card = providerRef.startsWith(DEV_REF_PREFIX) ? providerRef.slice(DEV_REF_PREFIX.length) : '';
  return (DEV_TEST_CARDS as readonly string[]).includes(card) ? (card as DevTestCard) : 'success';
}

export function createDevPaymentProvider(): PaymentProvider {
  const intentId = () => `devpi_${randomBytes(8).toString('hex')}`;
  return {
    name: 'dev',
    async charge({ method }) {
      // A provider outage on purpose (/dev/faults; src/platform/faults.ts).
      await applyFault('payments');
      const providerRef = intentId();
      switch (devCardOf(method.providerRef)) {
        case 'declined':
          return { status: 'failed', providerRef, failureCode: 'payment_declined' };
        case 'insufficient_funds':
          return { status: 'failed', providerRef, failureCode: 'insufficient_funds' };
        case 'requires_verification':
          return { status: 'requires_action', providerRef };
        default:
          return { status: 'succeeded', providerRef };
      }
    },
    async authorize({ method }) {
      await applyFault('payments');
      const providerRef = intentId();
      switch (devCardOf(method.providerRef)) {
        case 'declined':
          return { status: 'failed', providerRef, failureCode: 'payment_declined' };
        case 'insufficient_funds':
          return { status: 'failed', providerRef, failureCode: 'insufficient_funds' };
        case 'requires_verification':
          return { status: 'requires_action', providerRef };
        default:
          return { status: 'authorized', providerRef };
      }
    },
    async capture() {
      return { status: 'succeeded' };
    },
    async cancelAuthorization() {
      return { status: 'canceled' };
    },
    async refund() {
      return { status: 'succeeded', refundRef: `devre_${randomBytes(8).toString('hex')}` };
    },
    async completeAction({ outcome }) {
      return outcome === 'approved' ? { status: 'succeeded' } : { status: 'failed', failureCode: 'payment_declined' };
    },
    collectDevCard(card, ownerId) {
      const fingerprint = `devfp_${createHash('sha256').update(`${ownerId ?? ''}:${card}`).digest('hex').slice(0, 16)}`;
      return { providerRef: devCardRef(card), brand: 'visa', last4: DEV_CARDS[card].last4, expMonth: 12, expYear: 2030, fingerprint };
    },
  };
}

/**
 * The app's payment provider. Stripe when both its secret key and its publishable key are set (the
 * browser collects cards with Stripe.js); with the secret key alone (Stripe Identity only) payments keep
 * the development stand-in outside production. Production without Stripe takes no payments (null).
 */
export function createPaymentProvider(env: Record<string, string | undefined> = process.env): PaymentProvider | null {
  const secretKey = env.STRIPE_SECRET_KEY?.trim();
  if (secretKey && env.STRIPE_PUBLISHABLE_KEY?.trim()) return createStripePayments({ secretKey });
  return !devHelpersOn(env) ? null : createDevPaymentProvider();
}

/** Stripe.js's key for the browser's card form, when Stripe takes the payments. */
export function stripePublishableKey(env: Record<string, string | undefined> = process.env): string | null {
  return env.STRIPE_SECRET_KEY?.trim() ? env.STRIPE_PUBLISHABLE_KEY?.trim() || null : null;
}
