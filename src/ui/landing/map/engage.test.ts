/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWheelGate, type WheelGate } from './engage';

let container: HTMLDivElement;
let outside: HTMLButtonElement;
let zoom: boolean;
let gate: WheelGate;
const blocked = vi.fn();
const changes: boolean[] = [];

const wheel = (init: WheelEventInit = {}) => container.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 40, ...init }));
const pointer = (target: Element, type: string) => target.dispatchEvent(new Event(type, { bubbles: true }));

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement('div');
  outside = document.createElement('button');
  document.body.append(container, outside);
  zoom = true;
  changes.length = 0;
  blocked.mockClear();
  gate = createWheelGate({
    container,
    enableZoom: () => (zoom = true),
    disableZoom: () => (zoom = false),
    onChange: (engaged) => changes.push(engaged),
    onBlockedWheel: blocked,
  });
});

afterEach(() => {
  gate.destroy();
  container.remove();
  outside.remove();
  vi.useRealTimers();
});

describe('the map’s scroll wheel', () => {
  it('starts with the wheel scrolling the page, and says how to zoom', () => {
    expect(zoom).toBe(false);
    expect(gate.isEngaged()).toBe(false);
    wheel();
    expect(zoom).toBe(false);
    expect(blocked).toHaveBeenCalledTimes(1);
  });

  it('zooms once the map is pressed, and lets go after the pointer leaves for a moment', () => {
    pointer(container, 'pointerdown');
    expect(zoom).toBe(true);
    expect(changes).toEqual([true]);
    wheel();
    expect(blocked).not.toHaveBeenCalled();
    pointer(container, 'pointerleave');
    vi.advanceTimersByTime(600);
    pointer(container, 'pointerenter');
    vi.advanceTimersByTime(1000);
    expect(zoom).toBe(true);
    pointer(container, 'pointerleave');
    vi.advanceTimersByTime(1000);
    expect(zoom).toBe(false);
    expect(changes).toEqual([true, false]);
  });

  it('always zooms with Ctrl or ⌘ (and a trackpad pinch)', () => {
    wheel({ ctrlKey: true });
    expect(zoom).toBe(true);
    expect(blocked).not.toHaveBeenCalled();
  });

  it('lets go on Escape and on a press elsewhere on the page', () => {
    gate.engage();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(zoom).toBe(false);
    gate.engage();
    pointer(outside, 'pointerdown');
    expect(zoom).toBe(false);
  });

  it('stays engaged while locked (a full-screen map)', () => {
    gate.lock(true);
    expect(zoom).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    pointer(outside, 'pointerdown');
    pointer(container, 'pointerleave');
    vi.advanceTimersByTime(2000);
    expect(zoom).toBe(true);
    gate.lock(false);
    expect(zoom).toBe(false);
  });
});
