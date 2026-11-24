/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { austinLandingMap, austinMapPins } from '@/fixtures';
import { distanceMiles, type LatLng } from '@/shared/geo';
import messages from '../../../../messages/en/ui';
import { aboutMiles } from './map-math';
import type { MapControls } from './maplibre-view';
import { MinimapDock } from './minimap';
import type { MinimapMode } from './minimap-math';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => '/' }));

const t = createTranslator({ locale: 'en', messages, namespace: 'landing.map' });
const categoryName = createTranslator({ locale: 'en', messages, namespace: 'helperCard.categories' });

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** The big map's handles, as stand-ins; its frame covers the middle of the city (or another place). */
function fakeControls(middle: LatLng = austinLandingMap.center): MapControls & { listeners: (() => void)[] } {
  const listeners: (() => void)[] = [];
  const { lat, lng } = middle;
  return {
    listeners,
    zoomBy: vi.fn(),
    resetNorth: vi.fn(),
    corners: () => [
      [lng - 0.05, lat + 0.04],
      [lng + 0.05, lat + 0.04],
      [lng + 0.05, lat - 0.04],
      [lng - 0.05, lat - 0.04],
    ],
    onMove: (listener) => {
      listeners.push(listener);
      return () => undefined;
    },
    centerOn: vi.fn(),
    panBy: vi.fn(),
    showCity: vi.fn(),
  };
}

type DockProps = Parameters<typeof MinimapDock>[0];

function show(mode: MinimapMode, controls = fakeControls(), onMode = vi.fn(), extra: Partial<DockProps> = {}) {
  render(
    <NextIntlClientProvider locale="en" timeZone="America/Chicago" messages={messages}>
      <MinimapDock
        mode={mode}
        onMode={onMode}
        map={austinLandingMap}
        pins={austinMapPins}
        controls={controls}
        litTaskId={null}
        pickedTaskId={null}
        activeCategory={null}
        selectedArea={null}
        onPickArea={vi.fn()}
        onPickTask={vi.fn()}
        market="Austin"
        timeZone="America/Chicago"
        onShowCity={vi.fn()}
        {...extra}
      />
    </NextIntlClientProvider>,
  );
  return { controls, onMode };
}

describe('the minimap (owner, 2026-11-24: "improve it more deeply, more functional")', () => {
  it('draws every task, says how many the big map shows and how many are outside it', async () => {
    vi.useFakeTimers();
    const { controls } = show('small');
    // The frame is drawn on the next frame.
    await act(async () => {
      vi.advanceTimersByTime(50);
    });
    // One dot per task, or one counted dot for tasks at one spot.
    const single = document.querySelectorAll('[data-minimap-city] circle[stroke="var(--card)"]').length;
    const grouped = [...document.querySelectorAll('[data-minimap-group]')].reduce((sum, group) => sum + Number(group.getAttribute('data-minimap-group')), 0);
    expect(single + grouped).toBe(austinMapPins.length);
    const footer = screen.getByText(/in view/);
    // Some tasks are inside the frame, some outside (Circle C is far out).
    expect(footer.textContent).toMatch(/^\d+ in view · \d+ outside the map$/);
    expect(controls.listeners.length).toBeGreaterThan(0);
  });

  it('its buttons: the whole city, bigger and smaller, and folding to a chip that opens it again', () => {
    const { controls, onMode } = show('small');
    fireEvent.click(screen.getByRole('button', { name: t('minimapFit') }));
    expect(controls.showCity).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: t('minimapBigger') }));
    expect(onMode).toHaveBeenLastCalledWith('large');
    fireEvent.click(screen.getByRole('button', { name: t('minimapFold') }));
    expect(onMode).toHaveBeenLastCalledWith('folded');
    cleanup();

    const folded = show('folded');
    expect(document.querySelector('[data-minimap]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: t('minimapOpen') }));
    expect(folded.onMode).toHaveBeenLastCalledWith('small');
  });

  it('with the keyboard: the arrows move the big map, + and − zoom it, Enter shows the whole city', () => {
    const { controls } = show('large');
    const drawing = screen.getByRole('group', { name: t('minimapLabel', { city: 'Austin' }) });
    fireEvent.keyDown(drawing, { key: 'ArrowLeft' });
    expect(controls.panBy).toHaveBeenLastCalledWith(-0.3, 0);
    fireEvent.keyDown(drawing, { key: 'ArrowDown' });
    expect(controls.panBy).toHaveBeenLastCalledWith(0, 0.3);
    fireEvent.keyDown(drawing, { key: '+' });
    expect(controls.zoomBy).toHaveBeenLastCalledWith(1);
    fireEvent.keyDown(drawing, { key: '-' });
    expect(controls.zoomBy).toHaveBeenLastCalledWith(-1);
    fireEvent.keyDown(drawing, { key: 'Enter' });
    expect(controls.showCity).toHaveBeenCalledTimes(1);
    // The larger size: a bigger drawing, and the button now makes it smaller.
    expect(document.querySelector('[data-minimap-city]')?.getAttribute('width')).toBe('300');
    expect(screen.getByRole('button', { name: t('minimapSmaller') })).toBeInTheDocument();
  });

  it('tasks at one spot are one counted dot: pointed at, it says how many and where; a click zooms the big map in there', async () => {
    vi.useFakeTimers();
    const spot = austinMapPins[0]!.point;
    const pins = austinMapPins.slice(0, 3).map((pin) => ({ ...pin, point: spot, areaName: 'Mueller' }));
    const { controls } = show('small', fakeControls(), vi.fn(), { pins });
    const group = document.querySelector('[data-minimap-group="3"]')!;
    expect(group).not.toBeNull();
    const svg = document.querySelector<SVGSVGElement>('[data-minimap-city]')!;
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, right: 220, bottom: 140, width: 220, height: 140, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    svg.setPointerCapture = vi.fn();
    const dot = group.querySelector('circle[r="6.2"]')!;
    const at = { clientX: Number(dot.getAttribute('cx')), clientY: Number(dot.getAttribute('cy')), pointerId: 1 };
    fireEvent.pointerMove(svg, at);
    expect(screen.getByText(t('minimapGroup', { count: 3, area: 'Mueller' }))).toBeInTheDocument();
    fireEvent.pointerDown(svg, { ...at, button: 0, pointerType: 'mouse' });
    fireEvent.pointerUp(svg, { ...at, button: 0, pointerType: 'mouse' });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(controls.centerOn).toHaveBeenCalledWith({ lat: expect.closeTo(spot.lat, 6), lng: expect.closeTo(spot.lng, 6) }, { animate: true, zoomBy: 1.5 });
  });

  it('a key says what each mark means, and closes again', () => {
    show('small');
    const button = screen.getByRole('button', { name: t('minimapKey') });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    const key = document.getElementById(button.getAttribute('aria-controls')!)!;
    expect(key).not.toBeVisible();
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button).toHaveAccessibleName(t('minimapKeyClose'));
    expect(key).toBeVisible();
    expect(within(key).getByText(t('minimapKeyShade'))).toBeInTheDocument();
    expect(within(key).getByText(t('minimapKeyGroup'))).toBeInTheDocument();
    expect(within(key).getByText(t('minimapKeyFrame'))).toBeInTheDocument();
    expect(within(key).getByText(categoryName(austinMapPins[0]!.categorySlug))).toBeInTheDocument();
    fireEvent.click(button);
    expect(key).not.toBeVisible();
  });

  it('a plain wheel scrolls the page (and the map says how to zoom); Ctrl or ⌘ with the wheel zooms the big map', () => {
    const onBlockedWheel = vi.fn();
    const { controls } = show('small', fakeControls(), vi.fn(), { onBlockedWheel });
    const svg = document.querySelector('[data-minimap-city]')!;
    const plain = new WheelEvent('wheel', { deltaY: 100, cancelable: true, bubbles: true });
    svg.dispatchEvent(plain);
    expect(plain.defaultPrevented).toBe(false);
    expect(onBlockedWheel).toHaveBeenCalledTimes(1);
    expect(controls.zoomBy).not.toHaveBeenCalled();
    const zoom = new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, cancelable: true, bubbles: true });
    svg.dispatchEvent(zoom);
    expect(zoom.defaultPrevented).toBe(true);
    expect(controls.zoomBy).toHaveBeenCalledWith(0.5);
  });

  it("in no open city, while the big map is there: the visitor's own area, its edge pointing to the nearest open city (a press shows it)", async () => {
    vi.useFakeTimers();
    const inDallas: LatLng = { lat: 32.7767, lng: -96.797 };
    const cities = austinLandingMap.cities.map((city) => ({ slug: city.slug, name: city.name, point: city.point, miles: distanceMiles(inDallas, city.point) })).sort((a, b) => a.miles - b.miles);
    const onShowCity = vi.fn();
    show('small', fakeControls(inDallas), vi.fn(), { away: { point: inDallas, place: { name: 'Dallas', state: 'TX' }, cities }, onShowCity, userPoint: inDallas });
    await act(async () => {
      vi.advanceTimersByTime(50);
    });
    expect(document.querySelector('[data-minimap-away]')).not.toBeNull();
    expect(screen.getByText('Dallas, TX')).toBeInTheDocument();
    const miles = aboutMiles(cities[0]!.miles);
    expect(cities[0]!.slug).toBe('austin');
    expect(screen.getByText(t('minimapAway', { city: 'Austin', miles }))).toBeInTheDocument();
    // No tasks there to draw.
    expect(document.querySelectorAll('[data-minimap-city] circle[stroke="var(--card)"]')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: t('minimapCityEdgeLabel', { city: 'Austin', miles }) }));
    expect(onShowCity).toHaveBeenCalledWith('austin');
    expect(screen.getByRole('group', { name: t('minimapAwayLabel', { city: 'Austin' }) })).toBeInTheDocument();
  });

  it('on phones and tablets: always small, no size button, and its fold button hides it', () => {
    const onClose = vi.fn();
    show('large', fakeControls(), vi.fn(), { compact: true, onClose });
    expect(document.querySelector('[data-minimap-city]')?.getAttribute('width')).toBe('220');
    expect(screen.queryByRole('button', { name: t('minimapSmaller') })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: t('minimapHide') }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
