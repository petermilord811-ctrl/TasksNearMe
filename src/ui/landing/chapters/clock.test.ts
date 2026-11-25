import { describe, expect, it } from 'vitest';
import { chapterAt, createChapterClock, PHONE_LINES, PHONE_PAGE, WIDE_LINES, type ChapterClock } from './clock';

/** Runs the clock frame by frame (16 ms) for `ms`, returning every value it drew. */
function run(clock: ChapterClock, from: number, ms: number): { values: number[]; now: number } {
  const values: number[] = [];
  let now = from;
  for (let t = 0; t < ms; t += 16) {
    now += 16;
    values.push(clock.step(now).value);
  }
  return { values, now };
}

describe('the landing’s chapter clock', () => {
  it('opens the map on one wheel notch and plays the step at its own pace, whatever the hand does next', () => {
    const clock = createChapterClock(WIDE_LINES);
    clock.scroll(100, 0);
    const halfway = run(clock, 0, 800);
    expect(halfway.values.at(-1)).toBeGreaterThan(0.4);
    expect(halfway.values.at(-1)).toBeLessThan(0.6);
    // The hand stops: the step still lands, and never goes back on the way.
    const rest = run(clock, halfway.now, 1000);
    expect(rest.values.at(-1)).toBe(1);
    const all = [...halfway.values, ...rest.values];
    expect(all.every((value, index) => index === 0 || value >= all[index - 1]!)).toBe(true);
  });

  it('keeps the map when one notch goes back, and rewinds only on a clear move back past the line', () => {
    const clock = createChapterClock(WIDE_LINES, 300);
    clock.scroll(200, 0);
    expect(clock.step(16).target).toBe(1);
    clock.scroll(100, 50);
    expect(clock.step(66).target).toBe(1);
    clock.scroll(20, 100);
    expect(clock.step(116).target).toBe(0);
  });

  it('ignores a shaky thumb: a few pixels back and forth near a line doesn’t flip the chapter', () => {
    const clock = createChapterClock(WIDE_LINES);
    clock.scroll(62, 0);
    expect(clock.step(16).target).toBe(1);
    for (let i = 0; i < 6; i++) clock.scroll(i % 2 ? 62 : 55, 20 + i * 10);
    expect(clock.step(100).target).toBe(1);
  });

  it('plays a step back from wherever it is, a little faster than forward', () => {
    const clock = createChapterClock(WIDE_LINES);
    clock.scroll(100, 0);
    const forward = run(clock, 0, 640);
    const reached = forward.values.at(-1)!;
    expect(reached).toBeGreaterThan(0.3);
    clock.scroll(0, forward.now);
    const back = run(clock, forward.now, 2000);
    expect(back.values[0]!).toBeLessThan(reached);
    expect(back.values.at(-1)).toBe(0);
    // Back takes less time than the same distance forward.
    const backFrames = back.values.findIndex((value) => value === 0) + 1;
    expect(backFrames * 16).toBeLessThan(640);
  });

  it('catches up when a fling skips a chapter, and lands before the stage scrolls away', () => {
    const clock = createChapterClock(WIDE_LINES);
    clock.scroll(700, 0);
    const first = clock.step(16);
    expect(first.target).toBe(2);
    expect(first.speed).toBeGreaterThan(1);
    const { values } = run(clock, 16, 3000);
    const frames = values.findIndex((value) => value === 2) + 1;
    expect(frames * 16).toBeLessThan(WIDE_LINES.durations[0] + WIDE_LINES.durations[1]);

    const leaving = createChapterClock(WIDE_LINES);
    leaving.scroll(WIDE_LINES.track + 200, 0);
    expect(leaving.step(16).speed).toBe(6);
  });

  it('previews the step on a small scroll, settles back when the hand stops short, and starts from the preview when it goes on', () => {
    const clock = createChapterClock(WIDE_LINES);
    clock.scroll(45, 0);
    const leaning = run(clock, 0, 120);
    const leaned = leaning.values.at(-1)!;
    expect(leaned).toBeGreaterThan(0);
    expect(leaned).toBeLessThanOrEqual(0.1);
    // No more scrolling: it settles back, though the page stays where it is.
    const settled = run(clock, leaning.now, 1500);
    expect(settled.values.at(-1)).toBe(0);

    const again = createChapterClock(WIDE_LINES);
    again.scroll(50, 0);
    const before = run(again, 0, 120);
    again.scroll(70, before.now);
    const after = run(again, before.now, 16);
    expect(after.values[0]!).toBeGreaterThanOrEqual(before.values.at(-1)!);
  });

  it('holds the preview while a finger rests on the screen', () => {
    const clock = createChapterClock(PHONE_LINES);
    clock.hold(true);
    clock.scroll(70, 0);
    const held = run(clock, 0, 1000);
    expect(held.values.at(-1)).toBeGreaterThan(0.05);
    clock.hold(false);
    expect(run(clock, held.now, 1500).values.at(-1)).toBe(0);
  });

  it('on a phone, a flick back from the map heads for the town at once', () => {
    const clock = createChapterClock(PHONE_LINES, PHONE_PAGE);
    expect(clock.step(16).target).toBe(1);
    clock.scroll(PHONE_PAGE - 40, 100);
    expect(clock.step(116).target).toBe(1);
    clock.scroll(PHONE_PAGE * 0.6, 150);
    expect(clock.step(166).target).toBe(0);
    // A flick forward from the town past the first line heads for the map.
    const town = createChapterClock(PHONE_LINES);
    town.scroll(PHONE_PAGE * 0.35, 0);
    expect(town.step(16).target).toBe(1);
  });

  it('reads a first offset straight into its chapter', () => {
    expect(chapterAt(WIDE_LINES, 0)).toBe(0);
    expect(chapterAt(WIDE_LINES, 300)).toBe(1);
    expect(chapterAt(WIDE_LINES, 900)).toBe(2);
    const clock = createChapterClock(WIDE_LINES);
    clock.jump(300);
    expect(clock.step(16)).toMatchObject({ value: 1, target: 1, busy: false });
  });
});
