/** @vitest-environment jsdom */
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScrollbarActivity } from './scrollbar-activity';

/** jsdom has no layout: give the page a height, a window and a scroll position. */
function layPage({ total, view, scrollY }: { total: number; view: number; scrollY: number }) {
  Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: total });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: view });
  Object.defineProperty(window, 'scrollY', { configurable: true, value: scrollY });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 0) as unknown as number);
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => clearTimeout(handle));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('ScrollbarActivity: the page scrollbar', () => {
  it('stays out of the way on a page that does not scroll', () => {
    layPage({ total: 800, view: 800, scrollY: 0 });
    const { container } = render(<ScrollbarActivity />);
    const bar = container.querySelector<HTMLElement>('.page-scrollbar')!;
    expect(bar.getAttribute('aria-hidden')).toBe('true');
    expect(bar.hidden).toBe(true);
  });

  it('shows its thumb, sized and placed for the page, while the page scrolls, then hides it again', () => {
    layPage({ total: 4000, view: 800, scrollY: 0 });
    const { container } = render(<ScrollbarActivity />);
    const bar = container.querySelector<HTMLElement>('.page-scrollbar')!;
    const thumb = bar.firstElementChild as HTMLElement;
    expect(bar.hidden).toBe(false);
    expect(bar.hasAttribute('data-active')).toBe(false);

    // Halfway down: the thumb is a fifth of the track (800 / 4000) and halfway along what's left of it.
    layPage({ total: 4000, view: 800, scrollY: 1600 });
    act(() => {
      document.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(1);
    });
    expect(bar.hasAttribute('data-active')).toBe(true);
    // The page isn't marked (no native scrollbar there; a mark restyled every element as the root's transition ran).
    expect(document.documentElement.hasAttribute('data-scrolling')).toBe(false);
    const track = 800 - 8;
    const size = track / 5;
    expect(parseFloat(thumb.style.height)).toBeCloseTo(size, 1);
    const offset = Number(/translate3d\([^,]+,\s*([\d.]+)px/.exec(thumb.style.transform)?.[1]);
    expect(offset).toBeCloseTo(4 + 0.5 * (track - size), 1);

    // A moment after the page stops, it fades away again.
    act(() => vi.advanceTimersByTime(1000));
    expect(bar.hasAttribute('data-active')).toBe(false);
    expect(document.documentElement.hasAttribute('data-scrolling')).toBe(false);
  });

  it('marks an inner area while it scrolls, without showing the page thumb', () => {
    layPage({ total: 4000, view: 800, scrollY: 0 });
    const { container } = render(
      <>
        <ScrollbarActivity />
        <div data-testid="list" />
      </>,
    );
    const list = container.querySelector<HTMLElement>('[data-testid="list"]')!;
    act(() => {
      list.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(1);
    });
    expect(list.hasAttribute('data-scrolling')).toBe(true);
    expect(container.querySelector('.page-scrollbar')!.hasAttribute('data-active')).toBe(false);
    act(() => vi.advanceTimersByTime(1000));
    expect(list.hasAttribute('data-scrolling')).toBe(false);
  });
});

/** The page scrolls where it's told (jsdom doesn't scroll), and says so as a browser would. */
function stubScrolling() {
  return vi.spyOn(window, 'scrollTo').mockImplementation(((options?: ScrollToOptions | number) => {
    const top = typeof options === 'object' ? (options.top ?? window.scrollY) : window.scrollY;
    Object.defineProperty(window, 'scrollY', { configurable: true, value: top });
    document.dispatchEvent(new Event('scroll'));
  }) as typeof window.scrollTo);
}

function reduceMotion() {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {} }));
}

const mouse = (type: string, init: PointerEventInit = {}) =>
  new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', button: 0, clientX: 1018, ...init });

/** A 4000px page in an 800px window, with the mouse brought to the right edge (so the strip takes clicks). */
function mountAtEdge() {
  layPage({ total: 4000, view: 800, scrollY: 0 });
  const scrollTo = stubScrolling();
  const { container } = render(<ScrollbarActivity />);
  const bar = container.querySelector<HTMLElement>('.page-scrollbar')!;
  act(() => {
    window.dispatchEvent(mouse('pointermove', { clientY: 400 }));
    vi.advanceTimersByTime(1);
  });
  return { bar, scrollTo };
}

// The thumb on that page: a fifth of the 792px track (4px in from each end), with 633.6px to travel over 3200px.
const SIZE = 792 / 5;
const TRAVEL = 792 - SIZE;
const PAGE = 800 * 0.875;

describe('ScrollbarActivity: using the page scrollbar with a mouse', () => {
  it('takes clicks only while the mouse is at the edge, not just because the page moved', () => {
    layPage({ total: 4000, view: 800, scrollY: 0 });
    const { container } = render(<ScrollbarActivity />);
    const bar = container.querySelector<HTMLElement>('.page-scrollbar')!;
    act(() => {
      document.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(1);
    });
    expect(bar.hasAttribute('data-active')).toBe(true);
    expect(bar.hasAttribute('data-reachable')).toBe(false);
    act(() => {
      window.dispatchEvent(mouse('pointermove', { clientX: 1010, clientY: 400 }));
      vi.advanceTimersByTime(1);
    });
    expect(bar.hasAttribute('data-reachable')).toBe(true);
    act(() => {
      window.dispatchEvent(mouse('pointermove', { clientX: 600, clientY: 400 }));
      vi.advanceTimersByTime(1);
    });
    expect(bar.hasAttribute('data-reachable')).toBe(false);
  });

  it('pages down a click on the track below the thumb, and back up a click above it', () => {
    reduceMotion();
    const { bar, scrollTo } = mountAtEdge();
    act(() => {
      bar.dispatchEvent(mouse('pointerdown', { clientY: 600 }));
      bar.dispatchEvent(mouse('pointerup', { clientY: 600 }));
    });
    expect(window.scrollY).toBeCloseTo(PAGE, 5);
    expect(scrollTo).toHaveBeenCalledTimes(1);

    act(() => {
      bar.dispatchEvent(mouse('pointerdown', { clientY: 20 }));
      bar.dispatchEvent(mouse('pointerup', { clientY: 20 }));
    });
    expect(window.scrollY).toBe(0);
  });

  it('keeps paging while the track is held, and stops once the thumb reaches the pointer', () => {
    reduceMotion();
    const { bar } = mountAtEdge();
    act(() => bar.dispatchEvent(mouse('pointerdown', { clientY: 700 })));
    expect(bar.hasAttribute('data-held')).toBe(true);
    expect(window.scrollY).toBeCloseTo(PAGE, 5);
    act(() => vi.advanceTimersByTime(2000));
    // Four pages put the thumb (558px to 717px) under the pointer at 700px; a fifth would carry it past.
    expect(window.scrollY).toBeCloseTo(4 * PAGE, 5);
    const thumbTop = 4 + ((4 * PAGE) / 3200) * TRAVEL;
    expect(thumbTop).toBeLessThan(700);
    expect(thumbTop + SIZE).toBeGreaterThan(700);

    // Moving further down while still holding carries on to the end.
    act(() => {
      bar.dispatchEvent(mouse('pointermove', { clientY: 790 }));
      vi.advanceTimersByTime(500);
    });
    expect(window.scrollY).toBe(3200);
    act(() => bar.dispatchEvent(mouse('pointerup', { clientY: 790 })));
    expect(bar.hasAttribute('data-held')).toBe(false);
  });

  it('drags from anywhere on the thumb’s row, the whole strip wide', () => {
    reduceMotion();
    const { bar, scrollTo } = mountAtEdge();
    act(() => bar.dispatchEvent(mouse('pointerdown', { clientX: 1011, clientY: 80 })));
    expect(bar.hasAttribute('data-dragging')).toBe(true);
    expect(scrollTo).not.toHaveBeenCalled();
    act(() => bar.dispatchEvent(mouse('pointermove', { clientX: 1011, clientY: 180 })));
    expect(window.scrollY).toBeCloseTo(100 * (3200 / TRAVEL), 5);
    act(() => bar.dispatchEvent(mouse('pointerup', { clientY: 180 })));
    expect(bar.hasAttribute('data-dragging')).toBe(false);
  });

  it('jumps to a Shift-clicked spot, with the thumb in hand', () => {
    const { bar } = mountAtEdge();
    act(() => bar.dispatchEvent(mouse('pointerdown', { clientY: 600, shiftKey: true })));
    const jumped = ((600 - 4 - SIZE / 2) / TRAVEL) * 3200;
    expect(window.scrollY).toBeCloseTo(jumped, 5);
    act(() => bar.dispatchEvent(mouse('pointermove', { clientY: 650 })));
    expect(window.scrollY).toBeCloseTo(jumped + 50 * (3200 / TRAVEL), 5);
    act(() => bar.dispatchEvent(mouse('pointerup', { clientY: 650 })));
  });

  it('glides a page without overshooting, and lets the wheel take over mid-glide', () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 16) as unknown as number);
    const { bar, scrollTo } = mountAtEdge();
    act(() => {
      bar.dispatchEvent(mouse('pointerdown', { clientY: 600 }));
      bar.dispatchEvent(mouse('pointerup', { clientY: 600 }));
    });
    act(() => vi.advanceTimersByTime(2000));
    const stops = scrollTo.mock.calls.map(([options]) => (options as ScrollToOptions).top!);
    expect(stops.length).toBeGreaterThan(5);
    expect(stops.every((top, i) => i === 0 || top >= stops[i - 1]!)).toBe(true);
    expect(stops.at(-1)).toBe(PAGE);

    // Another click starts a glide; the wheel moves the page meanwhile, and the glide lets go.
    scrollTo.mockClear();
    act(() => {
      bar.dispatchEvent(mouse('pointerdown', { clientY: 700 }));
      bar.dispatchEvent(mouse('pointerup', { clientY: 700 }));
      vi.advanceTimersByTime(48);
    });
    const before = scrollTo.mock.calls.length;
    expect(before).toBeGreaterThan(0);
    layPage({ total: 4000, view: 800, scrollY: 1000 });
    act(() => vi.advanceTimersByTime(2000));
    expect(scrollTo.mock.calls.length).toBe(before);
    expect(window.scrollY).toBe(1000);
  });

  it('leaves touch alone: on a touch screen the bar is only an indicator', () => {
    reduceMotion();
    const { bar, scrollTo } = mountAtEdge();
    act(() => bar.dispatchEvent(mouse('pointerdown', { pointerType: 'touch', clientY: 600 })));
    expect(scrollTo).not.toHaveBeenCalled();
    expect(bar.hasAttribute('data-held')).toBe(false);
  });
});
