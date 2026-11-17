import type { Season } from '@/shared/seasons';
import { DARK_PALETTE, LIGHT_PALETTE, type TownPalette } from './town-palette';

export type TownScheme = 'light' | 'dark';

/** Mixes two `#rrggbb` colors in sRGB (`t` 0 is `a`, 1 is `b`): plenty for tints and snow cover. */
export function mixColor(a: string, b: string, t: number): string {
  const channel = (hex: string, at: number) => parseInt(hex.slice(1 + at * 2, 3 + at * 2), 16);
  let out = '#';
  for (let at = 0; at < 3; at++) {
    const value = Math.round(channel(a, at) + (channel(b, at) - channel(a, at)) * t);
    out += Math.min(255, Math.max(0, value)).toString(16).padStart(2, '0');
  }
  return out;
}

/** Snow by day, and by night (blue in the moonlight, still lighter than everything around it). */
const SNOW: Record<TownScheme, string> = { light: '#f7f9fc', dark: '#b3bdcc' };

/**
 * Winter: snow on the lawns, the roofs and the round trees (a breath of each color left under it), frosted
 * hedges, dark evergreens, palms still green (it's the South), icy water, red berries in the snow, cooler light
 * with blue shadows, and the windows and street lamps lit warm at night.
 */
function winter(base: TownPalette, scheme: TownScheme): Partial<TownPalette> {
  const snow = SNOW[scheme];
  const cover = (color: string, amount: number) => mixColor(color, snow, amount);
  const day = scheme === 'light';
  return {
    plate: day ? '#ffffff' : '#a5afbf',
    terraceHigh: day ? '#f3f6fa' : '#7b8597',
    terraceLow: day ? '#e5ebf2' : '#687285',
    waterShallow: day ? '#c4e3f0' : '#2b4d78',
    waterDeep: day ? '#7cb6d6' : '#13294f',
    pool: day ? '#bfe0ee' : '#2f5a80',
    grass: day ? '#f2f5f9' : '#b2bccc',
    meadow: day ? '#edf2f7' : '#b5becd',
    road: day ? '#e4e8ee' : '#596170',
    paving: day ? '#edf0f4' : '#6c7484',
    hedge: day ? '#8fb1a2' : '#3d6658',
    bed: day ? '#eef2f6' : '#a5afbf',
    roofWhite: cover(base.roofWhite, 0.85),
    roofClay: cover(base.roofClay, 0.74),
    roofSand: cover(base.roofSand, 0.78),
    roofSlate: cover(base.roofSlate, 0.7),
    roofSage: cover(base.roofSage, 0.74),
    roofCharcoal: cover(base.roofCharcoal, 0.66),
    leaves: day ? ['#eef3f7', '#e2eaf1', '#f6f8fb', '#dbe5ed'] : ['#b6c0cf', '#a9b4c5', '#c1cad7', '#9eaabd'],
    blossoms: day ? ['#e9eef5', '#f1eaf2'] : ['#b8bdcc', '#beb8cb'],
    autumn: day ? ['#f1eee9', '#e5edf3'] : ['#c0c4cc', '#b0bccb'],
    conifer: day ? '#3f7d63' : '#24523f',
    agave: day ? '#a5c4b8' : '#56766b',
    cactus: day ? '#79ad7a' : '#3f6c4a',
    bluebonnet: day ? '#d43d3d' : '#e0504f',
    flowers: day ? ['#d63d3d', '#ffffff', '#3f8f5a', '#e2b33c'] : ['#e0504f', '#e9edf3', '#4f9a68', '#e2b33c'],
    plants: day ? '#7fae86' : '#3f6c50',
    leafPile: day ? '#f4f7fa' : '#b6c0cf',
    soil: day ? '#d9d4ce' : '#4d4a48',
    sand: day ? '#eef0f2' : '#8e96a3',
    court: day ? '#9cc3bb' : '#36605a',
    window: day ? '#a8b9d8' : '#ffc874',
    windowGlow: day ? 0 : 2.2,
    lampGlow: day ? 0 : 3,
    shadow: day ? { color: '#2f4569', opacity: 0.16 } : { color: '#05070d', opacity: 0.44 },
    sun: day ? { color: '#f1f5ff', intensity: 2.0 } : { color: '#c3d1ff', intensity: 1.22 },
    sky: day ? { color: '#f6f9ff', ground: '#d9e2ee', intensity: 0.56 } : { color: '#56638f', ground: '#1f232c', intensity: 0.74 },
  };
}

/**
 * Spring: fresh greens, the trees in blossom (pink, white like dogwood, lilac like wisteria), new lawns,
 * bluebonnets on them, pastel flowers in the beds, a clear light.
 */
function spring(scheme: TownScheme): Partial<TownPalette> {
  const day = scheme === 'light';
  return {
    leaves: day ? ['#a6dc8b', '#86cb79', '#c2e59d', '#74bd74'] : ['#3e8a53', '#347a49', '#4e9152', '#2e7045'],
    blossoms: day ? ['#f5aecb', '#f8dce7'] : ['#a8628a', '#b79bab'],
    autumn: day ? ['#f2a2c3', '#cdb1f1'] : ['#9d5b84', '#7a63a8'],
    grass: day ? '#dbefca' : '#2f4a35',
    hedge: day ? '#72bb7d' : '#317048',
    bed: day ? '#f8d1df' : '#5c3548',
    meadow: day ? '#cfd8f0' : '#2f3b59',
    flowers: day ? ['#f283b0', '#a98af0', '#f7c95c', '#ff9a6b'] : ['#ff8fbb', '#b39bff', '#f5c55a', '#ff9f70'],
    sun: day ? { color: '#fff8ee', intensity: 2.1 } : { color: '#b8c6ff', intensity: 1.15 },
  };
}

/**
 * Summer: deep, full greens, crape myrtles in bloom (magenta and lavender), black-eyed Susans where the
 * bluebonnets were, bright water and pools, a high strong sun.
 */
function summer(scheme: TownScheme): Partial<TownPalette> {
  const day = scheme === 'light';
  return {
    leaves: day ? ['#77c46c', '#56ac5f', '#91d178', '#46a05b'] : ['#2b7a4c', '#236a42', '#348649', '#1f5c3a'],
    blossoms: day ? ['#ea77b0', '#b78ae4'] : ['#a8507e', '#7a5aa8'],
    autumn: day ? ['#62b564', '#85c76f'] : ['#2f7a52', '#3b8048'],
    grass: day ? '#cde8bb' : '#2b4631',
    hedge: day ? '#59a967' : '#2a6644',
    meadow: day ? '#e1ebc1' : '#38452c',
    bluebonnet: day ? '#f2be35' : '#e8b53a',
    flowers: day ? ['#ff6b4a', '#ff4f8b', '#8b5cf6', '#ffc83d'] : ['#ff8a5c', '#ff6fa5', '#a48bff', '#f5c04a'],
    waterShallow: day ? '#9fe0f4' : '#2f5c8f',
    waterDeep: day ? '#38a6db' : '#12285a',
    pool: day ? '#5dd2f2' : '#2c84ad',
    sun: day ? { color: '#fff2da', intensity: 2.22 } : { color: '#b4c4ff', intensity: 1.15 },
  };
}

/**
 * Fall, the late part of it: amber, rust and gold crowns with an olive one holding on, red maples, dry
 * straw-tinted lawns, goldenrod where the bluebonnets were, mums in the beds, leaf piles, and a lower, warmer
 * sun with longer, browner shadows.
 */
function fall(scheme: TownScheme): Partial<TownPalette> {
  const day = scheme === 'light';
  return {
    leaves: day ? ['#e4a049', '#d2703a', '#e7bd57', '#a3aa67'] : ['#a8642e', '#93502c', '#a98a3b', '#5f6b3b'],
    blossoms: day ? ['#c9573d', '#b97a3c'] : ['#8a3a2b', '#7d5a2d'],
    autumn: day ? ['#efb247', '#e0813b'] : ['#b07a2e', '#a5582c'],
    grass: day ? '#e3e3c4' : '#373d2c',
    hedge: day ? '#8ba462' : '#3e5a33',
    meadow: day ? '#ebdcaf' : '#4a4330',
    bluebonnet: day ? '#e0a03a' : '#c08a3a',
    bed: day ? '#f0d8bc' : '#5a3e2e',
    flowers: day ? ['#e0782e', '#b8433c', '#e9b84a', '#8d4e7a'] : ['#e08a3e', '#c05a4c', '#d9aa4a', '#9a5e88'],
    plants: day ? '#9cb468' : '#4a6338',
    leafPile: day ? '#e38d42' : '#a8642e',
    shadow: day ? { color: '#5a3418', opacity: 0.18 } : { color: '#000000', opacity: 0.42 },
    sun: day ? { color: '#ffe8cc', intensity: 1.96 } : { color: '#c4c0ff', intensity: 1.12 },
    sky: day ? { color: '#fff8ef', ground: '#e6d1b4', intensity: 0.5 } : { color: '#4f5585', ground: '#211a14', intensity: 0.7 },
  };
}

/**
 * The town's colors for a theme and a season: the theme's palette with the season's nature and light over it
 * (the houses, cars and people keep theirs). Every season's palette has the same keys and list lengths as the
 * theme's, so switching repaints the same parts.
 */
export function townPalette(scheme: TownScheme, season: Season): TownPalette {
  const base = scheme === 'dark' ? DARK_PALETTE : LIGHT_PALETTE;
  const change = season === 'winter' ? winter(base, scheme) : season === 'spring' ? spring(scheme) : season === 'summer' ? summer(scheme) : fall(scheme);
  return { ...base, ...change };
}
