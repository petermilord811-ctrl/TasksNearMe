import { describe, expect, it } from 'vitest';
import { SEASONS } from '@/shared/seasons';
import { DARK_PALETTE, LIGHT_PALETTE, type TownPalette } from './town-palette';
import { mixColor, townPalette, type TownScheme } from './town-seasons';

const SCHEMES: TownScheme[] = ['light', 'dark'];
const HEX = /^#[0-9a-f]{6}$/;
const lightness = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255) as [number, number, number];
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
};
/** Green leads red and blue: a leafy green, not an amber or a snowy white. */
const greenish = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)) as [number, number, number];
  return g > r + 12 && g > b + 12;
};

describe('mixColor', () => {
  it('mixes in sRGB, ends included', () => {
    expect(mixColor('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mixColor('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(mixColor('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixColor('#ec9f7d', '#f7f9fc', 0.75)).toBe('#f4e3dc');
  });
});

describe('townPalette', () => {
  it('gives every season the theme’s keys, list lengths and kinds of value, so a repaint reaches the same parts', () => {
    for (const scheme of SCHEMES) {
      const base: TownPalette = scheme === 'dark' ? DARK_PALETTE : LIGHT_PALETTE;
      for (const season of SEASONS) {
        const palette = townPalette(scheme, season);
        expect(Object.keys(palette).sort(), `${scheme} ${season}`).toEqual(Object.keys(base).sort());
        for (const key of Object.keys(base) as (keyof TownPalette)[]) {
          const value = palette[key];
          const was = base[key];
          if (Array.isArray(was)) {
            expect(value, `${scheme} ${season} ${key}`).toHaveLength(was.length);
            for (const color of value as string[]) expect(color, `${scheme} ${season} ${key}`).toMatch(HEX);
          } else if (typeof was === 'string') {
            expect(value, `${scheme} ${season} ${key}`).toMatch(HEX);
          } else {
            expect(typeof value, `${scheme} ${season} ${key}`).toBe(typeof was);
          }
        }
      }
    }
  });

  it('keeps the houses, cars and people as they are in every season', () => {
    for (const scheme of SCHEMES) {
      const base = scheme === 'dark' ? DARK_PALETTE : LIGHT_PALETTE;
      for (const season of SEASONS) {
        const palette = townPalette(scheme, season);
        for (const key of ['wall', 'wallCream', 'wallBarn', 'door', 'cars', 'trucks', 'shirts', 'skin', 'route'] as const) {
          expect(palette[key], `${scheme} ${season} ${key}`).toEqual(base[key]);
        }
      }
    }
  });

  it('dresses each season: amber in fall, snow in winter, blossom in spring, full green in summer', () => {
    const fall = townPalette('light', 'fall');
    expect(fall.leaves.filter(greenish)).toHaveLength(0);
    expect(fall.autumn.filter(greenish)).toHaveLength(0);

    for (const scheme of SCHEMES) {
      const base = scheme === 'dark' ? DARK_PALETTE : LIGHT_PALETTE;
      const winter = townPalette(scheme, 'winter');
      // Snow is the lightest thing around: lighter lawns and crowns, and roofs under it.
      expect(lightness(winter.grass)).toBeGreaterThan(lightness(base.grass) + 0.1);
      for (const crown of winter.leaves) expect(lightness(crown)).toBeGreaterThan(lightness(base.leaves[0]!) + 0.1);
      expect(lightness(winter.roofClay)).toBeGreaterThan(lightness(base.roofClay));
      // Evergreens stay green.
      expect(greenish(winter.conifer)).toBe(true);
    }
    // Lit windows on a winter night.
    expect(townPalette('dark', 'winter').windowGlow).toBeGreaterThan(0);

    const spring = townPalette('light', 'spring');
    expect(spring.autumn.filter(greenish)).toHaveLength(0);
    expect(spring.leaves.every(greenish)).toBe(true);

    const summer = townPalette('light', 'summer');
    expect(summer.leaves.every(greenish)).toBe(true);
    expect(summer.autumn.every(greenish)).toBe(true);
  });
});
