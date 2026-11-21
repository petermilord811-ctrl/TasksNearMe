import { describe, expect, it, vi } from 'vitest';
import { createStripeBilling } from './stripe-billing';

/** A Stripe that answers each call with the next status in line, and records what it was asked. */
function stripeAnswering(...statuses: number[]) {
  const calls: { method: string; url: string }[] = [];
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ method: init?.method ?? 'GET', url: String(url) });
    const status = statuses.shift() ?? 200;
    return new Response(JSON.stringify(status === 200 ? { id: 'cus_x', deleted: true } : { error: { type: 'invalid_request_error' } }), { status, headers: { 'content-type': 'application/json' } });
  });
  return { calls, billing: createStripeBilling({ secretKey: 'sk_test_x', fetch: fetch as unknown as typeof globalThis.fetch }) };
}

describe("the plans' Stripe customer of a deleted account (privacy rehearsal J-PR9)", () => {
  it('is deleted at Stripe', async () => {
    const { calls, billing } = stripeAnswering(200);
    await billing.forgetCustomer!('cus_pr_1');
    expect(calls).toEqual([{ method: 'DELETE', url: 'https://api.stripe.com/v1/customers/cus_pr_1' }]);
  });

  it('is fine when it was already gone, and fails on anything else, for the next run to try again', async () => {
    await expect(stripeAnswering(404).billing.forgetCustomer!('cus_gone')).resolves.toBeUndefined();
    await expect(stripeAnswering(500).billing.forgetCustomer!('cus_pr_1')).rejects.toThrow('Stripe answered 500');
  });
});
