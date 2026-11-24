/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cursorValue, kindOfCursor, type CursorKind } from './cursor-art';
import { FRAME_MS, startCursorMotion, swingPoses } from './cursor-motion';
import { savePointerPreference } from './pointer-preference';

/**
 * The Bubble cursor's moving moments (2026-11-24, round two), driven with synthetic events. The cursors themselves are
 * CSS; here each element's computed cursor is given directly (jsdom doesn't cascade cursors).
 */

let media: Record<string, boolean>;
let shown: Map<Element, CursorKind>;
let stop: () => void = () => {};

beforeEach(() => {
  vi.useFakeTimers();
  media = { '(hover: hover) and (pointer: fine)': true, '(forced-colors: active)': false, '(prefers-reduced-motion: reduce)': false };
  vi.stubGlobal('matchMedia', (query: string) => ({ get matches() { return media[query] ?? false; }, media: query, addEventListener: () => {}, removeEventListener: () => {} }));
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-pointer');
  document.body.innerHTML = '<header id="top"><a id="link" href="/app/bookings">Bookings</a></header><main id="main"><p id="text">Words</p><button id="go">Go</button><button id="off" disabled>No</button><a id="tab" href="/p" target="_blank">P</a></main>';
  shown = new Map([['#link', 'press'], ['#text', 'rest'], ['#go', 'press'], ['#off', 'off'], ['#tab', 'tab'], ['#main', 'rest'], ['#top', 'rest']].map(([selector, kind]) => [$(selector), kind as CursorKind]));
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element) => {
    const inline = (el as HTMLElement).style?.getPropertyValue('cursor');
    if (inline) return { cursor: inline } as CSSStyleDeclaration;
    const kind = shown.get(el);
    return kind ? ({ cursor: cursorValue(kind) } as CSSStyleDeclaration) : real(el);
  });
  stop = startCursorMotion({ sheet: 'Opens here', tab: 'New tab', off: 'Not yet' });
});

afterEach(() => {
  stop();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function $(selector: string) {
  return document.querySelector(selector)!;
}
function pointer(type: string, target: Element, init: { x?: number; y?: number; pointerType?: string; button?: number } = {}) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: init.x ?? 40, clientY: init.y ?? 60, button: init.button ?? 0 });
  Object.defineProperty(event, 'pointerType', { value: init.pointerType ?? 'mouse' });
  target.dispatchEvent(event);
}
const inline = (selector: string) => ($(selector) as HTMLElement).style.getPropertyValue('cursor');
const kindOn = (selector: string) => kindOfCursor(inline(selector));

describe('the Bubble cursor’s moments', () => {
  it('swings from the tip when the mouse enters another part of the page, then gives the element its own cursor back', () => {
    pointer('pointerover', $('#link'), { x: 40, y: 10 });
    expect(inline('#link')).toBe('');
    pointer('pointerover', $('#text'), { x: 140, y: 12 });
    expect(kindOn('#text')).toBe('rest');
    expect(inline('#text')).toContain('rotate(16)');
    expect(($('#text') as HTMLElement).style.getPropertyPriority('cursor')).toBe('important');
    vi.advanceTimersByTime(FRAME_MS * 5);
    expect(inline('#text')).toBe('');
  });

  it('squeezes while pressed and springs back on release; a disabled control shakes', () => {
    pointer('pointerover', $('#go'));
    pointer('pointerdown', $('#go'));
    expect(kindOn('#go')).toBe('press');
    expect(inline('#go')).toContain('scale(0.');
    window.dispatchEvent(new MouseEvent('pointerup'));
    vi.advanceTimersByTime(FRAME_MS * 3);
    expect(inline('#go')).toBe('');
    pointer('pointerover', $('#off'));
    pointer('pointerdown', $('#off'));
    expect(kindOn('#off')).toBe('off');
    expect(inline('#off')).toContain('rotate(11)');
  });

  it('shows the words beside a link that opens a new tab after a moment', () => {
    pointer('pointerover', $('#tab'));
    expect(document.querySelector('.bcur-label')).toBeNull();
    vi.advanceTimersByTime(600);
    const label = document.querySelector<HTMLElement>('.bcur-label')!;
    expect(label.textContent).toBe('New tab');
    expect(label.hasAttribute('data-shown')).toBe(true);
    pointer('pointerover', $('#text'));
    expect(label.hasAttribute('data-shown')).toBe(false);
  });

  it('turns into the loading square only when a page switch takes longer than 120 ms, and stops after 10 s', () => {
    pointer('pointerover', $('#link'));
    $('#link').addEventListener('click', (event) => event.preventDefault());
    ($('#link') as HTMLElement).click();
    vi.advanceTimersByTime(100);
    expect(inline('#link')).toBe('');
    vi.advanceTimersByTime(40);
    expect(kindOn('#link')).toBe('loading');
    vi.advanceTimersByTime(10_000);
    expect(inline('#link')).toBe('');
  });

  it('stays still for “Reduce motion”, and does nothing once someone chose the system pointer', () => {
    media['(prefers-reduced-motion: reduce)'] = true;
    pointer('pointerover', $('#link'), { x: 40, y: 10 });
    pointer('pointerover', $('#text'), { x: 140, y: 12 });
    expect(inline('#text')).toBe('');
    media['(prefers-reduced-motion: reduce)'] = false;
    savePointerPreference('system');
    expect(document.documentElement.getAttribute('data-pointer')).toBe('system');
    pointer('pointerdown', $('#go'));
    expect(inline('#go')).toBe('');
    savePointerPreference('bubble');
    expect(document.documentElement.hasAttribute('data-pointer')).toBe(false);
  });

  it('swings away from the way the mouse moves, and squashes when it comes in from above or below', () => {
    expect(swingPoses(30, 2)[0]!.rotate).toBe(16);
    expect(swingPoses(-30, 2)[0]!.rotate).toBe(-16);
    expect(swingPoses(2, 30)[0]).toEqual({ sx: 1.1, sy: 0.86 });
    expect(swingPoses(2, -30)[0]).toEqual({ sx: 0.92, sy: 1.1 });
  });
});
