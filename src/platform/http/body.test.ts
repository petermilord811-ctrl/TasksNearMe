import { describe, expect, it } from 'vitest';
import { readTextUpTo, WEBHOOK_MAX_BYTES } from './body';

/** A body that arrives in pieces and says nothing of its length, as a chunked upload does. */
function streamed(parts: string[]): Request {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part));
      controller.close();
    },
  });
  return new Request('http://localhost/api/webhooks/test', { method: 'POST', body, duplex: 'half' } as RequestInit);
}

describe('reading a body up to a limit', () => {
  it('reads what fits, in UTF-8', async () => {
    expect(await readTextUpTo(new Request('http://localhost/', { method: 'POST', body: '{"type":"café"}' }), 100)).toBe('{"type":"café"}');
    expect(await readTextUpTo(streamed(['{"a":', '1}']), 100)).toBe('{"a":1}');
    expect(await readTextUpTo(new Request('http://localhost/', { method: 'POST' }), 100)).toBe('');
  });

  it('refuses a body that says it is too large, or turns out to be', async () => {
    const declared = new Request('http://localhost/', { method: 'POST', body: 'x', headers: { 'content-length': String(WEBHOOK_MAX_BYTES + 1) } });
    expect(await readTextUpTo(declared, WEBHOOK_MAX_BYTES)).toBeNull();
    expect(await readTextUpTo(streamed(['x'.repeat(60), 'y'.repeat(60)]), 100)).toBeNull();
  });
});
