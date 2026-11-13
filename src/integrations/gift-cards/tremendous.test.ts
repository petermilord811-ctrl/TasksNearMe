import { describe, expect, it, vi } from 'vitest';
import { createGiftCardProvider } from './index';
import { createTremendousGiftCards, tremendousFromEnv } from './tremendous';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('Tremendous gift cards', () => {
  it('orders one gift card per grant, as a link from the campaign, in the sandbox for test keys', async () => {
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => json({ order: { id: 'ORD123', status: 'EXECUTED', rewards: [{ id: 'RW1', delivery: { method: 'LINK', status: 'SUCCEEDED', link: 'https://testflight.tremendous.com/rewards/payout/abc' } }] } }, 201));
    const cards = createTremendousGiftCards({ apiKey: 'TEST_key', campaignId: 'CAMP1', fetch: fetcher as unknown as typeof fetch });
    expect(await cards.order({ externalId: 'rwg_1', amountCents: 5000, recipient: { name: 'Priya Shah', email: 'priya@example.test' } })).toEqual({ ok: true, orderId: 'ORD123', deliveryUrl: 'https://testflight.tremendous.com/rewards/payout/abc' });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('https://testflight.tremendous.com/api/v2/orders');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer TEST_key' });
    expect(JSON.parse(String(init?.body))).toEqual({
      external_id: 'rwg_1',
      payment: { funding_source_id: 'BALANCE' },
      reward: { campaign_id: 'CAMP1', value: { denomination: 50, currency_code: 'USD' }, delivery: { method: 'LINK' }, recipient: { name: 'Priya Shah', email: 'priya@example.test' } },
    });
  });

  it('fails a refused order, and one still waiting for approval (no link yet), so staff can retry it', async () => {
    const refused = createTremendousGiftCards({ apiKey: 'PROD_key', campaignId: 'C', fetch: (async () => json({ errors: { message: 'Insufficient funds' } }, 402)) as unknown as typeof fetch });
    expect(await refused.order({ externalId: 'rwg_2', amountCents: 5000 })).toEqual({ ok: false, reason: 'failed' });
    const pending = createTremendousGiftCards({ apiKey: 'PROD_key', campaignId: 'C', fetch: (async () => json({ order: { id: 'ORD9', status: 'PENDING APPROVAL', rewards: [{ delivery: { method: 'LINK', status: 'PENDING' } }] } }, 201)) as unknown as typeof fetch });
    expect(await pending.order({ externalId: 'rwg_3', amountCents: 5000 })).toEqual({ ok: false, reason: 'failed' });
  });

  it('uses the production API for production keys, and needs a campaign', async () => {
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => json({}, 500));
    await createTremendousGiftCards({ apiKey: 'PROD_key', campaignId: 'C', fetch: fetcher as unknown as typeof fetch }).order({ externalId: 'x', amountCents: 100 });
    expect(fetcher.mock.calls[0]![0]).toBe('https://www.tremendous.com/api/v2/orders');
    expect(tremendousFromEnv({})).toBeNull();
    expect(() => tremendousFromEnv({ TREMENDOUS_API_KEY: 'TEST_k' })).toThrow(/TREMENDOUS_CAMPAIGN_ID/);
    expect(createGiftCardProvider({ TREMENDOUS_API_KEY: 'TEST_k', TREMENDOUS_CAMPAIGN_ID: 'C' })).not.toBeNull();
    expect(createGiftCardProvider({ NODE_ENV: 'production' })).toBeNull();
  });
});
