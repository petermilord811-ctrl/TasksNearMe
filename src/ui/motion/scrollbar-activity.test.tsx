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
    expect(document.documentElement.hasAttribute('data-scrolling')).toBe(true);
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
