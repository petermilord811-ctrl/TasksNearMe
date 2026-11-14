import { describe, expect, it, vi } from 'vitest';
import { sseResponse } from './sse';

async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, needle: string): Promise<string> {
  const decoder = new TextDecoder();
  let text = '';
  while (!text.includes(needle)) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value);
  }
  return text;
}

describe('server-sent event responses', () => {
  it('opens with a retry hint and a ready event, then sends events as JSON', async () => {
    const controller = new AbortController();
    let send: ((data: unknown) => void) | null = null;
    const response = sseResponse(controller.signal, (out) => {
      send = (data) => out.send(null, data);
      return () => {};
    });
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(response.headers.get('cache-control')).toContain('no-cache');
    const reader = response.body!.getReader();
    expect(await readUntil(reader, 'event: ready')).toMatch(/^retry: 3000\n\n/);
    send!({ type: 'message', thread: 'thr_1' });
    expect(await readUntil(reader, 'thr_1')).toContain('data: {"type":"message","thread":"thr_1"}\n\n');
    controller.abort();
  });

  it('runs the cleanup once, whether the visitor leaves or the stream reaches its lifetime', async () => {
    vi.useFakeTimers();
    try {
      const cleanup = vi.fn();
      const controller = new AbortController();
      sseResponse(controller.signal, () => cleanup, { lifetimeMs: 1000 });
      vi.advanceTimersByTime(1000);
      controller.abort();
      expect(cleanup).toHaveBeenCalledOnce();

      const left = vi.fn();
      const second = new AbortController();
      sseResponse(second.signal, () => left);
      second.abort();
      second.abort();
      expect(left).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
