import { describe, expect, it } from 'vitest';
import { renderSkeletonModule } from './skeleton';
import { SKELETONS } from './skeleton-data';

describe('the hero town’s skeleton', () => {
  it('is generated from the current scene and camera (update with -u)', async () => {
    await expect(renderSkeletonModule()).toMatchFileSnapshot('./skeleton-data.ts');
  });

  it('draws every level with its sides below it, and stays small enough to send with the page', () => {
    for (const layout of ['wide', 'band'] as const) {
      const shape = SKELETONS[layout];
      expect(shape.levels).toHaveLength(3);
      for (const level of shape.levels) {
        expect(level.top).toMatch(/^M-?\d/);
        expect(level.side.dy).toBeGreaterThan(0);
      }
      expect(shape.water.length).toBeGreaterThan(0);
      // The land runs on past the stage's left on wide screens (the canvas shows it there too).
      if (layout === 'wide') expect(shape.bounds.x).toBeLessThan(0);
      expect(JSON.stringify(shape).length).toBeLessThan(16_000);
    }
  });
});
