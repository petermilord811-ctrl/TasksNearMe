/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AreaMap } from './area-map';

// The live map stands for MapLibre: present or not is all this file asks.
vi.mock('next/dynamic', () => ({ default: () => function LiveMap() { return <div data-testid="live-map" />; } }));
vi.mock('./map-tiles', () => ({ useMapTiles: () => ({ live: true, styleUrl: 'https://tiles.example/style.json', attribution: '© OpenStreetMap' }) }));
// The landing map's base style, fetched as the map nears (no network here).
const prefetched = vi.hoisted(() => [] as string[]);
vi.mock('@/ui/landing/map/base-style', () => ({ prefetchBaseStyle: (url: string) => { prefetched.push(url); return Promise.resolve(null); } }));

let observed: { callback: IntersectionObserverCallback; element: Element } | undefined;
afterEach(() => { cleanup(); vi.unstubAllGlobals(); observed = undefined; prefetched.length = 0; });

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
    // In view: its style is fetched at once (the landing map's, restyled once), and it waits for the page to be idle.
    expect(prefetched).toEqual(['https://tiles.example/style.json']);
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

  it('opens a picked place’s card in the map: its area and day, a way to the task, and Close (owner, 2026-11-25)', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const onSelect = vi.fn();
    const place = {
      id: 'tsk_a', point: { lat: 29.65, lng: -82.32 }, radiusMeters: 800, label: '$60.00', name: 'Assemble a desk, $60.00, Mueller', categorySlug: 'furniture-assembly' as const,
      card: { title: 'Assemble a desk', area: 'Mueller', when: 'Sun, Nov 29', price: '$60.00', detail: 'You’d earn $60.00', href: '/app/find-work/tsk_a' },
    };
    const { rerender } = render(<AreaMap {...props} places={[place]} selectedId={null} onSelect={onSelect} cardLabels={{ open: 'View task', close: 'Close' }} />);
    expect(screen.queryByRole('link', { name: 'View task' })).toBeNull();
    rerender(<AreaMap {...props} places={[place]} selectedId="tsk_a" onSelect={onSelect} cardLabels={{ open: 'View task', close: 'Close' }} />);
    const map = screen.getByRole('region', { name: 'Tasks near you' });
    expect(map).toHaveTextContent('Assemble a desk');
    expect(map).toHaveTextContent('Mueller · Sun, Nov 29');
    expect(map).toHaveTextContent('You’d earn $60.00');
    expect(screen.getByRole('link', { name: 'View task' })).toHaveAttribute('href', '/app/find-work/tsk_a');
    act(() => screen.getByRole('button', { name: 'Close' }).click());
    expect(onSelect).toHaveBeenCalledWith(null);
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
