/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskPublicView } from '@/contracts';
import { austinMapPins, deskPublicTask, homePageData } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { LandingProvider } from '../landing-state';
import { MapExplorerProvider, useMapExplorer } from './explorer-state';
import { LiveTaskNote } from './task-map';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => '/' }));

/** A stand-in for the browser's EventSource: the test sends events. */
class FakeEventSource {
  static last: FakeEventSource | null = null;
  private listeners = new Map<string, ((event: MessageEvent<string>) => void)[]>();
  constructor(readonly url: string) {
    FakeEventSource.last = this;
  }
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  close() {}
  send(type: string, data: unknown) {
    for (const listener of this.listeners.get(type) ?? []) listener(new MessageEvent(type, { data: JSON.stringify(data) }));
  }
}

/** The visitor has come to the map (TaskMap says so once it starts loading). */
function Near() {
  const { setNear } = useMapExplorer();
  useEffect(() => setNear(true), [setNear]);
  return null;
}

function Shown() {
  const { pins, requestFocus } = useMapExplorer();
  void requestFocus;
  return <p data-testid="count">{pins.length}</p>;
}

beforeEach(() => {
  FakeEventSource.last = null;
  vi.stubGlobal('EventSource', FakeEventSource);
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the note about a task posted just now', () => {
  it('shows the new task with Show, and goes once dismissed', async () => {
    render(
      <NextIntlClientProvider locale="en" timeZone="America/New_York" messages={messages}>
        <LandingProvider initialCity={{ market: homePageData.market, map: homePageData.map }}>
          <MapExplorerProvider pins={austinMapPins.slice(0, 2)} marketSlug="gainesville" timeZone="America/New_York">
            <Near />
            <Shown />
            <LiveTaskNote />
          </MapExplorerProvider>
        </LandingProvider>
      </NextIntlClientProvider>,
    );
    expect(FakeEventSource.last?.url).toBe('/api/realtime/market/gainesville');
    const posted: TaskPublicView = { ...deskPublicTask, id: 'tsk_live_note', title: 'Hang three picture frames', status: 'open' };
    act(() => FakeEventSource.last!.send('task', posted));
    expect(screen.getByTestId('count').textContent).toBe('3');
    expect(screen.getByText(/Hang three picture frames in Mueller/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(/Hang three picture frames/)).toBeNull();
  });
});
