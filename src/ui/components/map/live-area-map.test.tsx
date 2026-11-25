/** @vitest-environment jsdom */
import { cleanup, render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import en from '../../../../messages/en/ui';
import es from '../../../../messages/es/ui';
import { LiveAreaMap, mapPixelRatio } from './live-area-map';

// MapLibre stands in as a map that records what it was built with; every other call does nothing.
const built = vi.hoisted(() => [] as Record<string, unknown>[]);
const canvases = vi.hoisted(() => [] as HTMLCanvasElement[]);
vi.mock('maplibre-gl', () => {
  class FakeMap {
    touchZoomRotate = { disableRotation: () => {} };
    keyboard = { disableRotation: () => {} };
    // As MapLibre builds it: a focusable region named by the locale's Map.Title.
    canvas = (() => {
      const canvas = document.createElement('canvas');
      canvas.tabIndex = 0;
      canvas.setAttribute('role', 'region');
      return canvas;
    })();
    getCanvas() { return this.canvas; }
    constructor(options: Record<string, unknown>) {
      built.push(options);
      canvases.push(this.canvas);
      return new Proxy(this, { get: (target, key) => (key in target ? target[key as keyof FakeMap] : () => undefined) });
    }
  }
  return { Map: FakeMap, Marker: class {}, getVersion: () => '0.0.0', setWorkerUrl: () => {} };
});
afterEach(() => { cleanup(); built.length = 0; canvases.length = 0; });

function map(locale: 'en' | 'es', visible = true) {
  return <NextIntlClientProvider locale={locale} messages={locale === 'es' ? es : en}>
    <LiveAreaMap styleUrl="https://tiles.example/style.json" places={[]} fallbackCenter={{ lat: 29.65, lng: -82.32 }} label="Tasks near you" groupLabel={(count) => `${count} tasks`} visible={visible} onReady={() => {}} onFailed={() => {}} />
  </NextIntlClientProvider>;
}

function show(locale: 'en' | 'es') {
  render(map(locale));
  return built.at(-1)?.locale as Record<string, string>;
}

describe('LiveAreaMap (accessibility pass, J-A6)', () => {
  it('names the map’s canvas, a region in the Tab order, in the page’s language with how to move it', () => {
    expect(show('en')['Map.Title']).toBe(en.common.mapKeyboard);
    cleanup();
    expect(show('es')['Map.Title']).toBe(es.common.mapKeyboard);
    expect(es.common.mapKeyboard).not.toBe(en.common.mapKeyboard);
  });

  it('makes the canvas a named group inside the map’s region, a Tab stop only once the live map shows (J-A10)', () => {
    const { container, rerender } = render(map('en', false));
    const canvas = canvases.at(-1)!;
    expect(canvas.getAttribute('role')).toBe('group');
    expect(canvas.tabIndex).toBe(-1);
    // No region of its own: AreaMap's region is the map's one landmark.
    expect(container.querySelector('[role="region"]')).toBeNull();
    rerender(map('en', true));
    expect(canvases).toHaveLength(1);
    expect(canvas.tabIndex).toBe(0);
  });
});

describe('LiveAreaMap’s look (owner, 2026-11-25: the landing map’s)', () => {
  it('starts on the landing’s base style, at a pixel ratio that keeps the canvas under about 4 million pixels', () => {
    render(map('en'));
    const options = built.at(-1)!;
    // Not prefetched here: the style comes from its address and is restyled as MapLibre commits it.
    expect(options.style).toBe('https://tiles.example/style.json');
    expect(typeof options.transformStyle).toBe('function');
    expect(options.cooperativeGestures).toBe(true);
    vi.stubGlobal('devicePixelRatio', 2);
    expect(mapPixelRatio(390, 520)).toBe(2);
    expect(mapPixelRatio(1440, 900)).toBeCloseTo(Math.sqrt(4_000_000 / (1440 * 900)), 5);
    vi.stubGlobal('devicePixelRatio', 1);
    expect(mapPixelRatio(1440, 900)).toBe(1);
    vi.unstubAllGlobals();
  });
});
