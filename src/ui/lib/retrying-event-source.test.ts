import { afterEach, describe, expect, it, vi } from 'vitest';
import { FIRST_RETRY_MS, MAX_RETRY_MS, retryingEventSource } from './retrying-event-source';

/** The browser's EventSource as far as this needs it: it reconnects by itself, or gives up (CLOSED). */
class FakeSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  static made: FakeSource[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(readonly url: string) {
    FakeSource.made.push(this);
  }
  addEventListener() {}
  close() {
    this.closed = true;
    this.readyState = FakeSource.CLOSED;
  }
  opened() {
    this.readyState = FakeSource.OPEN;
    this.onopen?.();
  }
  /** A dropped connection: the browser tries again by itself. */
  dropped() {
    this.readyState = FakeSource.CONNECTING;
    this.onerror?.();
  }
  /** A refused or failed answer (a 429, the 502 of a restart): the browser gives up. */
  refused() {
    this.readyState = FakeSource.CLOSED;
    this.onerror?.();
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  FakeSource.made = [];
});

describe('retryingEventSource (when things break, 2026-11-21)', () => {
  it('opens again after the browser gives up: 10 s, doubling to a minute, from the start once a stream opens', () => {
    vi.useFakeTimers();
    vi.stubGlobal('EventSource', FakeSource);
    const made = FakeSource.made;
    const connected: boolean[] = [];
    const setup = vi.fn();
    const stream = retryingEventSource('/api/realtime/market/gainesville', setup, (value) => connected.push(value));
    expect(made).toHaveLength(1);
    expect(setup).toHaveBeenCalledWith(made[0]);
    made[0]!.opened();
    // The browser's own reconnect: nothing to do.
    made[0]!.dropped();
    vi.advanceTimersByTime(MAX_RETRY_MS);
    expect(made).toHaveLength(1);

    made[0]!.refused();
    vi.advanceTimersByTime(FIRST_RETRY_MS - 1);
    expect(made).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(made).toHaveLength(2);
    expect(setup).toHaveBeenLastCalledWith(made[1]);
    for (const [index, wait] of [[1, 2 * FIRST_RETRY_MS], [2, 4 * FIRST_RETRY_MS], [3, MAX_RETRY_MS], [4, MAX_RETRY_MS]] as const) {
      made[index]!.refused();
      vi.advanceTimersByTime(wait - 1);
      expect(made).toHaveLength(index + 1);
      vi.advanceTimersByTime(1);
      expect(made).toHaveLength(index + 2);
    }
    // Open again: the next wait is 10 s.
    made[5]!.opened();
    made[5]!.refused();
    vi.advanceTimersByTime(FIRST_RETRY_MS);
    expect(made).toHaveLength(7);
    expect(connected).toContain(true);

    stream.close();
    vi.advanceTimersByTime(10 * MAX_RETRY_MS);
    expect(made).toHaveLength(7);
    expect(made[6]!.closed).toBe(true);
    expect(connected.at(-1)).toBe(false);
  });

  it('closed while waiting to open again: stays closed', () => {
    vi.useFakeTimers();
    vi.stubGlobal('EventSource', FakeSource);
    const stream = retryingEventSource('/api/realtime/market/gainesville', () => {});
    FakeSource.made[0]!.refused();
    stream.close();
    vi.advanceTimersByTime(MAX_RETRY_MS);
    expect(FakeSource.made).toHaveLength(1);
  });
});
