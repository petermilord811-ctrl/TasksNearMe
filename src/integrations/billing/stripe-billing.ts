import { createStripeClient, type StripeClient } from '@/integrations/payments/stripe';
import type { BillingProvider, BillingSubscription } from './index';

/**
 * Stripe Billing over the REST API (no SDK), like the payments integration:
 * - Checkout in `subscription` mode with one inline recurring price (`price_data`), so prices come from the market
 *   policy and nothing is created in the dashboard first. The subscription carries `userId`, `plan`, `interval` and
 *   `marketId` in its metadata, which is how its events are matched to the person.
 * - The customer portal, with the app's own configuration (made once, found again by its metadata): cancel at the end
 *   of the period, change the card, see invoices. No plan switching there.
 * - `current_period_end` is read from the subscription, or from its item in API versions that moved it there.
 */

type StripeObject = Record<string, unknown>;

const str = (value: unknown) => (typeof value === 'string' ? value : undefined);
const num = (value: unknown) => (typeof value === 'number' ? value : undefined);
const obj = (value: unknown) => (value && typeof value === 'object' ? (value as StripeObject) : {});

export function subscriptionFromStripe(sub: StripeObject): BillingSubscription {
  const item = obj((obj(sub.items).data as unknown[] | undefined)?.[0]);
  const price = obj(item.price);
  const periodEnd = num(sub.current_period_end) ?? num(item.current_period_end) ?? 0;
  const interval = str(obj(price.recurring).interval);
  const metadata = Object.fromEntries(Object.entries(obj(sub.metadata)).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  const customer = sub.customer;
  return {
    id: str(sub.id) ?? '',
    customerId: str(customer) ?? str(obj(customer).id) ?? '',
    status: str(sub.status) ?? 'incomplete',
    currentPeriodEnd: new Date(periodEnd * 1000),
    cancelAtPeriodEnd: sub.cancel_at_period_end === true || num(sub.cancel_at) !== undefined,
    endedAt: num(sub.ended_at) ? new Date(num(sub.ended_at)! * 1000) : null,
    interval: interval === 'month' || interval === 'year' ? interval : null,
    unitAmountCents: num(price.unit_amount) ?? null,
    metadata,
  };
}

const PORTAL_TAG = 'tasksnearme-plans';

export function createStripeBilling(config: { secretKey: string; fetch?: typeof fetch }): BillingProvider {
  const stripe: StripeClient = createStripeClient(config);
  let portalConfiguration: string | undefined;

  async function portalConfigurationId(): Promise<string> {
    if (portalConfiguration) return portalConfiguration;
    const list = await stripe.request('GET', '/billing_portal/configurations', new URLSearchParams({ active: 'true', limit: '100' }));
    const found = ((list.data as StripeObject[] | undefined) ?? []).find((entry) => obj(entry.metadata).app === PORTAL_TAG);
    if (found && str(found.id)) return (portalConfiguration = str(found.id)!);
    const created = await stripe.request(
      'POST',
      '/billing_portal/configurations',
      new URLSearchParams({
        'metadata[app]': PORTAL_TAG,
        'business_profile[headline]': 'TasksNearMe plans',
        'features[subscription_cancel][enabled]': 'true',
        'features[subscription_cancel][mode]': 'at_period_end',
        'features[payment_method_update][enabled]': 'true',
        'features[invoice_history][enabled]': 'true',
      }),
      `billing-portal-config:${PORTAL_TAG}`,
    );
    return (portalConfiguration = str(created.id)!);
  }

  return {
    name: 'stripe',
    async createCustomer({ userId, email, name }) {
      const customer = await stripe.request('POST', '/customers', new URLSearchParams({ email, name, 'metadata[userId]': userId }), `billing-customer:${userId}`);
      return { customerId: str(customer.id)! };
    },
    async createCheckout(input) {
      const meta = { userId: input.userId, plan: input.plan, interval: input.interval, marketId: input.marketId };
      const params = new URLSearchParams({
        mode: 'subscription',
        customer: input.customerId,
        client_reference_id: input.userId,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][unit_amount]': String(input.priceCents),
        'line_items[0][price_data][recurring][interval]': input.interval,
        'line_items[0][price_data][product_data][name]': input.productName,
      });
      for (const [key, value] of Object.entries(meta)) {
        params.set(`metadata[${key}]`, value);
        params.set(`subscription_data[metadata][${key}]`, value);
      }
      const session = await stripe.request('POST', '/checkout/sessions', params, input.idempotencyKey);
      return { url: str(session.url)!, sessionId: str(session.id)! };
    },
    async createPortal({ customerId, returnUrl, idempotencyKey }) {
      const session = await stripe.request('POST', '/billing_portal/sessions', new URLSearchParams({ customer: customerId, return_url: returnUrl, configuration: await portalConfigurationId() }), idempotencyKey);
      return { url: str(session.url)! };
    },
    async listSubscriptions(customerId) {
      const list = await stripe.request('GET', '/subscriptions', new URLSearchParams({ customer: customerId, status: 'all', limit: '100' }));
      return ((list.data as StripeObject[] | undefined) ?? []).map(subscriptionFromStripe);
    },
    async cancelAtPeriodEnd(subscriptionId) {
      await stripe.request('POST', `/subscriptions/${encodeURIComponent(subscriptionId)}`, new URLSearchParams({ cancel_at_period_end: 'true' }), `cancel-at-period-end:${subscriptionId}`);
    },
    async getSubscription(subscriptionId) {
      return subscriptionFromStripe(await stripe.request('GET', `/subscriptions/${encodeURIComponent(subscriptionId)}`));
    },
    async cancelNow(subscriptionId) {
      await stripe.request('DELETE', `/subscriptions/${encodeURIComponent(subscriptionId)}`);
    },
  };
}
