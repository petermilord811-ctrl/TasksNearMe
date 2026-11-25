'use client';

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { usePrefersReducedMotion } from '@/ui/motion';
import { devHelpersOn } from '@/shared/dev-helpers';
import { MAP_LANDED_ATTRIBUTE } from '../landing-state';
import { createChapterClock, EASE_MS, restOffset, type Chapter } from './clock';
import { stageMoment, type StageMoment } from './timeline';

/** Wide screens (the town beside the words) ease the stage a little longer behind the wheel than touch screens. */
export const CHAPTERS_WIDE_QUERY = '(min-width: 1024px)';

type Listener = (value: number, moment: StageMoment) => void;
export type ChapterMode = 'pending' | 'on' | 'off';

/**
 * The stage's clock, shared by its layers (the town, the map with its panels, the categories): each subscribes and
 * writes its own styles in the same animation frame, so nothing re-renders as it moves. `on` is false where the
 * layers sit one after another as plain sections (reduced motion, previews and tests, before the page knows).
 */
export interface ChapterStore {
  /**
   * Whether the stage runs its chapters: 'pending' until the page knows (hydration, the visitor's motion setting),
   * then 'on', or 'off' where the layers are plain sections. Nothing that depends on it should start while pending.
   */
  mode(): ChapterMode;
  on(): boolean;
  /** The value the stage draws (0 the town, 1 the map, 2 the categories); `listener` is called with each new one. */
  value(): number;
  subscribe(listener: Listener): () => void;
  /** Where the hero's first task pin sits on the stage (px from its top-left corner): the window opens there. */
  pin(): { x: number; y: number } | null;
  setPin(point: { x: number; y: number } | null): void;
  /** Scrolls the page to a chapter. */
  goTo(chapter: Chapter, behavior?: ScrollBehavior): void;
}

const ChapterContext = createContext<ChapterStore | null>(null);

/** The stage's clock, or null outside a stage (previews of a single section). */
export function useChapters(): ChapterStore | null {
  return useContext(ChapterContext);
}

/** Calls `listener` with every value of the stage's clock (in its animation frame), and once right away. */
export function useChapterFrame(listener: Listener, active = true): void {
  const store = useChapters();
  const latest = useRef(listener);
  useLayoutEffect(() => {
    latest.current = listener;
  });
  useEffect(() => {
    if (!store || !active) return;
    return store.subscribe((value, moment) => latest.current(value, moment));
  }, [store, active]);
}

/** Whether the stage is running its chapters (else its layers are plain sections). */
export function useChaptersOn(): boolean {
  return useChaptersMode() === 'on';
}

/** The stage's mode ('off' outside a stage, as for a section previewed on its own). */
export function useChaptersMode(): ChapterMode {
  const store = useChapters();
  return useSyncExternalStore(
    (onChange) => (store ? store.subscribe(onChange) : () => {}),
    () => store?.mode() ?? 'off',
    () => (store ? 'pending' : 'off'),
  );
}

const noSubscription = () => () => {};

function useWide(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== 'function') return () => {};
      const list = window.matchMedia(CHAPTERS_WIDE_QUERY);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => typeof window.matchMedia === 'function' && window.matchMedia(CHAPTERS_WIDE_QUERY).matches,
    () => true,
  );
}

function createStore(): ChapterStore & { publish(value: number): void; setMode(mode: ChapterMode): void; bind(goTo: ChapterStore['goTo']): void } {
  const listeners = new Set<Listener>();
  let current = 0;
  let running: ChapterMode = 'pending';
  let point: { x: number; y: number } | null = null;
  let go: ChapterStore['goTo'] = () => {};
  const emit = () => {
    const moment = stageMoment(current);
    for (const listener of listeners) listener(current, moment);
  };
  return {
    mode: () => running,
    on: () => running === 'on',
    value: () => current,
    subscribe(listener) {
      listeners.add(listener);
      listener(current, stageMoment(current));
      return () => listeners.delete(listener);
    },
    pin: () => point,
    setPin(next) {
      if (next && point && Math.abs(next.x - point.x) < 0.5 && Math.abs(next.y - point.y) < 0.5) return;
      point = next;
      emit();
    },
    goTo: (chapter, behavior) => go(chapter, behavior),
    publish(value) {
      if (value === current) return;
      current = value;
      emit();
    },
    setMode(next) {
      if (next === running) return;
      running = next;
      emit();
    },
    bind(next) {
      go = next;
    },
  };
}

/**
 * The landing's first three chapters on one pinned stage (owner, 2026-11-24: "Deeply let's re-design the section swtich
 * animation in first landing page"): the hero's town, the live map with its card and explorer, and the categories with
 * the map docked as their first tile. The stage stays pinned for a stretch of scrolling (`--chapter-track`: about two
 * screens), and the scroll moves it along (owner, 2026-11-25: "when I scroll a little, animation is also changed a
 * little by scroll height ... and make it feel smooth"): `clock.ts` turns the scroll into how far the stage is, eased a
 * moment behind the hand, and the layers draw that moment (`timeline.ts`). With reduced motion, in previews and tests
 * (`enabled` false) the layers are plain sections, one after another, as they were.
 */
export function ChapterStage({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [store] = useState(createStore);
  const reduced = usePrefersReducedMotion();
  // The motion setting is only known once the page has hydrated (`reduced` says true until then): pending meanwhile.
  const hydrated = useSyncExternalStore(noSubscription, () => true, () => false);
  const wide = useWide();
  const mode: ChapterMode = !enabled ? 'off' : !hydrated ? 'pending' : reduced ? 'off' : 'on';
  const on = mode === 'on';
  const ease = wide ? EASE_MS.wide : EASE_MS.touch;

  useEffect(() => {
    store.setMode(mode);
    if (mode !== 'on') store.publish(0);
  }, [store, mode]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || !on) return;
    // The track's place on the page and the length of its pinned stretch, kept on resize (never read while scrolling).
    const stage = track.querySelector<HTMLElement>('[data-chapter-stage]');
    let top = 0;
    let length = 1;
    const measure = () => {
      top = track.getBoundingClientRect().top + window.scrollY;
      length = Math.max(1, track.offsetHeight - (stage?.offsetHeight ?? window.innerHeight));
    };
    measure();
    const clock = createChapterClock(length, window.scrollY - top, ease);
    let frame = 0;
    /** A value held by the dev helpers (screenshots of any moment), or null. */
    let held: number | null = null;
    const step = (now: number) => {
      frame = 0;
      if (held !== null) return;
      const next = clock.step(now);
      store.publish(next.value);
      if (next.busy) frame = requestAnimationFrame(step);
    };
    const kick = () => {
      if (!frame) frame = requestAnimationFrame(step);
    };
    const onScroll = () => {
      clock.scroll(window.scrollY - top);
      kick();
    };
    // A resize (or the page growing as its pictures arrive) moves the track and can change its length: read them again.
    const onResize = () => {
      measure();
      clock.resize(length);
      onScroll();
    };
    store.bind((chapter, behavior = 'smooth') => {
      window.scrollTo({ top: top + restOffset(chapter, length), behavior });
    });
    // Development and the e2e build only: hold the stage at any moment, for screenshots and checks.
    const debug = devHelpersOn()
      ? {
          hold: (value: number) => {
            held = value;
            cancelAnimationFrame(frame);
            frame = 0;
            store.publish(value);
          },
          release: () => {
            held = null;
            clock.jump(window.scrollY - top);
            kick();
          },
          value: () => store.value(),
          offset: () => window.scrollY - top,
        }
      : null;
    if (debug) (window as unknown as { __tnmChapters?: typeof debug }).__tnmChapters = debug;
    const sized = typeof ResizeObserver === 'function' ? new ResizeObserver(onResize) : null;
    sized?.observe(track);
    sized?.observe(document.body);
    window.addEventListener('scroll', onScroll, { passive: true });
    kick();
    return () => {
      cancelAnimationFrame(frame);
      sized?.disconnect();
      window.removeEventListener('scroll', onScroll);
      store.bind(() => {});
      if (debug) delete (window as unknown as { __tnmChapters?: unknown }).__tnmChapters;
    };
  }, [store, on, ease]);

  // The town stops being drawn once the window onto the map covers it, and the categories are there from step two on.
  useEffect(() => {
    const track = trackRef.current;
    if (!track || !on) return;
    const town = track.querySelector<HTMLElement>('[data-chapter-layer="town"]');
    const grid = track.querySelector<HTMLElement>('[data-chapter-layer="grid"]');
    // Faded rather than hidden, so a keyboard can still reach what's on them: focus in a layer brings its chapter.
    const stop = store.subscribe((_, moment) => {
      if (town) {
        town.style.opacity = moment.townShown ? '' : '0';
        town.style.pointerEvents = moment.townShown ? '' : 'none';
      }
      if (grid) {
        grid.style.opacity = moment.gridShown ? '1' : '';
        grid.style.pointerEvents = moment.two > 0.6 ? 'auto' : '';
      }
    });
    const onFocus = (event: FocusEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const named = target?.closest<HTMLElement>('[data-chapter-focus]')?.dataset.chapterFocus;
      const layer = target?.closest<HTMLElement>('[data-chapter-layer]')?.dataset.chapterLayer;
      const chapter = named !== undefined ? Number(named) : layer === 'town' ? 0 : layer === 'map' ? 1 : layer === 'grid' ? 2 : null;
      if (chapter === null || Math.round(store.value()) === chapter) return;
      store.goTo(chapter as Chapter, 'auto');
    };
    track.addEventListener('focusin', onFocus);
    return () => {
      stop();
      track.removeEventListener('focusin', onFocus);
      for (const layer of [town, grid]) {
        layer?.style.removeProperty('opacity');
        layer?.style.removeProperty('pointer-events');
      }
    };
  }, [store, on]);

  return (
    <ChapterContext value={store}>
      <div
        ref={trackRef}
        data-chapters={enabled ? 'on' : 'off'}
        className="relative [--chapter-track:190svh] lg:[--chapter-track:210svh]"
      >
        <div data-chapter-stage="">{children}</div>
        {/* Where "see it on the map" lands (`scrollToMap`): the middle of the map's stop (landing.css, `MAP_REST_SHARE`). */}
        <span data-chapter-map-rest="" {...(on ? { [MAP_LANDED_ATTRIBUTE]: '' } : {})} aria-hidden="true" className="pointer-events-none absolute left-0 h-px w-px" />
      </div>
    </ChapterContext>
  );
}
