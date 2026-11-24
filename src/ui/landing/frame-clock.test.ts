import { describe, expect, it } from 'vitest';
import { dueFrame } from './frame-clock';

describe('dueFrame', () => {
  it('draws the first frame, then about every other 60 Hz frame at 30 a second, on a shared clock', () => {
    expect(dueFrame(1000, 0, 30)).toBe(true);
    // 60 Hz frames: 16.67 ms apart.
    const frames = Array.from({ length: 12 }, (_, i) => 1000 + i * (1000 / 60));
    let last = 0;
    const drawn: number[] = [];
    for (const now of frames) {
      if (dueFrame(now, last, 30)) {
        drawn.push(now);
        last = now;
      }
    }
    expect(drawn.length).toBeGreaterThanOrEqual(6);
    expect(drawn.length).toBeLessThanOrEqual(7);
    // Two loops started at different moments pick the same frames once both run.
    let a = 0;
    let b = 0;
    const pickedA = new Set<number>();
    const pickedB = new Set<number>();
    frames.forEach((now, i) => {
      if (dueFrame(now, a, 30)) { a = now; pickedA.add(now); }
      if (i >= 3 && dueFrame(now, b, 30)) { b = now; pickedB.add(now); }
    });
    const late = frames.slice(5);
    expect(late.filter((now) => pickedA.has(now) !== pickedB.has(now))).toEqual([]);
  });

  it('draws every frame at 60 a second on a 60 Hz display', () => {
    let last = 0;
    let count = 0;
    for (let i = 0; i < 10; i++) {
      const now = 500 + i * (1000 / 60);
      if (dueFrame(now, last, 60)) { count++; last = now; }
    }
    expect(count).toBe(10);
  });
});
