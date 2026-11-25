'use client';

import { useEffect, useState, type RefObject } from 'react';
import { useChapters } from '../chapters/chapter-stage';

/**
 * The live map's arrival under the hero as one number, from 0 (close and tilted over the hero's first task, as the
 * town looked) to 1 (flat over the whole city), shared by the camera and the map's own buttons.
 *
 * On the landing's stage (chapters/) it follows the stage's clock rather than the scroll (owner, 2026-11-24: "imagine
 * you are scrolling not that smoothly, but like human"): it's 0 while the window onto the map opens around the hero's
 * pin, the camera then pulls back on the step's own time, and it runs back the same way when the visitor scrolls back
 * up. Off the stage (reduced motion, a stage that isn't running) it's simply 1, and previews and tests (`enabled`
 * false) have no arrival at all.
 *
 * The visitor taking over (a gesture on the map, a pick in the explorer, focus in it, a request to show something)
 * finishes it: 1 from then on, and the camera stays where the visitor puts it.
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
  /** On the landing's stage: where the hero's first task pin is on the screen (px in the map). The task starts there. */
  anchor?(): { x: number; y: number } | null;
  /** On the landing's stage: how far the window onto the map has opened (0–1): the first view creeps closer meanwhile. */
  lead?(): number;
}

/** Wide screens: where the map fills the stage beside the explorer. */
export const WIDE_QUERY = '(min-width: 1024px)';
/**
 * From here on the map's own buttons are there to use: they come in over the second half of the pull back, so the
 * camera has the first half to itself.
 */
export const ARRIVAL_PANELS_AT = 0.55;

export interface StagedArrival extends ArrivalSource {
  /** The stage's clock moved (or the hero's pin did): the pull back's progress and how far the window has opened. */
  set(progress: number, lead: number): void;
}

export function createStagedArrival(anchor: () => { x: number; y: number } | null): StagedArrival {
  let progress = 1;
  let opened = 1;
  let done = false;
  /** Where the pin was when the listeners last heard: a pin that moves (a resize, the town settling) is news too. */
  let told: { x: number; y: number } | null = null;
  const listeners = new Set<(progress: number) => void>();
  return {
    get: () => (done ? 1 : progress),
    subscribe(listener) {
      listeners.add(listener);
      if (!done) told = anchor();
      listener(done ? 1 : progress);
      return () => listeners.delete(listener);
    },
    finished: () => done,
    finish() {
      if (done) return;
      done = true;
      for (const listener of listeners) listener(1);
    },
    anchor: () => (done ? null : anchor()),
    lead: () => opened,
    set(next, lead) {
      if (done) return;
      const at = anchor();
      const moved = at && told ? Math.abs(at.x - told.x) >= 0.5 || Math.abs(at.y - told.y) >= 0.5 : at !== told;
      if (next === progress && lead === opened && !moved) return;
      progress = next;
      opened = lead;
      told = at;
      for (const listener of listeners) listener(progress);
    },
  };
}

/**
 * The map's arrival on the landing's stage (see the top of this file). `panel`: the explorer (focus in it is the
 * visitor taking over). `enabled`: there's a task to arrive at and a live map to move.
 */
export function useStagedArrival({ panel, enabled }: { panel: RefObject<HTMLElement | null>; enabled: boolean }): ArrivalSource {
  const chapters = useChapters();
  const [source] = useState(() => createStagedArrival(() => chapters?.pin() ?? null));

  useEffect(() => {
    if (!enabled || !chapters) {
      source.finish();
      return;
    }
    // Off the stage (reduced motion, or before the page knows) the map is simply there: the city view. On it, the
    // store also calls this when the hero's pin moves, so a map waiting at rest keeps the task under the pin.
    return chapters.subscribe((_, moment) => {
      if (chapters.on()) source.set(moment.pullBack, moment.ring ?? 0);
      else source.set(1, 1);
    });
  }, [source, chapters, enabled]);

  // Focus in the explorer (a keyboard, a click in its search) is the visitor taking over: it lands now.
  useEffect(() => {
    const element = panel.current;
    if (!element) return;
    const onFocus = () => source.finish();
    element.addEventListener('focusin', onFocus);
    return () => element.removeEventListener('focusin', onFocus);
  }, [source, panel]);

  return source;
}
