import type { GiftCardOrder, GiftCardOrderResult, GiftCardProvider } from './index';

/**
 * Tremendous (blueprint 05: rewards as gift cards; docs/integration-points.md), written against its REST API
 * without the SDK. One order per grant: the grant id is the order's `external_id`, which Tremendous makes
 * idempotent (the same id returns the first order), delivered as a LINK the helper opens to choose a card
 * from the campaign's catalog. Sandbox keys (`TEST_…`) use testflight.tremendous.com.
 */

export interface TremendousConfig {
  apiKey: string;
  /** The campaign (catalog, branding and message) set up in Tremendous. */
  campaignId: string;
  /** Where the money comes from; `BALANCE` is the prepaid balance. */
  fundingSourceId?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

export function createTremendousGiftCards(config: TremendousConfig): GiftCardProvider {
  const doFetch = config.fetch ?? fetch;
  const baseUrl = (config.baseUrl ?? (config.apiKey.startsWith('TEST_') ? 'https://testflight.tremendous.com/api/v2' : 'https://www.tremendous.com/api/v2')).replace(/\/$/, '');
  return {
    async order(input: GiftCardOrder): Promise<GiftCardOrderResult> {
      const response = await doFetch(`${baseUrl}/orders`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          external_id: input.externalId,
          payment: { funding_source_id: config.fundingSourceId ?? 'BALANCE' },
          reward: {
            campaign_id: config.campaignId,
            value: { denomination: input.amountCents / 100, currency_code: 'USD' },
            delivery: { method: 'LINK' },
            ...(input.recipient ? { recipient: { name: input.recipient.name, email: input.recipient.email } } : {}),
          },
        }),
        signal: AbortSignal.timeout(30_000),
      });
      // A refusal (funding, the campaign, a duplicate in another state): the grant fails and staff can retry it.
      if (!response.ok) return { ok: false, reason: 'failed' };
      const body = (await response.json().catch(() => ({}))) as { order?: { id?: unknown; rewards?: { delivery?: { link?: unknown } }[] } };
      const orderId = typeof body.order?.id === 'string' ? body.order.id : null;
      const link = body.order?.rewards?.[0]?.delivery?.link;
      // An order waiting for approval in Tremendous has no link yet: it fails here, and is retried after approval.
      return orderId && typeof link === 'string' ? { ok: true, orderId, deliveryUrl: link } : { ok: false, reason: 'failed' };
    },
  };
}

export function tremendousFromEnv(env: Record<string, string | undefined> = process.env): GiftCardProvider | null {
  const apiKey = env.TREMENDOUS_API_KEY?.trim();
  if (!apiKey) return null;
  const campaignId = env.TREMENDOUS_CAMPAIGN_ID?.trim();
  if (!campaignId) throw new Error('TREMENDOUS_API_KEY is set: also set TREMENDOUS_CAMPAIGN_ID (the campaign with the gift card catalog).');
  return createTremendousGiftCards({
    apiKey,
    campaignId,
    ...(env.TREMENDOUS_FUNDING_SOURCE_ID?.trim() ? { fundingSourceId: env.TREMENDOUS_FUNDING_SOURCE_ID.trim() } : {}),
    ...(env.TREMENDOUS_API_URL?.trim() ? { baseUrl: env.TREMENDOUS_API_URL.trim() } : {}),
  });
}
