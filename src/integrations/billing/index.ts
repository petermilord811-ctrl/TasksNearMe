import type { PlanCode, PlanInterval } from '@/contracts';
import { devHelpersOn } from '@/shared/dev-helpers';
import { createStripeBilling } from './stripe-billing';

/**
 * Subscription billing (completion plan 9.13, docs/integration-points.md). With STRIPE_SECRET_KEY it is Stripe
 * Billing: Checkout in subscription mode with inline prices (the market policy's, so nothing is set up in Stripe's
 * dashboard first) and the customer portal. Development and tests use the stand-in (`dev`): the module subscribes at
 * once, without leaving the site. A production build without the key offers no plans.
 */

export interface BillingSubscription {
  id: string;
  customerId: string;
  /** Stripe's status: incomplete, incomplete_expired, trialing, active, past_due, canceled, unpaid, paused. */
  status: string;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  endedAt: Date | null;
  interval: PlanInterval | null;
  unitAmountCents: number | null;
  /** What checkout put on it: userId, plan, interval, marketId. */
  metadata: Record<string, string>;
}

export interface CheckoutInput {
  customerId: string;
  userId: string;
  plan: PlanCode;
  interval: PlanInterval;
  priceCents: number;
  /** The plan's name as the receipt and the portal show it ("TasksNearMe Plus"). */
  productName: string;
  marketId: string;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
}

export interface BillingProvider {
  readonly name: 'stripe' | 'dev';
  createCustomer(input: { userId: string; email: string; name: string }): Promise<{ customerId: string }>;
  createCheckout(input: CheckoutInput): Promise<{ url: string; sessionId: string }>;
  createPortal(input: { customerId: string; returnUrl: string; idempotencyKey: string }): Promise<{ url: string }>;
  getSubscription(subscriptionId: string): Promise<BillingSubscription>;
  /** Every subscription of the customer, ended ones too: checked before a new checkout (aa's sweep #1). */
  listSubscriptions(customerId: string): Promise<BillingSubscription[]>;
  /** Stops it renewing: it ends with the period paid for (an account deletion was asked for). */
  cancelAtPeriodEnd(subscriptionId: string): Promise<void>;
  /** Ends it now, with no refund (an account being deleted). */
  cancelNow(subscriptionId: string): Promise<void>;
  /**
   * Deletes the customer and every card on it (an account being deleted, privacy rehearsal J-PR9); its invoices stay
   * on Stripe's records, as the law requires. Deleting one that's already gone is fine.
   */
  forgetCustomer?(customerId: string): Promise<void>;
}

/** The stand-in: the module (src/modules/billing) records its subscriptions itself. */
export function createDevBilling(): BillingProvider {
  const unsupported = () => {
    throw new Error('The billing stand-in has no remote subscriptions.');
  };
  return {
    name: 'dev',
    async createCustomer({ userId }) {
      return { customerId: `devcus_${userId}` };
    },
    async createCheckout({ successUrl, idempotencyKey }) {
      return { url: successUrl, sessionId: `devcs_${idempotencyKey}` };
    },
    async createPortal({ returnUrl }) {
      return { url: returnUrl };
    },
    getSubscription: unsupported,
    async listSubscriptions() {
      return [];
    },
    async cancelAtPeriodEnd() {},
    async cancelNow() {},
  };
}

/**
 * Stripe when payments are Stripe's (both its keys, the payments integration's rule): a plan's rebates go back through
 * the same payments, so the two never mix. With the secret key alone (Stripe Identity only), development keeps the
 * stand-in; production without Stripe offers no plans (null).
 */
export function createBillingProvider(env: Record<string, string | undefined> = process.env): BillingProvider | null {
  const secretKey = env.STRIPE_SECRET_KEY?.trim();
  if (secretKey && env.STRIPE_PUBLISHABLE_KEY?.trim()) return createStripeBilling({ secretKey });
  return devHelpersOn(env) ? createDevBilling() : null;
}
