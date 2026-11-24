/** @vitest-environment jsdom */
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RealtimeProvider, useRealtime } from './realtime';

const navigation = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));

/** The tab's stream, as a test drives it: the last one opened, with its message handler. */
class FakeEventSource {
  static CLOSED = 2;
  static last: FakeEventSource | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 1;
  constructor(readonly url: string) {
    FakeEventSource.last = this;
  }
  addEventListener() {}
  close() {
    this.readyState = FakeEventSource.CLOSED;
  }
}

const notice = (data: Record<string, string>) => act(() => FakeEventSource.last!.onmessage!({ data: JSON.stringify(data) } as MessageEvent<string>));

function Listener({ seen }: { seen: string[] }) {
  useRealtime('community', (event) => {
    seen.push(String(event.post));
    return true;
  });
  return null;
}

beforeEach(() => {
  FakeEventSource.last = null;
  vi.stubGlobal('EventSource', FakeEventSource);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useRealtime outside the provider (2026-11-23: route dialogs sit beside the signed-in app)', () => {
  it('hears the tab’s one stream, as a post’s dialog does in the root layout’s @modal slot', () => {
    const seen: string[] = [];
    render(<RealtimeProvider><p>The app</p></RealtimeProvider>);
    // A separate root, as the dialog's slot is beside the app rather than inside it.
    render(<Listener seen={seen} />);
    notice({ type: 'community', post: 'cpo_1' });
    expect(seen).toEqual(['cpo_1']);
  });

  it('hears nothing once the app’s provider is gone, and nothing without one (previews and tests)', () => {
    const seen: string[] = [];
    const app = render(<RealtimeProvider><p>The app</p></RealtimeProvider>);
    render(<Listener seen={seen} />);
    const stream = FakeEventSource.last!;
    app.unmount();
    act(() => stream.onmessage?.({ data: JSON.stringify({ type: 'community', post: 'cpo_2' }) } as MessageEvent<string>));
    expect(seen).toEqual([]);
  });
});

describe('refreshing on notices', () => {
  let visibility: DocumentVisibilityState = 'visible';
  const show = (next: DocumentVisibilityState) => {
    visibility = next;
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
  };
  beforeEach(() => {
    visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(document, 'visibilityState');
  });

  it('refreshes a visible page shortly after a notice', () => {
    render(<RealtimeProvider><p>The app</p></RealtimeProvider>);
    notice({ type: 'message', thread: 'thr_1' });
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(navigation.refresh).toHaveBeenCalledOnce();
  });

  // Sweep 2026-11-24 C2: a conversation's page reads it as read when it renders, so a refresh in a tab nobody looks at
  // marked the new message read (no push or email, and blue ticks for the sender).
  it('waits while the tab is hidden, and refreshes once when it is back', () => {
    render(<RealtimeProvider><p>The app</p></RealtimeProvider>);
    show('hidden');
    notice({ type: 'message', thread: 'thr_1' });
    notice({ type: 'read', thread: 'thr_1' });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(navigation.refresh).not.toHaveBeenCalled();
    show('visible');
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(navigation.refresh).toHaveBeenCalledOnce();
  });
});
