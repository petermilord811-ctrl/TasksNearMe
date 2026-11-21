/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskMapPin, TaskPublicView } from '@/contracts';
import { austinMapPins, deskPublicTask } from '@/fixtures';
import { useLiveTasks } from './live';

/** A stand-in for the browser's EventSource: the test opens it and sends events. */
class FakeEventSource {
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static last: FakeEventSource | null = null;
  closed = false;
  readyState = 0;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private listeners = new Map<string, ((event: MessageEvent<string>) => void)[]>();
  constructor(readonly url: string) {
    FakeEventSource.last = this;
  }
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  close() {
    this.closed = true;
  }
  send(type: string, data: unknown) {
    for (const listener of this.listeners.get(type) ?? []) listener(new MessageEvent(type, { data: JSON.stringify(data) }));
  }
  /** The server refused or failed the stream (a 429, or a 502 while it restarts): the browser gives up on it. */
  refuse() {
    this.readyState = FakeEventSource.CLOSED;
    this.onerror?.();
  }
}

const initial: TaskMapPin[] = austinMapPins.slice(0, 3);
const posted = (id: string, change: Partial<TaskPublicView> = {}): TaskPublicView => ({ ...deskPublicTask, id, status: 'open', ...change });

beforeEach(() => {
  FakeEventSource.last = null;
  vi.stubGlobal('EventSource', FakeEventSource);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the landing map, live', () => {
  it('listens to the market’s public stream only once the map is up', () => {
    const { rerender } = renderHook((enabled: boolean) => useLiveTasks(initial, 'gainesville', { enabled, reduced: false }), { initialProps: false });
    expect(FakeEventSource.last).toBeNull();
    rerender(true);
    expect(FakeEventSource.last?.url).toBe('/api/realtime/market/gainesville');
  });

  it('puts a newly posted task first, drops it in, pulses and notes it', () => {
    const { result } = renderHook(() => useLiveTasks(initial, 'gainesville', { enabled: true, reduced: false }));
    act(() => FakeEventSource.last!.send('task', posted('tsk_new')));
    expect(result.current.pins.map((pin) => pin.id)).toEqual(['tsk_new', ...initial.map((pin) => pin.id)]);
    expect(result.current.pins[0]!.point).toEqual(deskPublicTask.location.kind === 'local' ? deskPublicTask.location.publicPoint : null);
    expect(result.current.arrivals.has('tsk_new')).toBe(true);
    expect(result.current.pulses.map((pulse) => pulse.kind)).toEqual(['new']);
    expect(result.current.latest?.id).toBe('tsk_new');
    // The same task again (another server's copy) changes nothing.
    act(() => FakeEventSource.last!.send('task', posted('tsk_new')));
    expect(result.current.pins.filter((pin) => pin.id === 'tsk_new')).toHaveLength(1);
    // The drop, the pulse and the note each end on their own.
    act(() => vi.advanceTimersByTime(9_100));
    expect(result.current.arrivals.size).toBe(0);
    expect(result.current.pulses).toEqual([]);
    expect(result.current.latest).toBeNull();
  });

  it('ignores remote tasks and anything that isn’t open', () => {
    const { result } = renderHook(() => useLiveTasks(initial, 'gainesville', { enabled: true, reduced: false }));
    act(() => FakeEventSource.last!.send('task', posted('tsk_remote', { location: { kind: 'remote' } })));
    act(() => FakeEventSource.last!.send('task', posted('tsk_booked', { status: 'assigned' })));
    act(() => FakeEventSource.last!.send('task', 'not a task'));
    expect(result.current.pins).toHaveLength(initial.length);
  });

  it('counts a new offer with a pulse, and lets a booked task go after its pulse', () => {
    const { result } = renderHook(() => useLiveTasks(initial, 'gainesville', { enabled: true, reduced: false }));
    const first = initial[0]!;
    act(() => FakeEventSource.last!.send('task-state', { id: first.id, offerCount: first.offerCount + 1, state: 'open', readAt: new Date().toISOString() }));
    expect(result.current.pins[0]!.offerCount).toBe(first.offerCount + 1);
    expect(result.current.pulses.at(-1)?.kind).toBe('offer');
    act(() => FakeEventSource.last!.send('task-state', { id: first.id, offerCount: 0, state: 'booked', readAt: new Date().toISOString() }));
    expect(result.current.pulses.at(-1)?.kind).toBe('booked');
    expect(result.current.pins.some((pin) => pin.id === first.id)).toBe(true);
    act(() => vi.advanceTimersByTime(1_500));
    expect(result.current.pins.some((pin) => pin.id === first.id)).toBe(false);
    // A task the map doesn't have is no news.
    act(() => FakeEventSource.last!.send('task-state', { id: 'tsk_elsewhere', offerCount: 2, state: 'open', readAt: new Date().toISOString() }));
    expect(result.current.pins).toHaveLength(initial.length - 1);
  });

  it('with reduced motion: no drops and no pulses, the tasks still change', () => {
    const { result } = renderHook(() => useLiveTasks(initial, 'gainesville', { enabled: true, reduced: true }));
    act(() => FakeEventSource.last!.send('task', posted('tsk_calm')));
    expect(result.current.pins[0]!.id).toBe('tsk_calm');
    expect(result.current.arrivals.size).toBe(0);
    expect(result.current.pulses).toEqual([]);
    expect(result.current.latest?.id).toBe('tsk_calm');
  });

  it('opens the stream again after it’s refused (a deploy’s restart), and listens on the new one', () => {
    const { result } = renderHook(() => useLiveTasks(initial, 'gainesville', { enabled: true, reduced: false }));
    const refused = FakeEventSource.last!;
    act(() => refused.refuse());
    act(() => vi.advanceTimersByTime(10_000));
    const reopened = FakeEventSource.last!;
    expect(reopened).not.toBe(refused);
    expect(reopened.url).toBe('/api/realtime/market/gainesville');
    act(() => reopened.send('task', posted('tsk_after_restart')));
    expect(result.current.pins[0]!.id).toBe('tsk_after_restart');
  });

  it('closes its stream when the map goes', () => {
    const { unmount } = renderHook(() => useLiveTasks(initial, 'gainesville', { enabled: true, reduced: false }));
    const source = FakeEventSource.last!;
    unmount();
    expect(source.closed).toBe(true);
  });
});
