import { CARD_BRANDS, type CardBrand } from '@/contracts';
import type { AuthorizeResult, ChargeResult, CollectedCard, PaymentFailureCode, PaymentProvider, PaymentRequest, PreparedCardResult } from './index';

/**
 * Stripe payments (docs/integration-points.md, blueprint 04 §1, §4), written against Stripe's REST API
 * without the SDK, in the account's default API version:
 * - a card collected by Stripe.js arrives as a PaymentMethod (`pm_…`) and is attached to the person's
 *   Customer (`prepareCard`), so later charges on the same booking (changes, counter-offers) can use it;
 * - `charge` confirms a PaymentIntent at once; `authorize` holds one (manual capture) for direct invites;
 * - 3-D Secure comes back as `requires_action` with the intent's client secret (Stripe.js finishes it in
 *   the browser) and `completeAction` reads the outcome;
 * - every create passes the app's idempotency key, so a retried request never charges twice.
 */

const API = 'https://api.stripe.com/v1';

type StripeObject = Record<string, unknown>;

export class StripeError extends Error {
  constructor(
    readonly status: number,
    readonly body: { type?: string; code?: string; decline_code?: string; payment_intent?: StripeObject } = {},
  ) {
    super(`Stripe answered ${status}${body.code ? ` (${body.code})` : ''}`);
    this.name = 'StripeError';
  }
}

export interface StripeClient {
  /** `account`: act on a connected account (Stripe-Account), e.g. its balance and payouts. */
  request(method: 'GET' | 'POST' | 'DELETE', path: string, params?: URLSearchParams, idempotencyKey?: string, options?: { account?: string }): Promise<StripeObject>;
}

export function createStripeClient(config: { secretKey: string; fetch?: typeof fetch }): StripeClient {
  const doFetch = config.fetch ?? fetch;
  return {
    async request(method, path, params, idempotencyKey, options = {}) {
      const query = method === 'GET' && params ? `?${params.toString()}` : '';
      const response = await doFetch(`${API}${path}${query}`, {
        method,
        headers: {
          Authorization: `Bearer ${config.secretKey}`,
          ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
          ...(options.account ? { 'Stripe-Account': options.account } : {}),
        },
        ...(method === 'POST' ? { body: (params ?? new URLSearchParams()).toString() } : {}),
        signal: AbortSignal.timeout(30_000),
      });
      const body = (await response.json().catch(() => ({}))) as StripeObject;
      if (!response.ok) throw new StripeError(response.status, (body.error ?? {}) as StripeError['body']);
      return body;
    },
  };
}

const str = (value: unknown) => (typeof value === 'string' ? value : undefined);

/** Stripe's decline reason as the app's failure code. */
export function failureCodeOf(error: { code?: string; decline_code?: string } | undefined): PaymentFailureCode {
  return error?.decline_code === 'insufficient_funds' || error?.code === 'insufficient_funds' ? 'insufficient_funds' : 'payment_declined';
}

/** Off the person's session, the bank wants them (3-D Secure): the intent it stopped on, for an in-app payment. */
function needsPerson(error: unknown): string | null {
  if (error instanceof StripeError && error.status === 402 && error.body.code === 'authentication_required') return str(error.body.payment_intent?.id) ?? '';
  return null;
}

/** A card error carries the intent it failed on; anything else isn't the card's fault and is rethrown. */
function declined(error: unknown): { providerRef: string; failureCode: PaymentFailureCode } {
  if (error instanceof StripeError && error.status === 402 && error.body.type === 'card_error') {
    return { providerRef: str(error.body.payment_intent?.id) ?? '', failureCode: failureCodeOf(error.body) };
  }
  throw error;
}

function intentOutcome(intent: StripeObject): { status: 'succeeded' | 'authorized' | 'requires_action' | 'failed'; failureCode?: PaymentFailureCode } {
  switch (intent.status) {
    case 'succeeded':
      return { status: 'succeeded' };
    case 'requires_capture':
      return { status: 'authorized' };
    // The bank's step (3-D Secure), or a card payment Stripe is still confirming: the browser finishes it.
    case 'requires_action':
    case 'processing':
      return { status: 'requires_action' };
    default:
      return { status: 'failed', failureCode: failureCodeOf(intent.last_payment_error as { code?: string; decline_code?: string } | undefined) };
  }
}

export interface StripePayments extends PaymentProvider {
  readonly name: 'stripe';
  clientSecretOf(intentRef: string): Promise<string | null>;
  detachCard(methodRef: string): Promise<void>;
  forgetCustomer(customerRef: string): Promise<void>;
}

export function createStripePayments(config: { secretKey: string; fetch?: typeof fetch }): StripePayments {
  const stripe = createStripeClient(config);

  async function createIntent(input: PaymentRequest, capture: 'automatic' | 'manual') {
    if (input.offSession && !input.method.customerRef) throw new Error('An off-session charge needs the card on the person\'s customer (method.customerRef).');
    const params = new URLSearchParams({
      amount: String(input.amountCents),
      currency: 'usd',
      payment_method: input.method.providerRef,
      'payment_method_types[]': 'card',
      capture_method: capture,
      confirm: 'true',
      description: input.description,
    });
    if (input.method.customerRef) params.set('customer', input.method.customerRef);
    if (input.offSession) params.set('off_session', 'true');
    if (input.paymentId) params.set('metadata[payment_id]', input.paymentId);
    return stripe.request('POST', '/payment_intents', params, input.idempotencyKey);
  }

  return {
    name: 'stripe',

    async charge(input): Promise<ChargeResult> {
      try {
        const intent = await createIntent(input, 'automatic');
        const outcome = intentOutcome(intent);
        const providerRef = str(intent.id) ?? '';
        if (outcome.status === 'succeeded') return { status: 'succeeded', providerRef };
        if (outcome.status === 'requires_action') return { status: 'requires_action', providerRef };
        return { status: 'failed', providerRef, failureCode: outcome.failureCode ?? 'payment_declined' };
      } catch (error) {
        const intent = needsPerson(error);
        if (intent !== null) return { status: 'requires_action', providerRef: intent };
        return { status: 'failed', ...declined(error) };
      }
    },

    async authorize(input): Promise<AuthorizeResult> {
      try {
        const intent = await createIntent(input, 'manual');
        const outcome = intentOutcome(intent);
        const providerRef = str(intent.id) ?? '';
        if (outcome.status === 'authorized') return { status: 'authorized', providerRef };
        if (outcome.status === 'requires_action') return { status: 'requires_action', providerRef };
        return { status: 'failed', providerRef, failureCode: outcome.failureCode ?? 'payment_declined' };
      } catch (error) {
        const intent = needsPerson(error);
        if (intent !== null) return { status: 'requires_action', providerRef: intent };
        return { status: 'failed', ...declined(error) };
      }
    },

    async capture({ authorizationRef, amountCents, idempotencyKey }) {
      try {
        const intent = await stripe.request('POST', `/payment_intents/${encodeURIComponent(authorizationRef)}/capture`, new URLSearchParams({ amount_to_capture: String(amountCents) }), idempotencyKey);
        return intent.status === 'succeeded' ? { status: 'succeeded' } : { status: 'failed', failureCode: 'payment_declined' };
      } catch (error) {
        return { status: 'failed', failureCode: declined(error).failureCode };
      }
    },

    async cancelAuthorization({ authorizationRef }) {
      try {
        await stripe.request('POST', `/payment_intents/${encodeURIComponent(authorizationRef)}/cancel`, new URLSearchParams(), `cancel:${authorizationRef}`);
      } catch (error) {
        // Already canceled (or captured, which the caller rules out): nothing left to release.
        if (!(error instanceof StripeError && error.status === 400 && error.body.code === 'payment_intent_unexpected_state')) throw error;
      }
      return { status: 'canceled' };
    },

    async refund({ chargeRef, amountCents, idempotencyKey }) {
      const refund = await stripe.request('POST', '/refunds', new URLSearchParams({ payment_intent: chargeRef, amount: String(amountCents) }), idempotencyKey);
      // `pending` refunds go through (a later failure arrives by webhook); `failed` and `canceled` don't.
      return { status: refund.status === 'failed' || refund.status === 'canceled' ? 'failed' : 'succeeded', refundRef: str(refund.id) ?? '' };
    },

    async completeAction({ providerRef }) {
      // Stripe.js ran the bank's step in the browser; the intent says how it went (the outcome the dev flow
      // passes in is ignored).
      const intent = await stripe.request('GET', `/payment_intents/${encodeURIComponent(providerRef)}`);
      const outcome = intentOutcome(intent);
      if (outcome.status === 'succeeded' || outcome.status === 'authorized') return { status: 'succeeded' };
      return { status: 'failed', failureCode: outcome.failureCode ?? 'payment_declined' };
    },

    async prepareCard({ paymentMethodRef, customer }): Promise<PreparedCardResult> {
      const method = await stripe.request('GET', `/payment_methods/${encodeURIComponent(paymentMethodRef)}`);
      const card = (method.card ?? {}) as { brand?: unknown; last4?: unknown; exp_month?: unknown; exp_year?: unknown; fingerprint?: unknown };
      const brand = str(card.brand);
      if (method.type !== 'card' || !brand || !(CARD_BRANDS as readonly string[]).includes(brand)) return { ok: false, reason: 'not_supported' };
      const customerRef =
        customer.ref ??
        str(
          (
            await stripe.request(
              'POST',
              '/customers',
              new URLSearchParams({ email: customer.email, name: customer.name, 'metadata[user_id]': customer.userId }),
              `customer:${customer.userId}`,
            )
          ).id,
        )!;
      const attachedTo = str(method.customer);
      if (attachedTo && attachedTo !== customerRef) return { ok: false, reason: 'not_supported', customerRef };
      if (!attachedTo) {
        try {
          await stripe.request('POST', `/payment_methods/${encodeURIComponent(paymentMethodRef)}/attach`, new URLSearchParams({ customer: customerRef }), `attach:${paymentMethodRef}`);
        } catch (error) {
          // Stripe attaches no card its bank declines (a decline, no funds): the codes of a declined charge, not an error
          // (Stripe test-mode check: it threw out of booking, tipping, changes and adding a card).
          if (error instanceof StripeError && error.status === 402 && error.body.type === 'card_error') return { ok: false, reason: 'declined', failureCode: failureCodeOf(error.body), customerRef };
          throw error;
        }
      }
      const collected: CollectedCard = {
        providerRef: paymentMethodRef,
        brand: brand as CardBrand,
        last4: str(card.last4) ?? '',
        expMonth: typeof card.exp_month === 'number' ? card.exp_month : 0,
        expYear: typeof card.exp_year === 'number' ? card.exp_year : 0,
        ...(str(card.fingerprint) ? { fingerprint: str(card.fingerprint)! } : {}),
      };
      return { ok: true, card: collected, customerRef };
    },

    async detachCard(methodRef) {
      try {
        await stripe.request('POST', `/payment_methods/${encodeURIComponent(methodRef)}/detach`, new URLSearchParams(), `detach:${methodRef}`);
      } catch (error) {
        // Already detached: nothing to do.
        if (!(error instanceof StripeError && error.status === 400)) throw error;
      }
    },

    async forgetCustomer(customerRef) {
      try {
        await stripe.request('DELETE', `/customers/${encodeURIComponent(customerRef)}`);
      } catch (error) {
        // Already gone.
        if (!(error instanceof StripeError && error.status === 404)) throw error;
      }
    },

    async clientSecretOf(intentRef) {
      const intent = await stripe.request('GET', `/payment_intents/${encodeURIComponent(intentRef)}`);
      return str(intent.client_secret) ?? null;
    },
  };
}
