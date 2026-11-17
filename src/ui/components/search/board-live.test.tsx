/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskPublicView } from '@/contracts';
import { deskPublicTask } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { BoardLive } from './board-live';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

/** A stand-in for the browser's EventSource: the test opens it and sends events. */
class FakeEventSource {
  static last: FakeEventSource | null = null;
  static readonly OPEN = 1;
  readyState = 0;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
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
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  send(type: string, data: unknown) {
    for (const listener of this.listeners.get(type) ?? []) listener(new MessageEvent(type, { data: JSON.stringify(data) }));
  }
}

const soon = new Date(Date.now() + 2 * 86_400_000);
const posted = (id: string, change: Partial<TaskPublicView> = {}): TaskPublicView => ({
  ...deskPublicTask,
  id,
  status: 'open',
  postedAt: new Date().toISOString(),
  schedule: { windowStart: soon.toISOString(), windowEnd: new Date(soon.getTime() + 7_200_000).toISOString(), flexible: false },
  ...change,
});

function renderLive(props: Partial<Parameters<typeof BoardLive>[0]> = {}) {
  return render(<NextIntlClientProvider locale="en" timeZone="America/Chicago" messages={messages}>
    <div id="board-list" />
    <BoardLive marketSlug="austin" timeZone="America/Chicago" query={{ areas: [], times: [], few: false, when: 'any', remoteOnly: false, category: 'furniture-assembly' }} areas={[{ slug: 'mueller', name: 'Mueller' }]} shownIds={['tsk_on_page']} listId="board-list" {...props} />
  </NextIntlClientProvider>);
}

beforeEach(() => {
  vi.stubGlobal('EventSource', FakeEventSource);
  Element.prototype.scrollIntoView = vi.fn();
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
  refresh.mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('BoardLive', () => {
  it('listens to the market and says it is live once connected', () => {
    renderLive();
    expect(FakeEventSource.last?.url).toBe('/api/realtime/market/austin');
    expect(screen.queryByText('Live')).toBeNull();
    act(() => FakeEventSource.last!.open());
    expect(screen.getByText('Live')).toBeDefined();
  });

  it('counts new tasks that fit the filters, and loads them when asked', () => {
    renderLive();
    const source = FakeEventSource.last!;
    act(() => {
      source.open();
      source.send('task', posted('tsk_new_1'));
      source.send('task', posted('tsk_new_1')); // the same task twice counts once
      source.send('task', posted('tsk_new_2'));
      source.send('task', posted('tsk_other', { categorySlug: 'moving-help' })); // another category
      source.send('task', posted('tsk_on_page')); // already on the page
    });
    const pill = screen.getByRole('button', { name: /2 new tasks · Show/ });
    expect(screen.getByText('2 new tasks posted')).toBeDefined();
    fireEvent.click(pill);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /new tasks? · Show/ })).toBeNull();
  });

  it('ignores anything that is not a task', () => {
    renderLive();
    act(() => {
      FakeEventSource.last!.open();
      FakeEventSource.last!.send('task', { nope: true });
    });
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('closes the stream when the board goes away', () => {
    const { unmount } = renderLive();
    const source = FakeEventSource.last!;
    unmount();
    expect(source.closed).toBe(true);
  });
});
