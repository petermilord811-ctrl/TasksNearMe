import { describe, expect, it } from 'vitest';
import { SEASONS } from '@/shared/seasons';
import { floraFor } from './flora';
import { buildTown, TOWN_LAYOUTS, type Tree } from './scene';
import { LIGHT_PALETTE } from './town-palette';
import { townPalette } from './town-seasons';

const share = (trees: Tree[], variant: Tree['variant']) => trees.filter((tree) => tree.variant === variant).length / trees.length;
const greenish = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)) as [number, number, number];
  return g > r + 12 && g > b + 12;
};

describe('floraFor', () => {
  it('grows north Florida’s plants in a Florida market, and Austin’s elsewhere', () => {
    expect(floraFor({ state: 'FL' })).toBe('florida');
    expect(floraFor({ state: 'Florida' })).toBe('florida');
    expect(floraFor({ state: 'TX' })).toBe('texas');
    expect(floraFor({ state: 'MI' })).toBe('texas');
  });
});

describe.each(TOWN_LAYOUTS)('the town’s plants (%s)', (layout) => {
  const texas = buildTown(layout);
  const florida = buildTown(layout, undefined, 'florida');

  it('leaves Austin’s town exactly as it was', () => {
    const again = buildTown(layout, undefined, 'texas');
    expect(again.flora).toBe('texas');
    expect(again.trees).toEqual(texas.trees);
    expect(again.bluebonnets).toEqual(texas.bluebonnets);
  });

  it('builds the same town, houses and pins, whatever grows in it', () => {
    expect(florida.flora).toBe('florida');
    expect(florida.houses).toEqual(texas.houses);
    expect(florida.slots).toEqual(texas.slots);
    expect(florida.roads).toEqual(texas.roads);
    expect(florida.trees.length).toBeGreaterThan(layout === 'wide' ? 150 : 80);
  });

  it('grows live oaks, pines, cabbage palms and saw palmetto in Florida, and no cacti', () => {
    expect(share(florida.trees, 7)).toBe(0);
    expect(share(texas.trees, 7)).toBeGreaterThan(0);
    expect(share(florida.trees, 3)).toBeGreaterThan(share(texas.trees, 3));
    expect(share(florida.trees, 5)).toBeGreaterThan(share(texas.trees, 5));
    expect(share(florida.trees, 6)).toBeGreaterThan(share(texas.trees, 6));
    expect(share(florida.trees, 4)).toBeGreaterThan(0.06);
  });

  it('keeps Florida’s live oaks evergreen (the green that holds on through fall)', () => {
    const oaks = florida.trees.filter((tree) => tree.variant === 3);
    expect(oaks.length).toBeGreaterThan(0);
    expect(oaks.every((tree) => tree.tone === 3)).toBe(true);
  });
});

describe('Florida’s colors', () => {
  it('keeps the palette’s shape in every season and theme', () => {
    for (const scheme of ['light', 'dark'] as const) {
      for (const season of SEASONS) {
        const palette = townPalette(scheme, season, 'florida');
        expect(Object.keys(palette).sort()).toEqual(Object.keys(LIGHT_PALETTE).sort());
      }
    }
  });

  it('paints saw palmetto green (snowy in winter like the rest) and coreopsis yellow where Texas has bluebonnets', () => {
    for (const season of ['spring', 'summer', 'fall'] as const) expect(greenish(townPalette('light', season, 'florida').agave)).toBe(true);
    expect(townPalette('light', 'winter', 'florida').agave).toBe(townPalette('light', 'winter', 'texas').agave);
    const spring = townPalette('light', 'spring', 'florida');
    const [r, g, b] = [1, 3, 5].map((at) => parseInt(spring.bluebonnet.slice(at, at + 2), 16)) as [number, number, number];
    expect(r).toBeGreaterThan(200);
    expect(g).toBeGreaterThan(160);
    expect(b).toBeLessThan(100);
    expect(townPalette('light', 'spring', 'texas').bluebonnet).toBe('#5876da');
  });
});
