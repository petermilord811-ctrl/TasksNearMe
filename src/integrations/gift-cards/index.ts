/**
 * Gift cards for rewards (blueprint 05: Tremendous, LINK delivery). Until Tremendous is connected, a
 * development stand-in delivers every order at once to a page under `/dev/gift-cards` (404 in
 * production). Orders carry the grant id as `externalId`, so retrying never issues twice.
 */

export interface GiftCardOrder {
  externalId: string;
  amountCents: number;
}

export type GiftCardOrderResult = { ok: true; orderId: string; deliveryUrl: string } | { ok: false; reason: 'failed' };

export interface GiftCardProvider {
  order(input: GiftCardOrder): Promise<GiftCardOrderResult>;
}

export function createDevGiftCardProvider(): GiftCardProvider {
  return {
    async order({ externalId }) {
      return { ok: true, orderId: `gco_${externalId}`, deliveryUrl: `/dev/gift-cards/${encodeURIComponent(externalId)}` };
    },
  };
}

export function createGiftCardProvider(): GiftCardProvider | null {
  if (process.env.TREMENDOUS_API_KEY) {
    // TODO(integration): Tremendous adapter (Phase 10). Refuse to fake gift cards when real keys are set.
    throw new Error('TREMENDOUS_API_KEY is set but the Tremendous adapter is not implemented yet.');
  }
  return process.env.NODE_ENV === 'production' ? null : createDevGiftCardProvider();
}
