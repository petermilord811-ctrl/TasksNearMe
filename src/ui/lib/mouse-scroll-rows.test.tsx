/** @vitest-environment jsdom */
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MouseScrollRows, sidewaysRowFrom } from './mouse-scroll-rows';

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

/** A row of chips 300 px wide holding 900 px, scrolled to `left`; `bar` is the height its scrollbar takes. */
function row({ bar = 0, attrs = '' }: { bar?: number; attrs?: string } = {}) {
  const host = document.createElement('div');
  host.innerHTML = `<div ${attrs}><ul id="row" style="overflow-x: auto"><li><button id="chip" type="button">Cleaning</button></li><li><a id="link" href="/app/tasks">Moving</a></li></ul></div>`;
  document.body.appendChild(host);
  const list = host.querySelector<HTMLElement>('#row')!;
  let left = 0;
  Object.defineProperties(list, {
    scrollWidth: { configurable: true, get: () => 900 },
    clientWidth: { configurable: true, get: () => 300 },
    clientHeight: { configurable: true, get: () => 40 },
    offsetHeight: { configurable: true, get: () => 40 + bar },
    scrollLeft: { configurable: true, get: () => left, set: (value: number) => { left = Math.max(0, Math.min(600, value)); } },
  });
  const scrollBy = vi.fn(({ left: by }: { left: number }) => { list.scrollLeft = left + by; });
  list.scrollBy = scrollBy as unknown as typeof list.scrollBy;
  return { list, chip: host.querySelector<HTMLElement>('#chip')!, link: host.querySelector<HTMLElement>('#link')!, scrollBy };
}

function pointer(type: string, target: Element, init: { x?: number; pointerType?: string; button?: number } = {}) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: init.x ?? 0, button: init.button ?? 0 });
  Object.defineProperties(event, { pointerType: { value: init.pointerType ?? 'mouse' }, pointerId: { value: 1 } });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

function wheel(target: Element, at: number, init: WheelEventInit = { deltaY: 100 }) {
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
  Object.defineProperty(event, 'timeStamp', { value: at });
  target.dispatchEvent(event);
  return event;
}

describe('sideways rows for a mouse (owner, 2026-11-24)', () => {
  it('finds the row that scrolls sideways with no scrollbar of its own', () => {
    const { list, chip } = row();
    expect(sidewaysRowFrom(chip)).toBe(list);
    cleanup();
    document.body.innerHTML = '';
    // A row whose scrollbar takes room can be dragged by that scrollbar.
    expect(sidewaysRowFrom(row({ bar: 12 }).chip)).toBeNull();
    document.body.innerHTML = '';
    expect(sidewaysRowFrom(row({ attrs: 'data-no-mouse-scroll' }).chip)).toBeNull();
  });

  it('turns with the wheel when the wheel starts over it, shows the grab cursor, and lets the page have it at its end', () => {
    render(<MouseScrollRows />);
    const { list, chip, scrollBy } = row();
    pointer('pointerover', chip);
    expect(list.classList.contains('cursor-grab')).toBe(true);
    expect(list.classList.contains('active:cursor-grabbing')).toBe(true);
    const first = wheel(chip, 1000);
    expect(first.defaultPrevented).toBe(true);
    expect(scrollBy).toHaveBeenLastCalledWith({ left: 100, behavior: 'smooth' });
    // Firefox counts a notch in lines.
    expect(wheel(chip, 1100, { deltaY: 3, deltaMode: 1 }).defaultPrevented).toBe(true);
    expect(scrollBy).toHaveBeenLastCalledWith({ left: 96, behavior: 'smooth' });
    list.scrollLeft = 600;
    // At its end, the page scrolls on.
    expect(wheel(chip, 1200).defaultPrevented).toBe(false);
    // Back toward the start, a new gesture turns it again; sideways wheels and Shift are the browser's own.
    expect(wheel(chip, 2000, { deltaY: -100 }).defaultPrevented).toBe(true);
    expect(wheel(chip, 3000, { deltaX: 80, deltaY: 10 }).defaultPrevented).toBe(false);
    expect(wheel(chip, 4000, { deltaY: 100, shiftKey: true }).defaultPrevented).toBe(false);
  });

  it('leaves a page scroll that passes over the row to the page', () => {
    render(<MouseScrollRows />);
    const { chip, scrollBy } = row();
    pointer('pointerover', chip);
    wheel(document.body, 1000);
    expect(wheel(chip, 1100).defaultPrevented).toBe(false);
    expect(wheel(chip, 1300).defaultPrevented).toBe(false);
    expect(scrollBy).not.toHaveBeenCalled();
    // A pause, and the wheel over the row turns it.
    expect(wheel(chip, 2000).defaultPrevented).toBe(true);
  });

  it('slides with a drag, and the click that ends the drag presses nothing', () => {
    render(<MouseScrollRows />);
    const { list, link } = row();
    const pressed = vi.fn((event: Event) => event.preventDefault());
    link.addEventListener('click', pressed);
    pointer('pointerdown', link, { x: 200 });
    pointer('pointermove', link, { x: 198 });
    expect(list.scrollLeft).toBe(0);
    pointer('pointermove', link, { x: 120 });
    expect(list.scrollLeft).toBe(80);
    expect(list.hasAttribute('data-mouse-dragging')).toBe(true);
    pointer('pointerup', link, { x: 120 });
    expect(list.hasAttribute('data-mouse-dragging')).toBe(false);
    act(() => link.click());
    expect(pressed).not.toHaveBeenCalled();
    // A plain click after it goes through.
    pointer('pointerdown', link, { x: 120 });
    pointer('pointerup', link, { x: 120 });
    act(() => link.click());
    expect(pressed).toHaveBeenCalledOnce();
  });

  it('leaves touch to the browser', () => {
    render(<MouseScrollRows />);
    const { list, chip } = row();
    pointer('pointerover', chip, { pointerType: 'touch' });
    pointer('pointerdown', chip, { x: 200, pointerType: 'touch' });
    pointer('pointermove', chip, { x: 100, pointerType: 'touch' });
    expect(list.scrollLeft).toBe(0);
    expect(list.classList.contains('cursor-grab')).toBe(false);
  });
});
