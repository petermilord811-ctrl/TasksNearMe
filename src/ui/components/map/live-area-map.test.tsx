/** @vitest-environment jsdom */
import { cleanup, render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import en from '../../../../messages/en/ui';
import es from '../../../../messages/es/ui';
import { LiveAreaMap } from './live-area-map';

// MapLibre stands in as a map that records what it was built with; every other call does nothing.
const built = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock('maplibre-gl', () => {
  class FakeMap {
    touchZoomRotate = { disableRotation: () => {} };
    keyboard = { disableRotation: () => {} };
    constructor(options: Record<string, unknown>) {
      built.push(options);
      return new Proxy(this, { get: (target, key) => (key in target ? target[key as keyof FakeMap] : () => undefined) });
    }
  }
  return { Map: FakeMap, Marker: class {}, getVersion: () => '0.0.0', setWorkerUrl: () => {} };
});
afterEach(() => { cleanup(); built.length = 0; });

function show(locale: 'en' | 'es') {
  render(
    <NextIntlClientProvider locale={locale} messages={locale === 'es' ? es : en}>
      <LiveAreaMap styleUrl="https://tiles.example/style.json" places={[]} fallbackCenter={{ lat: 29.65, lng: -82.32 }} label="Tasks near you" groupLabel={(count) => `${count} tasks`} visible onReady={() => {}} onFailed={() => {}} />
    </NextIntlClientProvider>,
  );
  return built.at(-1)?.locale as Record<string, string>;
}

describe('LiveAreaMap (accessibility pass, J-A6)', () => {
  it('names the map’s canvas, a region in the Tab order, in the page’s language with how to move it', () => {
    expect(show('en')['Map.Title']).toBe(en.common.mapKeyboard);
    cleanup();
    expect(show('es')['Map.Title']).toBe(es.common.mapKeyboard);
    expect(es.common.mapKeyboard).not.toBe(en.common.mapKeyboard);
  });
});
