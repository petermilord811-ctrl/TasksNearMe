import { tremendousFromEnv } from './tremendous';

/**
 * Gift cards for rewards (blueprint 05: Tremendous, LINK delivery). Until Tremendous is connected, a
 * development stand-in delivers every order at once to a page under `/dev/gift-cards` (404 in
 * production). Orders carry the grant id as `externalId`, so retrying never issues twice.
 */

export interface GiftCardOrder {
  externalId: string;
  amountCents: number;
  /** Who it's for (the provider's page greets them by name). */
  recipient?: { name: string; email: string };
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

/** Tremendous with its key (`./tremendous.ts`); the stand-in otherwise, outside production. */
export function createGiftCardProvider(env: Record<string, string | undefined> = process.env): GiftCardProvider | null {
  const tremendous = tremendousFromEnv(env);
  if (tremendous) return tremendous;
  return env.NODE_ENV === 'production' ? null : createDevGiftCardProvider();
}
