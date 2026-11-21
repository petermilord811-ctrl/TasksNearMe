/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AreaMap } from './area-map';

// The live map stands for MapLibre: present or not is all this file asks.
vi.mock('next/dynamic', () => ({ default: () => function LiveMap() { return <div data-testid="live-map" />; } }));
vi.mock('./map-tiles', () => ({ useMapTiles: () => ({ live: true, styleUrl: 'https://tiles.example/style.json', attribution: '© OpenStreetMap' }) }));

let observed: { callback: IntersectionObserverCallback; element: Element } | undefined;
afterEach(() => { cleanup(); vi.unstubAllGlobals(); observed = undefined; });

const props = { places: [], fallbackCenter: { lat: 29.65, lng: -82.32 }, label: 'Tasks near you', groupLabel: (count: number) => `${count} tasks` };

describe('AreaMap (speed on a phone)', () => {
  it('loads the live map only once the map is about to be seen, the drawn one standing in until then', () => {
    const idle: (() => void)[] = [];
    vi.stubGlobal('requestIdleCallback', (run: () => void) => idle.push(run));
    vi.stubGlobal('cancelIdleCallback', () => {});
    vi.stubGlobal('IntersectionObserver', class {
      constructor(private callback: IntersectionObserverCallback) {}
      observe(element: Element) { observed = { callback: this.callback, element }; }
      disconnect() {}
    });
    render(<AreaMap {...props} />);
    // Hidden (a phone's list view) or below the fold: nothing loads.
    expect(screen.queryByTestId('live-map')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Tasks near you' })).toBeInTheDocument();
    act(() => observed!.callback([{ isIntersecting: true, target: observed!.element } as IntersectionObserverEntry], {} as IntersectionObserver));
    // In view: it waits for the page to be idle first.
    expect(screen.queryByTestId('live-map')).not.toBeInTheDocument();
    act(() => idle.forEach((run) => run()));
    expect(screen.getByTestId('live-map')).toBeInTheDocument();
  });

  it('is one landmark, named by its label and described by its legend, the drawn picture hidden (accessibility pass, J-A10)', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    render(<><AreaMap {...props} describedBy="legend" places={[{ id: 'tsk_a', point: { lat: 29.65, lng: -82.32 }, radiusMeters: 800, label: '$60', name: 'Assemble a desk' }]} /><p id="legend">Circles are general areas.</p></>);
    const map = screen.getByRole('region', { name: 'Tasks near you' });
    expect(screen.getAllByRole('region')).toEqual([map]);
    expect(map).toHaveAccessibleDescription('Circles are general areas.');
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByRole('button', { name: 'Assemble a desk' })).toBeInTheDocument();
  });

  it('loads it at once where IntersectionObserver is missing, and never when the live map is off', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    render(<AreaMap {...props} />);
    expect(screen.getByTestId('live-map')).toBeInTheDocument();
    cleanup();
    render(<AreaMap {...props} live={false} />);
    expect(screen.queryByTestId('live-map')).not.toBeInTheDocument();
  });
});
