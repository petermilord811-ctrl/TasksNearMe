import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createChapterClock, EASE_MS, MAP_REST_SHARE, restOffset, SPANS, valueAt, type ChapterClock } from './clock';

/** The pinned stretch on a laptop 900 px tall (335svh). */
const LENGTH = 3015;

/** Steps the clock at 60 frames a second until it rests (or `limit` frames), returning the values it drew. */
function run(clock: ChapterClock, start: number, limit = 400): { values: number[]; end: number } {
  const values: number[] = [];
  let now = start;
  for (let i = 0; i < limit; i++) {
    now += 16;
    const frame = clock.step(now);
    values.push(frame.value);
    if (!frame.busy) break;
  }
  return { values, end: now };
}

describe('the landing’s chapter clock', () => {
  it('follows the scroll: a little scroll moves the stage a little, with stops at the map and the categories', () => {
    expect(valueAt(0, LENGTH)).toBe(0);
    expect(valueAt(-50, LENGTH)).toBe(0);
    // Step one over its share of the stretch, in proportion.
    expect(valueAt(LENGTH * SPANS.one * 0.1, LENGTH)).toBeCloseTo(0.1);
    expect(valueAt(LENGTH * SPANS.one * 0.5, LENGTH)).toBeCloseTo(0.5);
    // The stop at the map holds at exactly 1.
    expect(valueAt(LENGTH * SPANS.one, LENGTH)).toBe(1);
    expect(valueAt(LENGTH * (SPANS.one + SPANS.mapStop), LENGTH)).toBe(1);
    // Step two, then the stop at the categories, and past the stretch (the stage scrolling away) it stays there.
    expect(valueAt(LENGTH * (SPANS.one + SPANS.mapStop + SPANS.two / 2), LENGTH)).toBeCloseTo(1.5);
    expect(valueAt(LENGTH * 0.97, LENGTH)).toBe(2);
    expect(valueAt(LENGTH * 1.5, LENGTH)).toBe(2);
    expect(SPANS.one + SPANS.mapStop + SPANS.two + SPANS.gridStop).toBeCloseTo(1);
  });

  it('lands a chapter inside its stop, with most of the map’s stop still ahead', () => {
    expect(restOffset(0, LENGTH)).toBe(0);
    expect(valueAt(restOffset(1, LENGTH), LENGTH)).toBe(1);
    expect(valueAt(restOffset(2, LENGTH), LENGTH)).toBe(2);
    expect(restOffset(1, LENGTH) / LENGTH).toBeCloseTo(MAP_REST_SHARE);
    // The map holds for about a screen and a half of scrolling, most of it after where a link lands (owner,
    // 2026-11-25: "make users need more scroll (* 1.5)", over the 0.8 screen ahead before).
    const screen = 900;
    expect((SPANS.mapStop * LENGTH) / screen).toBeGreaterThan(1.45);
    const ahead = (SPANS.one + SPANS.mapStop) * LENGTH - restOffset(1, LENGTH);
    expect(ahead / screen).toBeGreaterThan(1.2);
    expect(valueAt(restOffset(1, LENGTH) + 1.2 * screen, LENGTH)).toBe(1);
  });

  it('places the map’s rest marker in landing.css where the clock rests on the map', () => {
    const css = fs.readFileSync(path.join(import.meta.dirname, '../landing.css'), 'utf8');
    const share = MAP_REST_SHARE.toFixed(2);
    expect(css).toContain(`[data-chapter-map-rest] { top: calc(var(--chapter-track) * ${share}); }`);
    expect(css).toContain(`scroll-margin-top: calc(var(--chapter-track) * -${share}); }`);
  });

  it('eases a moment behind the scroll, smoothly, and stops there without playing on', () => {
    const clock = createChapterClock(LENGTH);
    // One wheel notch (100 px) into step one.
    clock.scroll(100);
    const notch = run(clock, 1000);
    const target = valueAt(100, LENGTH);
    expect(notch.values.at(-1)).toBe(target);
    expect(target).toBeLessThan(0.15);
    // Monotonic: no overshoot, no bounce.
    for (let i = 1; i < notch.values.length; i++) expect(notch.values[i]!).toBeGreaterThanOrEqual(notch.values[i - 1]!);
    // It catches up within about a second on a wide screen.
    expect(notch.values.length * 16).toBeLessThan(EASE_MS.wide * 8);
    // More than half of it within the ease's time constant: smooth, but not slow; and not all at once.
    expect(notch.values[Math.round(EASE_MS.wide / 16) - 1]!).toBeGreaterThan(target * 0.5);
    expect(notch.values[0]!).toBeLessThan(target * 0.25);
  });

  it('turns jerky scrolling into one motion, back as well as forward', () => {
    const clock = createChapterClock(LENGTH);
    let now = 0;
    const drawn: number[] = [];
    // Uneven notches: a burst forward, a pause, a little back.
    for (const offset of [120, 260, 380, 380, 380, 300]) {
      clock.scroll(offset);
      for (let i = 0; i < 4; i++) drawn.push(clock.step((now += 16)).value);
    }
    const settled = run(clock, now);
    expect(settled.values.at(-1)).toBe(valueAt(300, LENGTH));
    // No frame jumps more than a small step, however the notches came.
    const all = [...drawn, ...settled.values];
    for (let i = 1; i < all.length; i++) expect(Math.abs(all[i]! - all[i - 1]!)).toBeLessThan(0.06);
  });

  it('starts where the page is, follows a resize, and jumps when asked', () => {
    const onMap = createChapterClock(LENGTH, restOffset(1, LENGTH));
    expect(onMap.step(16)).toEqual({ value: 1, target: 1, busy: false });
    // The stretch grows (a taller screen): the same offset is earlier in it.
    onMap.resize(LENGTH * 2);
    expect(onMap.step(32).target).toBeLessThan(1);
    onMap.jump(restOffset(2, LENGTH * 2));
    expect(onMap.step(48)).toEqual({ value: 2, target: 2, busy: false });
    expect(onMap.offset()).toBe(restOffset(2, LENGTH * 2));
  });

  it('doesn’t leap after a long frame (a hidden tab)', () => {
    const clock = createChapterClock(LENGTH);
    clock.scroll(LENGTH * SPANS.one);
    clock.step(16);
    const after = clock.step(16 + 5000).value;
    expect(after).toBeLessThan(1);
    expect(after).toBeGreaterThan(0.4);
  });
});
