import { randomBytes } from 'node:crypto';
import type { CardBrand, DevTestCard } from '@/contracts';
import { DEV_TEST_CARDS } from '@/contracts';

/**
 * Payments port, shaped like Stripe PaymentIntents (docs/blueprint/04 §1, §4). Development uses a
 * stateless stand-in: every payment method reference names a test card, and each test card always
 * gives the same outcome. Production needs the Stripe adapter (blocked: no keys; see blocked.md).
 */

export type PaymentFailureCode = 'payment_declined' | 'insufficient_funds';

export interface ChargeMethod {
  /** The provider's payment method reference (a saved card or a card collected for this payment). */
  providerRef: string;
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
}

export interface PaymentProvider {
  readonly name: 'dev' | 'stripe';
  /** A charge captured right away (booking an offer). Same key, same result. */
  charge(input: { amountCents: number; method: ChargeMethod; idempotencyKey: string; description: string }): Promise<ChargeResult>;
  /** After the customer's bank step. */
  completeAction(input: { providerRef: string; outcome: 'approved' | 'failed' }): Promise<
    { status: 'succeeded' } | { status: 'failed'; failureCode: PaymentFailureCode }
  >;
  /** Refunds part or all of a captured charge. Same key, same result. */
  refund(input: { chargeRef: string; amountCents: number; idempotencyKey: string }): Promise<{ status: 'succeeded' | 'failed'; refundRef: string }>;
  /** Development only: the payment method for a test card (what the provider's card form would return). */
  collectDevCard?(card: DevTestCard): CollectedCard;
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
    async refund() {
      return { status: 'succeeded', refundRef: `devre_${randomBytes(8).toString('hex')}` };
    },
    async completeAction({ outcome }) {
      return outcome === 'approved' ? { status: 'succeeded' } : { status: 'failed', failureCode: 'payment_declined' };
    },
    collectDevCard(card) {
      return { providerRef: devCardRef(card), brand: 'visa', last4: DEV_CARDS[card].last4, expMonth: 12, expYear: 2030 };
    },
  };
}

/** The app's payment provider: the development stand-in until Stripe keys exist (never in production). */
export function createPaymentProvider(): PaymentProvider | null {
  if (process.env.STRIPE_SECRET_KEY) {
    // TODO(integration): Stripe adapter (Phase 10). Refuse to fake payments when real keys are set.
    throw new Error('STRIPE_SECRET_KEY is set but the Stripe adapter is not implemented yet.');
  }
  return process.env.NODE_ENV === 'production' ? null : createDevPaymentProvider();
}
