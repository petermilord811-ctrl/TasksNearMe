import { describe, expect, it, vi } from 'vitest';
import { WEBHOOK_MAX_BYTES } from '@/platform/http/body';

// Modules read these when they load; test values only. No database: a body over the limit is refused before the
// inbox is looked at.
vi.hoisted(() => {
  process.env.FIELD_ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString('base64');
  process.env.BETTER_AUTH_SECRET ||= 'test-secret-for-the-webhook-limit';
});
vi.mock('@/platform/db/client', () => ({ db: {} }));

const { POST: stripe } = await import('@/app/api/webhooks/stripe/route');
const { POST: resend } = await import('@/app/api/webhooks/resend/route');
const { POST: persona } = await import('@/app/api/webhooks/persona/route');
const { POST: checkr } = await import('@/app/api/webhooks/checkr/route');

/** A body sent in pieces with no length given, as a chunked upload is. */
function huge(): Request {
  const piece = new TextEncoder().encode('x'.repeat(WEBHOOK_MAX_BYTES / 2));
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < 3; i += 1) controller.enqueue(piece);
      controller.close();
    },
  });
  return new Request('http://localhost/api/webhooks/test', { method: 'POST', body, duplex: 'half' } as RequestInit);
}

describe('webhook endpoints (sweep 2026-11-20, security review)', () => {
  it('answer 413 to a body over the limit, before its signature or the endpoint is looked at', async () => {
    for (const post of [stripe, resend, persona, checkr]) expect((await post(huge())).status).toBe(413);
  });
});
