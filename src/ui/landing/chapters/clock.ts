/**
 * The landing's chapters, as plain math (owner, 2026-11-25: "when I scroll a little, animation is also changed a little
 * by scroll height ... and make it feel smooth", after a first version played each step to its end on its own). The
 * town, the live map and the categories share one pinned stage, and how far the page has scrolled into its pinned
 * stretch is how far the stage has moved: 0 the town, 1 the map, 2 the categories with the map docked in their grid.
 *
 * - The stretch is cut into step one, a stop at the map, step two and a stop at the categories (`SPANS`). On a stop the
 *   value holds, so the map and the grid can be used without the scene drifting. The map's stop is about a screen and a
 *   half of scrolling (owner, 2026-11-25: "in map, give enough time to not change by scrolling ... if bottom scroll
 *   exceeds limit, minimze map", then "make users need more scroll (* 1.5)"), and a link or a key that goes to the map
 *   lands near its start, with most of that room still ahead (`restOffset`).
 * - What the stage draws follows the scroll with a short ease (`ease`, a time constant in ms): wheel notches, flicks and
 *   a jerky hand become one smooth motion that is never more than a moment behind and never plays on by itself.
 *
 * `value` is what the stage draws: 0 to 2.
 */

export type Chapter = 0 | 1 | 2;

/**
 * Shares of the pinned stretch (`--chapter-track`, 335svh): step one, the stop at the map, step two, the stop at the
 * categories (they add up to 1). In screens: about 0.9, 1.5, 0.7 and 0.23.
 */
export const SPANS = { one: 0.27, mapStop: 0.45, two: 0.21, gridStop: 0.07 } as const;

/**
 * Where a link or a key that goes to the map lands, as a share of the stretch: a fifth into its stop. landing.css places
 * the map's rest marker (`[data-chapter-map-rest]`) and the map section's scroll margin with this same share.
 */
export const MAP_REST_SHARE = SPANS.one + SPANS.mapStop * 0.2;

/** The ease of the stage behind the scroll on wide screens, and on touch screens (ms, a time constant). */
export const EASE_MS = { wide: 140, touch: 90 } as const;

/** Under this distance from the scroll (in chapters) the stage has arrived. */
const SETTLED = 0.0015;
/** A frame longer than this (a hidden tab, a long task) counts as this long, so the stage doesn't leap (ms). */
const LONGEST_FRAME_MS = 100;

/** What the stage shows `offset` px into a pinned stretch `length` px long (0–2). */
export function valueAt(offset: number, length: number): number {
  if (!(length > 0) || offset <= 0) return 0;
  const t = offset / length;
  const mapStop = SPANS.one + SPANS.mapStop;
  const two = mapStop + SPANS.two;
  if (t < SPANS.one) return t / SPANS.one;
  if (t <= mapStop) return 1;
  if (t < two) return 1 + (t - mapStop) / SPANS.two;
  return 2;
}

/**
 * Where going to a chapter lands (px into the stretch): the top for the town, early in the map's stop, the middle of the
 * categories' stop.
 */
export function restOffset(chapter: Chapter, length: number): number {
  if (chapter === 0) return 0;
  if (chapter === 1) return length * MAP_REST_SHARE;
  return length * (SPANS.one + SPANS.mapStop + SPANS.two + SPANS.gridStop / 2);
}

export interface ClockFrame {
  /** What the stage draws (0–2). */
  value: number;
  /** Where the scroll is (0–2): the value eases toward it. */
  target: number;
  /** Still easing: call `step` again next frame. */
  busy: boolean;
}

export interface ChapterClock {
  /** A new scroll offset into the pinned stretch (px). */
  scroll(offset: number): void;
  /** The stretch's new length (px), after a resize. */
  resize(length: number): void;
  /** Eases the value toward the scroll, to `now` (ms): one call per animation frame while `busy`. */
  step(now: number): ClockFrame;
  /** Sets the value for `offset` at once, without easing (a first reading, a held moment released). */
  jump(offset: number): void;
  /** Where the scroll is now (px). */
  offset(): number;
}

export function createChapterClock(length: number, start = 0, ease: number = EASE_MS.wide): ChapterClock {
  let stretch = length;
  let y = start;
  let value = valueAt(start, stretch);
  /** The previous frame's time, or 0 when the value was at rest (the next frame counts as an ordinary one). */
  let last = 0;
  return {
    scroll(next) {
      y = next;
    },
    resize(next) {
      stretch = next;
    },
    step(now) {
      const target = valueAt(y, stretch);
      const elapsed = last ? Math.min(LONGEST_FRAME_MS, Math.max(0, now - last)) : 16;
      value += (target - value) * (1 - Math.exp(-elapsed / ease));
      if (Math.abs(target - value) < SETTLED) value = target;
      const busy = value !== target;
      last = busy ? now : 0;
      return { value, target, busy };
    },
    jump(next) {
      y = next;
      value = valueAt(y, stretch);
      last = 0;
    },
    offset: () => y,
  };
}
