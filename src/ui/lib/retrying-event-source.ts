/** The first wait after the browser gives up on a stream, doubling up to `MAX_RETRY_MS`. */
export const FIRST_RETRY_MS = 10_000;
export const MAX_RETRY_MS = 60_000;

/**
 * A stream of server-sent events that opens again after the browser gives up on it (when things break, 2026-11-21).
 * The browser reconnects by itself after a dropped connection, but not after a refused or failed response: a 429 (too
 * many streams), a 503, or the 502 a proxy answers while the server restarts for a deploy. The stream then stays
 * closed and the page quietly stops being live. Here it's opened again 10 s later, doubling to a minute, and the wait
 * starts over once a stream opens. `setup` adds the listeners to each new stream; `onConnected` hears whether it's open.
 */
export function retryingEventSource(url: string, setup: (source: EventSource) => void, onConnected?: (connected: boolean) => void): { close: () => void } {
  let source: EventSource | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let delay = FIRST_RETRY_MS;
  let closed = false;
  const open = () => {
    if (closed || typeof EventSource === 'undefined') return;
    const current = new EventSource(url);
    source = current;
    current.onopen = () => {
      delay = FIRST_RETRY_MS;
      onConnected?.(true);
    };
    current.onerror = () => {
      onConnected?.(current.readyState === EventSource.OPEN);
      if (closed || current.readyState !== EventSource.CLOSED) return;
      timer = setTimeout(open, delay);
      delay = Math.min(delay * 2, MAX_RETRY_MS);
    };
    setup(current);
  };
  open();
  return {
    close: () => {
      closed = true;
      clearTimeout(timer);
      source?.close();
      source = null;
      onConnected?.(false);
    },
  };
}
