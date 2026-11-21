'use client';

import { useEffect, useState, useSyncExternalStore, type RefObject } from 'react';
import { pinnedArrivalProgress } from './map-math';

/**
 * The live map's arrival under the hero as one number, from 0 (close and tilted over the hero's first task, as the
 * town looked) to 1 (flat over the whole city), shared by the camera and the panels that come in with it.
 *
 * Wide screens: once the map's sheet has covered the hero, its stage stays pinned to the window and the next
 * `ARRIVAL_SCROLL` of a screen of scrolling pulls the camera back while the map itself doesn't move. The number
 * follows the scroll through a short ease (`FOLLOW_MS`), so a mouse wheel's steps glide instead of jumping, and it
 * runs back the same way. Phones and tablets: it plays by itself, once, when the map is mostly in view (scrubbing a
 * camera with a thumb on a small screen is tiring, and the map isn't pinned there). Reduced motion: it's 1.
 *
 * The visitor taking over (a gesture on the map, a pick in the explorer, a request to show something) finishes it:
 * 1 from then on, and the camera stays where the visitor puts it.
 */
export interface ArrivalSource {
  /** Where the arrival is now (0–1). */
  get(): number;
  /** Called on every change (in an animation frame), and right away with the current value. */
  subscribe(listener: (progress: number) => void): () => void;
  /** The visitor took over (or the arrival was skipped): no more following. */
  finished(): boolean;
  /** Lands it now and stops following, for good. */
  finish(): void;
}

export interface ArrivalDriver extends ArrivalSource {
  /** Follows a new target (the scroll), easing toward it; `immediate` jumps there (the first read, a resize). */
  follow(target: number, immediate?: boolean): void;
  /** Plays from where it is to 1 over `durationMs` (phones). */
  play(durationMs: number): void;
  destroy(): void;
}

/** Wide screens: where the map is pinned to the window and its arrival follows the scroll. */
export const WIDE_QUERY = '(min-width: 1024px)';
/** How much of a screen's height of scrolling the pinned arrival takes on wide screens. */
export const ARRIVAL_SCROLL = 0.8;
/** After the arrival, the map stays pinned for this much more (a screen's height), so it can be used in place. */
export const ARRIVAL_HOLD = 0.3;
/** How quickly the number catches up with the scroll (the time constant of its ease, ms). */
const FOLLOW_MS = 110;
/** The phones' arrival, played once (ms). */
export const ARRIVAL_PLAY_MS = 2600;
/**
 * From here on the page's panels and the map's own buttons are there to use: the explorer takes clicks, the map's
 * controls show. They come in over the second half of the arrival, so the camera has the first half to itself.
 */
export const ARRIVAL_PANELS_AT = 0.55;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const noSubscription = () => () => {};

export function createArrival(initial = 0): ArrivalDriver {
  let current = clamp01(initial);
  let target = current;
  let done = false;
  let frame = 0;
  let last = 0;
  let playing: { from: number; start: number; duration: number } | null = null;
  const listeners = new Set<(progress: number) => void>();
  const emit = () => {
    for (const listener of listeners) listener(current);
  };
  const stop = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
  };
  const step = (now: number) => {
    frame = 0;
    if (playing) {
      const t = clamp01((now - playing.start) / playing.duration);
      current = playing.from + (1 - playing.from) * t;
      if (t >= 1) playing = null;
    } else {
      const dt = last ? Math.min(64, now - last) : 16;
      current += (target - current) * (1 - Math.exp(-dt / FOLLOW_MS));
      if (Math.abs(target - current) < 0.0006) current = target;
    }
    last = now;
    emit();
    if (playing || current !== target) frame = requestAnimationFrame(step);
    else last = 0;
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(step);
  };

  return {
    get: () => current,
    subscribe(listener) {
      listeners.add(listener);
      listener(current);
      return () => listeners.delete(listener);
    },
    finished: () => done,
    finish() {
      if (done) return;
      done = true;
      playing = null;
      stop();
      current = 1;
      target = 1;
      emit();
    },
    follow(next, immediate = false) {
      if (done || playing) return;
      target = clamp01(next);
      if (immediate) {
        stop();
        current = target;
        emit();
        return;
      }
      if (target !== current) schedule();
    },
    play(durationMs) {
      if (done || playing || current >= 1) return;
      target = 1;
      playing = { from: current, start: performance.now(), duration: Math.max(1, durationMs) };
      stop();
      schedule();
    },
    destroy() {
      stop();
      listeners.clear();
    },
  };
}

/**
 * Runs the page's arrival (see the top of this file) and returns it. `track`: the map's section (its top edge starts
 * the pinned stretch); `stage`: the pinned part, which gets `--arrive` (0–1) on wide screens for the panels that come
 * in with it; `frame`: the map's box (phones play the arrival when it's mostly in view); `panel`: the explorer (focus
 * in it lands the arrival, and it can't be clicked while it's still coming in). `enabled`: there's a task to arrive at
 * and a live map to move; `liveReady`: the live map is up (phones wait for it).
 */
export function useArrivalDriver({
  track,
  stage,
  frame,
  panel,
  wide,
  enabled,
  liveReady,
  reduced,
}: {
  track: RefObject<HTMLElement | null>;
  stage: RefObject<HTMLElement | null>;
  frame: RefObject<HTMLElement | null>;
  panel: RefObject<HTMLElement | null>;
  wide: boolean;
  enabled: boolean;
  liveReady: boolean;
  reduced: boolean;
}): ArrivalSource {
  const [driver] = useState(() => createArrival(0));
  useEffect(() => () => driver.destroy(), [driver]);
  // `reduced` says true until the page has hydrated (so nothing moves before the browser answers): only its answer
  // after that counts, or every visit would skip the arrival.
  const hydrated = useSyncExternalStore(noSubscription, () => true, () => false);

  // Nothing to arrive at (no tasks yet, the drawn map only), or motion isn't welcome: it's simply there.
  useEffect(() => {
    if (!enabled || (hydrated && reduced)) driver.finish();
  }, [driver, enabled, hydrated, reduced]);

  // Wide screens: the explorer comes in with it (a variable on the stage, written each frame), and can't be clicked
  // until it's mostly there.
  useEffect(() => {
    const element = stage.current;
    const explorer = panel.current;
    if (!element || !wide) return;
    const stop = driver.subscribe((progress) => {
      element.style.setProperty('--arrive', progress.toFixed(4));
      if (explorer) explorer.style.pointerEvents = progress < ARRIVAL_PANELS_AT ? 'none' : '';
    });
    return () => {
      stop();
      element.style.removeProperty('--arrive');
      if (explorer) explorer.style.pointerEvents = '';
    };
  }, [driver, wide, stage, panel]);

  // Wide screens: it follows the scroll through the pinned stretch.
  useEffect(() => {
    const element = track.current;
    if (!element || !wide || !enabled || reduced) return;
    let raf = 0;
    const read = (immediate: boolean) => {
      raf = 0;
      driver.follow(pinnedArrivalProgress(element.getBoundingClientRect().top, window.innerHeight * ARRIVAL_SCROLL), immediate);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(() => read(false));
    };
    const onResize = () => read(true);
    read(true);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, [driver, track, wide, enabled, reduced]);

  // Phones and tablets: it plays once, when the live map is up and mostly in view. (Asked of the window too: `wide`
  // starts false until the page has hydrated, and on a wide screen the map is pinned, so always "in view".)
  useEffect(() => {
    const element = frame.current;
    if (wide || !enabled || reduced || !liveReady || !element) return;
    if (typeof window.matchMedia === 'function' && window.matchMedia(WIDE_QUERY).matches) return;
    if (!('IntersectionObserver' in window)) {
      driver.finish();
      return;
    }
    const seen = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        seen.disconnect();
        driver.play(ARRIVAL_PLAY_MS);
      },
      { threshold: 0.6 },
    );
    seen.observe(element);
    return () => seen.disconnect();
  }, [driver, frame, wide, enabled, reduced, liveReady]);

  // Focus in the explorer (a keyboard, a click in its search) is the visitor taking over: it lands now.
  useEffect(() => {
    const element = panel.current;
    if (!element) return;
    const onFocus = () => driver.finish();
    element.addEventListener('focusin', onFocus);
    return () => element.removeEventListener('focusin', onFocus);
  }, [driver, panel]);

  return driver;
}
