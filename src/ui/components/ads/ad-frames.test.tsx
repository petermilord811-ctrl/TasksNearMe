/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdFrames } from './ad-frames';

// jsdom has neither IntersectionObserver nor matchMedia: an observer the test moves by hand, and motion allowed unless
// a test asks for less. Timers are fake, performance.now() included, so a hold's leftover time is exact.
const observers: IntersectionObserverCallback[] = [];
let reduceMotion = false;
let visibility: DocumentVisibilityState = 'visible';

beforeEach(() => {
  observers.length = 0;
  reduceMotion = false;
  visibility = 'visible';
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] });
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) { observers.push(callback); }
    observe() {}
    disconnect() {}
  });
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduceMotion && query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {} }));
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const frames = [
  { className: 'scene', children: 'Scene' },
  { className: 'product', children: 'Product' },
  { className: 'offer', children: 'Offer' },
];

function show() {
  const view = render(<a href="https://example.test/ad">
    <AdFrames frames={frames} durations={[1000, 2000, 1500]} placeholder={{ className: 'holder', children: 'Brand' }} rest={5000} />
  </a>);
  const stage = view.container.querySelector<HTMLElement>('.ad-stage')!;
  return {
    link: view.container.querySelector('a')!,
    stage,
    /** The frame coming in (or the only one there). */
    showing: () => (stage.querySelector('.ad-frame[data-state="in"]') ?? stage.querySelector('.ad-frame'))?.textContent,
  };
}

/** How much of the ad is on screen, as the observer reports it. */
const onScreen = (ratio: number) => act(() => {
  for (const callback of observers) callback([{ intersectionRatio: ratio } as IntersectionObserverEntry], {} as IntersectionObserver);
});
/**
 * Moves the clock a millisecond at a time, each step in its own act(): React draws a frame only when an act() ends, so
 * the next frame's timer is set at the moment the one before fired, as in a browser.
 */
function wait(ms: number) {
  if (ms === 0) act(() => { vi.advanceTimersByTime(0); });
  for (let step = 0; step < ms; step += 1) act(() => { vi.advanceTimersByTime(1); });
}

describe('AdFrames', () => {
  it('starts once half of it is on screen, plays its round, holds the offer, then plays again', () => {
    const ad = show();
    expect(ad.showing()).toBe('Brand');
    onScreen(0.3);
    wait(1000);
    expect(ad.showing()).toBe('Brand');
    expect(ad.stage).not.toHaveAttribute('data-live');

    onScreen(0.6);
    wait(0);
    expect(ad.stage).toHaveAttribute('data-live');
    expect(ad.showing()).toBe('Scene');
    // Round one: twice through.
    wait(1000);
    expect(ad.showing()).toBe('Product');
    wait(2000);
    expect(ad.showing()).toBe('Offer');
    wait(1500);
    expect(ad.showing()).toBe('Scene');
    wait(3000);
    expect(ad.showing()).toBe('Offer');
    // The round's last frame stays its time plus the rest...
    wait(1500 + 4999);
    expect(ad.showing()).toBe('Offer');
    // ...and then the ad plays again instead of staying there.
    wait(1);
    expect(ad.showing()).toBe('Scene');
    wait(1000);
    expect(ad.showing()).toBe('Product');
    expect(ad.stage).toHaveAttribute('data-live');
  });

  it('holds out of view or in a background tab, and goes on with the time that was left', () => {
    const ad = show();
    onScreen(1);
    wait(0);
    wait(600);
    onScreen(0.2);
    expect(ad.stage).toHaveAttribute('data-paused');
    wait(4000);
    expect(ad.showing()).toBe('Scene');
    onScreen(1);
    expect(ad.stage).not.toHaveAttribute('data-paused');
    wait(399);
    expect(ad.showing()).toBe('Scene');
    wait(1);
    expect(ad.showing()).toBe('Product');

    visibility = 'hidden';
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(ad.stage).toHaveAttribute('data-paused');
    wait(4000);
    expect(ad.showing()).toBe('Product');
    visibility = 'visible';
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    wait(2000);
    expect(ad.showing()).toBe('Offer');
  });

  it('keeps its frame while the pointer is on the ad', () => {
    const ad = show();
    onScreen(1);
    wait(0);
    wait(500);
    act(() => { fireEvent.pointerEnter(ad.link); });
    expect(ad.stage).toHaveAttribute('data-held');
    // Held is not paused: the frame's own moves finish, only the next frame waits.
    expect(ad.stage).not.toHaveAttribute('data-paused');
    wait(4000);
    expect(ad.showing()).toBe('Scene');
    act(() => { fireEvent.pointerLeave(ad.link); });
    expect(ad.stage).not.toHaveAttribute('data-held');
    wait(499);
    expect(ad.showing()).toBe('Scene');
    wait(1);
    expect(ad.showing()).toBe('Product');
  });

  it('keeps its frame while its link has the keyboard focus, but not after a click', () => {
    const ad = show();
    onScreen(1);
    wait(0);
    let keyboard = false;
    vi.spyOn(ad.link, 'matches').mockImplementation((selector: string) => selector === ':focus-visible' && keyboard);

    // A click focuses the link too (and it keeps the focus while the advertiser's tab is open): the ad goes on.
    act(() => { fireEvent.focusIn(ad.link); });
    expect(ad.stage).not.toHaveAttribute('data-held');
    wait(1000);
    expect(ad.showing()).toBe('Product');
    act(() => { fireEvent.focusOut(ad.link); });

    keyboard = true;
    act(() => { fireEvent.focusIn(ad.link); });
    expect(ad.stage).toHaveAttribute('data-held');
    wait(4000);
    expect(ad.showing()).toBe('Product');
    act(() => { fireEvent.focusOut(ad.link); });
    wait(2000);
    expect(ad.showing()).toBe('Offer');
  });

  it('with reduced motion shows the offer and never moves', () => {
    reduceMotion = true;
    const ad = show();
    onScreen(1);
    wait(20_000);
    expect(ad.showing()).toBe('Offer');
    expect(ad.stage).not.toHaveAttribute('data-live');
  });
});
