/**
 * The landing's chapters, as plain math (owner, 2026-11-24: "imagine you are scrolling not that smoothly, but like
 * human in both laptop and phone. redesign the switch animation"). The town, the live map and the categories share one
 * pinned stage, and the scroll only picks which chapter to show: 0 the town, 1 the map, 2 the categories with the map
 * docked in their grid. The stage then walks there on its own clock, at the step's own pace, however fast, slow or
 * jerky the hand was, so it never rests halfway between two chapters.
 *
 * - Forward and back lines are separate (`forward` is further on than `back`), and read in the direction the hand is
 *   really going (a turn counts after `DEADBAND` px), so one notch back or a shaky thumb doesn't rewind a step.
 * - A step reverses from wherever it is when the hand turns back, a little faster than it plays forward.
 * - Two chapters behind (a fling, the End key, a link lower down): the steps play faster, back to back.
 * - Near the end of the pinned stretch (`hurry` px before `track`), and once the stage is leaving, a step that hasn't
 *   landed speeds up, so the stage never scrolls away half done.
 * - A small scroll toward the next line previews the step (its first tenth): the scene leans in while the hand is
 *   moving or holding, and settles back if it stops short of the line. Past the line, the step starts from there.
 *
 * `value` is what the stage draws: 0 to 2, the chapter clock plus the preview.
 */

export type Chapter = 0 | 1 | 2;

export interface ChapterLines {
  /** Past these scroll offsets into the pinned stretch (px), moving forward: the map, then the categories. */
  forward: readonly [number, number];
  /**
   * Above these, moving back: the town again, then the map again. On a laptop each sits below its forward line (a
   * notch back doesn't rewind); on a phone above it (a flick back commits as soon as it heads for the page before).
   * Lines are only read in the direction the hand is going, so neither flickers.
   */
  back: readonly [number, number];
  /** How far before each forward line a small scroll starts to preview its step (px). */
  preview: readonly [number, number];
  /** Where the stage stops being pinned and scrolls away (px). */
  track: number;
  /** How far before `track` an unfinished step starts to hurry (px; 0 where a flick stops at each chapter). */
  hurry: number;
  /** Each step's length, forward (ms): town to map, map to categories. */
  durations: readonly [number, number];
}

export interface ClockFrame {
  /** What the stage draws (0–2). */
  value: number;
  /** The chapter the stage is heading for. */
  target: Chapter;
  /** How much faster than its own pace the step runs now (1 when it isn't catching up). */
  speed: number;
  /** Something is still moving: call `step` again next frame. */
  busy: boolean;
}

export interface ChapterClock {
  /** A new scroll offset into the pinned stretch (px), read at `now` (ms). */
  scroll(y: number, now: number): void;
  /** A finger is on the screen (the preview holds while it rests). */
  hold(holding: boolean): void;
  /** Advances the clock to `now` (ms): one call per animation frame while `busy`. */
  step(now: number): ClockFrame;
  /** Sets the chapter for `y` at once, without a step (the first reading, a new layout). */
  jump(y: number): void;
  /** Where the hand is now (px). */
  offset(): number;
}

/** A turn of the hand counts once it has come back this far (px). */
const DEADBAND = 10;
/** Going back plays this much faster than going forward. */
const REVERSE = 1.35;
/** The preview shows this share of the next step at most. */
const PREVIEW = 0.1;
/** The hand counts as moving for this long after a scroll (ms). */
const ACTIVE_MS = 200;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** The chapter a scroll offset falls in, read from the forward lines (a first reading has no direction yet). */
export function chapterAt(lines: ChapterLines, y: number): Chapter {
  if (y >= lines.forward[1]) return 2;
  if (y >= lines.forward[0]) return 1;
  return 0;
}

export function createChapterClock(lines: ChapterLines, start = 0): ChapterClock {
  let y = start;
  let direction = 1;
  let extreme = start;
  let target: Chapter = chapterAt(lines, start);
  let clock: number = target;
  let preview = 0;
  let envelope = 0;
  let lastScroll = Number.NEGATIVE_INFINITY;
  let holding = false;
  let last = 0;

  return {
    scroll(next, now) {
      if (direction > 0) {
        if (next > extreme) extreme = next;
        else if (extreme - next > DEADBAND) {
          direction = -1;
          extreme = next;
        }
      } else if (next < extreme) extreme = next;
      else if (next - extreme > DEADBAND) {
        direction = 1;
        extreme = next;
      }
      y = next;
      lastScroll = now;
      if (direction > 0) {
        while (target < 2 && y >= lines.forward[target as 0 | 1]) {
          // The step starts where its preview had got to.
          if (clock === target) clock += preview;
          preview = 0;
          target = (target + 1) as Chapter;
        }
      } else {
        while (target > 0 && y <= lines.back[target - 1]) {
          preview = 0;
          target = (target - 1) as Chapter;
        }
      }
    },
    hold(next) {
      holding = next;
    },
    step(now) {
      const dt = last ? Math.min(64, Math.max(0, now - last)) : 16;
      last = now;
      let busy = false;
      let speed = 1;
      if (clock !== target) {
        const forward = target > clock;
        let duration = (forward ? clock < 1 : clock <= 1) ? lines.durations[0] : lines.durations[1];
        if (!forward) duration /= REVERSE;
        if (Math.abs(target - clock) > 1.02) speed = 2.2;
        if (forward && lines.hurry > 0 && y >= lines.track - lines.hurry) speed = Math.max(speed, 3);
        if (forward && y > lines.track) speed = 6;
        let next = clock + ((forward ? 1 : -1) * dt * speed) / duration;
        if (forward ? next >= target : next <= target) next = target;
        clock = next;
        busy = true;
      }
      if (clock === target && target < 2) {
        const next = target as 0 | 1;
        const pull = clamp01((y - (lines.forward[next] - lines.preview[next])) / lines.preview[next]);
        const active = holding || now - lastScroll < ACTIVE_MS;
        const goal = active && pull > 0 ? 1 : 0;
        envelope += (goal - envelope) * (1 - Math.exp(-dt / (goal ? 60 : 240)));
        if (Math.abs(goal - envelope) < 0.003) envelope = goal;
        else busy = true;
        if (goal) busy = true;
        preview = PREVIEW * easeInOut(pull) * envelope;
      } else {
        envelope = 0;
        preview = 0;
      }
      if (!busy) last = 0;
      return { value: clock + preview, target, speed, busy };
    },
    jump(next) {
      y = next;
      extreme = next;
      direction = 1;
      target = chapterAt(lines, next);
      clock = target;
      preview = 0;
      envelope = 0;
      last = 0;
    },
    offset: () => y,
  };
}

/**
 * The lines for each screen (scroll offsets into the pinned stretch, px). A wheel notch is 100 px: on a laptop one
 * notch opens the map, a burst of four or five stays on it, and the categories come about a screen later. On a phone
 * each chapter is a page 320 px apart that a flick stops at (CSS scroll snapping), so nothing needs to hurry before the
 * end of the stretch.
 */
export const WIDE_LINES: ChapterLines = { forward: [60, 560], back: [30, 470], preview: [60, 100], track: 860, hurry: 120, durations: [1600, 1400] };
export const PHONE_PAGE = 320;
export const PHONE_LINES: ChapterLines = {
  forward: [PHONE_PAGE * 0.3, PHONE_PAGE * 1.3],
  back: [PHONE_PAGE * 0.7, PHONE_PAGE * 1.7],
  preview: [PHONE_PAGE * 0.3, PHONE_PAGE * 0.3],
  track: PHONE_PAGE * 2,
  hurry: 0,
  durations: [1350, 1200],
};
