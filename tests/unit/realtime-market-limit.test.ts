import { describe, expect, it, vi } from 'vitest';

/**
 * The public market stream (completion plan 7.6) holds at most 20 open streams per client address, an IPv6 one by its
 * /64 (security review SEC23): one visitor can't take the server's whole allowance. A closed stream frees its place.
 */
vi.hoisted(() => {
  process.env.FIELD_ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString('base64');
  process.env.BETTER_AUTH_SECRET ||= 'test-secret-for-the-stream-limit';
});
const visitor = vi.hoisted(() => ({ address: '203.0.113.9' }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: 'tasksnearme.com', 'x-forwarded-for': visitor.address }),
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false }),
}));
vi.mock('@/platform/db/client', () => ({ db: {} }));
vi.mock('@/modules/markets/queries', () => ({ findPublicMarket: async () => ({ id: 'mkt_gainesville' }) }));
vi.mock('@/platform/realtime/listener', () => ({ realtimeHub: () => ({ count: () => 0, subscribe: () => () => undefined }) }));

const { GET } = await import('@/app/api/realtime/market/[slug]/route');
const open = (signal?: AbortSignal) =>
  GET(new Request('http://localhost/api/realtime/market/gainesville', signal ? { signal } : {}), { params: Promise.resolve({ slug: 'gainesville' }) });

describe('the public market stream', () => {
  it('holds 20 streams per address, frees a place when one closes, and counts each address apart', async () => {
    const streams = Array.from({ length: 20 }, () => new AbortController());
    for (const stream of streams) expect((await open(stream.signal)).status).toBe(200);
    expect((await open()).status).toBe(429);
    streams[0]!.abort();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect((await open(new AbortController().signal)).status).toBe(200);
    // Another address of the same /64 is the same visitor; another network isn't.
    visitor.address = '2001:db8:1:2::5';
    for (let i = 0; i < 20; i += 1) expect((await open(new AbortController().signal)).status).toBe(200);
    visitor.address = '2001:db8:1:2::77';
    expect((await open()).status).toBe(429);
    visitor.address = '2001:db8:1:3::5';
    expect((await open(new AbortController().signal)).status).toBe(200);
  });
});
