/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchPlainWheel, type WheelHint } from './wheel-hint';

let container: HTMLDivElement;
let hint: WheelHint;
const plain = vi.fn();

const wheel = (init: WheelEventInit = {}) => {
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 40, ...init });
  container.dispatchEvent(event);
  return event;
};

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  plain.mockClear();
  hint = watchPlainWheel({ container, onPlainWheel: plain });
});

afterEach(() => {
  hint.destroy();
  container.remove();
});

describe('the wheel over the map', () => {
  it('lets a plain wheel scroll the page, and says so, every time', () => {
    const event = wheel();
    expect(event.defaultPrevented).toBe(false);
    wheel();
    expect(plain).toHaveBeenCalledTimes(2);
  });

  it('says nothing for Ctrl or ⌘ + wheel, or a trackpad pinch (they zoom the map)', () => {
    wheel({ ctrlKey: true });
    wheel({ metaKey: true });
    expect(plain).not.toHaveBeenCalled();
  });

  it('says nothing in full screen, where every wheel zooms, and again after it', () => {
    hint.setFree(true);
    wheel();
    expect(plain).not.toHaveBeenCalled();
    hint.setFree(false);
    wheel();
    expect(plain).toHaveBeenCalledTimes(1);
  });

  it('stops listening when the map goes', () => {
    hint.destroy();
    wheel();
    expect(plain).not.toHaveBeenCalled();
  });
});
