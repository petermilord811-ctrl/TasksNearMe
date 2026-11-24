/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startCursor } from './cursor-engine';
import { POINTER_STORAGE_KEY, savePointerPreference } from './pointer-preference';

/** The Bubble cursor's behavior (2026-11-24), driven with synthetic mouse events. */

let media: Record<string, boolean>;
let stop: () => void = () => {};

beforeEach(() => {
  media = { '(hover: hover) and (pointer: fine)': true, '(forced-colors: active)': false, '(prefers-reduced-motion: reduce)': false };
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: media[query] ?? false, media: query, addEventListener: () => {}, removeEventListener: () => {} }));
  window.localStorage.clear();
  document.body.innerHTML = '<header id="top"><a id="link" href="/app/bookings">Bookings</a></header><main id="main"><p id="text">Words</p><input id="field"><button id="go">Go</button></main><div id="cursor" hidden><span data-bcur-label></span></div>';
});

afterEach(() => {
  stop();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('data-pointer');
});

function pointer(type: string, target: Element, init: { x?: number; y?: number; pointerType?: string; button?: number } = {}) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: init.x ?? 40, clientY: init.y ?? 60, button: init.button ?? 0 });
  Object.defineProperty(event, 'pointerType', { value: init.pointerType ?? 'mouse' });
  target.dispatchEvent(event);
}
const $ = (selector: string) => document.querySelector(selector)!;
const cursor = () => $('#cursor') as HTMLElement;
const start = () => {
  stop = startCursor(cursor(), { sheet: 'Opens here', tab: 'New tab', off: 'Not yet' });
};

describe('the Bubble cursor', () => {
  it('waits for the first mouse move before it hides the system pointer, then sits exactly on the mouse', () => {
    start();
    expect(cursor().hidden).toBe(true);
    expect(document.documentElement.hasAttribute('data-pointer')).toBe(false);
    pointer('pointermove', $('#text'), { x: 120, y: 80 });
    expect(cursor().hidden).toBe(false);
    expect(document.documentElement.getAttribute('data-pointer')).toBe('bubble');
    // 120 px less the tip's place in the drawing (2.5 of 24 units at 26 px), as the browser rounds it.
    expect(cursor().style.transform).toMatch(/^translate3d\(117\.29\d*px, 77\.29\d*px, 0(px)?\)$/);
  });

  it('steps aside over a text field and ignores touch', () => {
    start();
    pointer('pointermove', $('#text'));
    expect(cursor().dataset.away).toBeUndefined();
    pointer('pointermove', $('#field'));
    expect(cursor().dataset.away).toBe('1');
    pointer('pointermove', $('#go'));
    expect(cursor().dataset.away).toBeUndefined();
    expect(cursor().dataset.hover).toBe('press');
    pointer('pointermove', $('#go'), { pointerType: 'touch' });
    expect(cursor().dataset.away).toBe('1');
  });

  it('squeezes while pressed and releases on mouse up', () => {
    start();
    pointer('pointermove', $('#go'));
    pointer('pointerdown', $('#go'));
    expect(cursor().dataset.press).toBe('down');
    window.dispatchEvent(new MouseEvent('pointerup'));
    expect(cursor().dataset.press).toBe('up');
  });

  it('crosses into a new section once, from the mouse’s own movement', () => {
    start();
    pointer('pointermove', $('#link'), { x: 40, y: 10 });
    expect(cursor().dataset.cross).toBeUndefined();
    pointer('pointermove', $('#text'), { x: 40, y: 90 });
    expect(['a', 'b']).toContain(cursor().dataset.cross);
    expect(cursor().style.getPropertyValue('--bcur-dir')).toBe('90deg');
  });

  it('shows a spinner only when a page switch takes longer than 120 ms', () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16));
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
    try {
      start();
      pointer('pointermove', $('#link'));
      $('#link').addEventListener('click', (event) => event.preventDefault());
      ($('#link') as HTMLElement).click();
      vi.advanceTimersByTime(100);
      expect(cursor().dataset.load).toBeUndefined();
      vi.advanceTimersByTime(40);
      expect(cursor().dataset.load).toBe('loading');
      vi.advanceTimersByTime(10_000);
      expect(cursor().dataset.load).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives the system pointer back when someone chooses it', () => {
    start();
    pointer('pointermove', $('#text'));
    expect(document.documentElement.getAttribute('data-pointer')).toBe('bubble');
    savePointerPreference('system');
    expect(window.localStorage.getItem(POINTER_STORAGE_KEY)).toBe('system');
    expect(document.documentElement.hasAttribute('data-pointer')).toBe(false);
    expect(cursor().hidden).toBe(true);
    pointer('pointermove', $('#text'));
    expect(cursor().hidden).toBe(true);
    savePointerPreference('bubble');
    pointer('pointermove', $('#text'));
    expect(cursor().hidden).toBe(false);
  });

  it('never starts on a device without a mouse', () => {
    media['(hover: hover) and (pointer: fine)'] = false;
    start();
    pointer('pointermove', $('#text'));
    expect(cursor().hidden).toBe(true);
    expect(document.documentElement.hasAttribute('data-pointer')).toBe(false);
  });
});
