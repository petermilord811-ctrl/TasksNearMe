/**
 * A server-sent events response (completion plan 7.1). The browser's EventSource reconnects on its own, so a
 * stream ends after `lifetimeMs` (15 minutes by default) and the reconnection checks the session again; a comment
 * every 25 s keeps proxies from closing a quiet stream. `open` subscribes and returns its own cleanup, which runs
 * once whether the visitor leaves, the stream times out, or the server closes it.
 */
export interface SseOut {
  /** One event: `event` names it (absent: the default `message` event), `data` is sent as JSON. */
  send(event: string | null, data: unknown): void;
  close(): void;
}

const encoder = new TextEncoder();

/**
 * Every stream open on this server, so a stopping server can end them (d8, 2026-11-24: each deploy answered 502 for
 * 90 s, the time systemd gives a server to stop, because Next's production server waits for every open connection,
 * and a stream lasts 15 minutes; landing visitors hold one too). On globalThis: instrumentation and the route handlers
 * can be bundled with their own copies of this module.
 */
const OPEN_STREAMS = Symbol.for('tasksnearme.sse.open');

function openStreams(): Set<() => void> {
  const holder = globalThis as typeof globalThis & { [OPEN_STREAMS]?: Set<() => void> };
  return (holder[OPEN_STREAMS] ??= new Set());
}

/**
 * Ends every open stream on this server (instrumentation, on SIGTERM). Each runs its cleanup, its connection closes
 * (SSE_HEADERS), so the server stops at once, and each browser's EventSource reconnects to the server that follows.
 * Returns how many it ended.
 */
export function endOpenStreams(): number {
  const streams = [...openStreams()];
  for (const end of streams) end();
  return streams.length;
}

export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-store, no-transform',
  // The connection closes with its stream: a stopping server would otherwise wait out the proxy's idle keep-alive
  // before it can exit. EventSource opens a new connection to reconnect anyway.
  Connection: 'close',
  // nginx and similar proxies must not buffer the stream (Caddy flushes event streams on its own).
  'X-Accel-Buffering': 'no',
  'X-Content-Type-Options': 'nosniff',
} as const;

export function sseResponse(signal: AbortSignal, open: (out: SseOut) => () => void, options: { lifetimeMs?: number; pingMs?: number; retryMs?: number } = {}): Response {
  let closed = false;
  let cleanup: (() => void) | null = null;
  let pinger: ReturnType<typeof setInterval> | null = null;
  let ender: ReturnType<typeof setTimeout> | null = null;
  let finish: () => void = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          finish();
        }
      };
      const end = () => {
        if (closed) return;
        closed = true;
        openStreams().delete(end);
        if (pinger) clearInterval(pinger);
        if (ender) clearTimeout(ender);
        try {
          cleanup?.();
        } catch (error) {
          console.error('[realtime] stream cleanup failed', error);
        }
        try {
          controller.close();
        } catch {
          // Already closed by the runtime.
        }
      };
      finish = end;
      openStreams().add(end);
      const out: SseOut = {
        send: (event, data) => write(`${event ? `event: ${event}\n` : ''}data: ${JSON.stringify(data)}\n\n`),
        close: () => finish(),
      };
      write(`retry: ${options.retryMs ?? 3000}\n\n`);
      pinger = setInterval(() => write(': ping\n\n'), options.pingMs ?? 25_000);
      ender = setTimeout(() => finish(), options.lifetimeMs ?? 15 * 60_000);
      signal.addEventListener('abort', () => finish(), { once: true });
      cleanup = open(out);
      out.send('ready', {});
    },
    cancel() {
      finish();
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}
