/**
 * The town's colors for each theme. Every material and every vertex color of the town is painted from one of
 * these entries (a single color, or one color of a list by index), so switching the theme repaints all of it.
 */
export interface TownPalette {
  plate: string;
  terraceHigh: string;
  terraceLow: string;
  waterShallow: string;
  waterDeep: string;
  /** Backyard pools and the fountain's basin. */
  pool: string;
  grass: string;
  road: string;
  /** A paved plaza and patios (a little lighter than the roads). */
  paving: string;
  hedge: string;
  bed: string;
  /** Facades: white, then the tints. */
  wall: string;
  wallCream: string;
  wallSage: string;
  wallSky: string;
  wallBlush: string;
  wallSand: string;
  wallGraphite: string;
  wallBarn: string;
  /** White trim: cornices, frames, rims, rails. */
  trim: string;
  roofWhite: string;
  roofClay: string;
  roofSand: string;
  roofSlate: string;
  roofSage: string;
  roofCharcoal: string;
  window: string;
  windowGlow: number;
  door: string;
  /** Greenhouse panes and balcony rails. */
  glass: string;
  solar: string;
  metal: string;
  trunk: string;
  wood: string;
  leaves: string[];
  /** Trees in blossom (pink and lilac) and in autumn (orange and gold). */
  blossoms: string[];
  autumn: string[];
  conifer: string;
  palm: string;
  agave: string;
  cactus: string;
  bluebonnet: string;
  /** A bluebonnet meadow's ground (a lawn gone periwinkle). */
  meadow: string;
  flowers: string[];
  bridge: string;
  ink: string;
  skin: string;
  shirts: string[];
  cars: string[];
  trucks: string[];
  kayaks: string[];
  balloons: string[];
  awnings: string[];
  umbrellas: string[];
  hull: string;
  sail: string;
  crate: string;
  cardboard: string;
  tyre: string;
  court: string;
  courtLine: string;
  sand: string;
  soil: string;
  plants: string;
  leafPile: string;
  lampPost: string;
  lampHead: string;
  lampGlow: number;
  bird: string;
  route: string;
  shadow: { color: string; opacity: number };
  sun: { color: string; intensity: number };
  sky: { color: string; ground: string; intensity: number };
  environment: number;
}

export const LIGHT_PALETTE: TownPalette = {
  plate: '#ffffff',
  terraceHigh: '#f7f2eb',
  terraceLow: '#ede5da',
  waterShallow: '#aee3f3',
  waterDeep: '#4fb0da',
  pool: '#78d0ee',
  grass: '#d7ebc8',
  road: '#ebe3d8',
  paving: '#f3ede5',
  hedge: '#6db57a',
  bed: '#f6cfdb',
  wall: '#ffffff',
  wallCream: '#f8efe1',
  wallSage: '#e0eadb',
  wallSky: '#dde8f3',
  wallBlush: '#f7e0da',
  wallSand: '#f1e2c8',
  wallGraphite: '#615d5a',
  wallBarn: '#c8584b',
  trim: '#ffffff',
  roofWhite: '#f1ece6',
  roofClay: '#ec9f7d',
  roofSand: '#efd5a4',
  roofSlate: '#8fa3b8',
  roofSage: '#a7c39b',
  roofCharcoal: '#6c6763',
  window: '#97add4',
  windowGlow: 0,
  door: '#b48b6c',
  glass: '#cde9e2',
  solar: '#35517f',
  metal: '#c6ccd3',
  trunk: '#a5826a',
  wood: '#c79b74',
  leaves: ['#96d486', '#74bd73', '#b0dc92', '#62ad6c'],
  blossoms: ['#f4a8c7', '#c8a3ef'],
  autumn: ['#f09a4a', '#f2c35a'],
  conifer: '#4f9467',
  palm: '#7cc26c',
  agave: '#93bba8',
  cactus: '#6aa86d',
  bluebonnet: '#5876da',
  meadow: '#cdd6ef',
  flowers: ['#f07a2b', '#e5508a', '#8b5cf6', '#f5b544'],
  bridge: '#ffffff',
  ink: '#3d3732',
  skin: '#e2ab86',
  shirts: ['#7c5cff', '#e8673a', '#2e9e68', '#3b7bf6', '#e5508a'],
  cars: ['#f2f0ec', '#e8673a', '#3b7bf6'],
  trucks: ['#ffffff', '#f5b544', '#e8673a'],
  kayaks: ['#e8673a', '#f5b544', '#3b7bf6', '#2e9e68'],
  balloons: ['#e8673a', '#7c5cff', '#f5b544'],
  awnings: ['#e8673a', '#3b7bf6', '#2e9e68', '#e5508a'],
  umbrellas: ['#f5b544', '#e8673a', '#ffffff', '#7c5cff'],
  hull: '#ffffff',
  sail: '#fff6ea',
  crate: '#f5b544',
  cardboard: '#d9b48a',
  tyre: '#2b2622',
  court: '#71b6a2',
  courtLine: '#ffffff',
  sand: '#f2e1b9',
  soil: '#a98466',
  plants: '#7cc46f',
  leafPile: '#ea9a4b',
  lampPost: '#5b524a',
  lampHead: '#fff3d6',
  lampGlow: 0,
  bird: '#8a817a',
  route: '#6d4ef5',
  shadow: { color: '#4b3420', opacity: 0.17 },
  sun: { color: '#fff3e4', intensity: 2.05 },
  sky: { color: '#ffffff', ground: '#e0d3c2', intensity: 0.5 },
  environment: 0.46,
};

export const DARK_PALETTE: TownPalette = {
  plate: '#4a4239',
  terraceHigh: '#3e3730',
  terraceLow: '#332d27',
  waterShallow: '#2f5585',
  waterDeep: '#122650',
  pool: '#2b77a0',
  grass: '#2d4433',
  road: '#5a5047',
  paving: '#625850',
  hedge: '#2f6c48',
  bed: '#5a3446',
  wall: '#4b443c',
  wallCream: '#534a3f',
  wallSage: '#414c42',
  wallSky: '#3f4855',
  wallBlush: '#57463f',
  wallSand: '#564b3b',
  wallGraphite: '#2c2a28',
  wallBarn: '#6c3029',
  trim: '#5e554b',
  roofWhite: '#5b5249',
  roofClay: '#904e37',
  roofSand: '#816945',
  roofSlate: '#3d4b5c',
  roofSage: '#4a5d45',
  roofCharcoal: '#2a2725',
  window: '#ffc46b',
  windowGlow: 1.8,
  door: '#6d5645',
  glass: '#3c5d56',
  solar: '#1a273f',
  metal: '#7c8189',
  trunk: '#5e4c3e',
  wood: '#6e5440',
  leaves: ['#2f7a52', '#286746', '#3f8046', '#24603e'],
  blossoms: ['#9c5a7a', '#7a63a8'],
  autumn: ['#a8642e', '#a98a3b'],
  conifer: '#22533a',
  palm: '#3e7c46',
  agave: '#4d6c5e',
  cactus: '#3e6c45',
  bluebonnet: '#6079d8',
  meadow: '#2e3a57',
  flowers: ['#ff9a55', '#ff77a9', '#a48bff', '#f5b544'],
  bridge: '#4b443c',
  ink: '#d9cfc4',
  skin: '#c99272',
  shirts: ['#a48bff', '#ff8b5c', '#4fc28a', '#6b9dff', '#ff77a9'],
  cars: ['#d9d2ca', '#ff8b5c', '#6b9dff'],
  trucks: ['#d9d2ca', '#c9952f', '#c4532c'],
  kayaks: ['#ff8b5c', '#f5b544', '#6b9dff', '#4fc28a'],
  balloons: ['#ff8b5c', '#a48bff', '#f5b544'],
  awnings: ['#c4532c', '#3b62b8', '#2b7a54', '#b9406f'],
  umbrellas: ['#c9952f', '#c4532c', '#d9d2ca', '#7f66d8'],
  hull: '#e8e2da',
  sail: '#e6ddd0',
  crate: '#f5b544',
  cardboard: '#8e7356',
  tyre: '#141210',
  court: '#2f5b51',
  courtLine: '#cfc6bb',
  sand: '#6d6149',
  soil: '#4a3b2f',
  plants: '#3e6c45',
  leafPile: '#a8642e',
  lampPost: '#2a2520',
  lampHead: '#ffd27a',
  lampGlow: 2.6,
  bird: '#d9d2ca',
  route: '#b4a0ff',
  shadow: { color: '#000000', opacity: 0.42 },
  sun: { color: '#b4c4ff', intensity: 1.15 },
  sky: { color: '#4a5788', ground: '#1f1a16', intensity: 0.7 },
  environment: 0.16,
};

/** The palette's single colors (a material or a part is painted with one of them, so the theme repaints it). */
export type ColorKey = { [K in keyof TownPalette]: TownPalette[K] extends string ? K : never }[keyof TownPalette];
/** The palette's lists of colors (a part takes one of them by index). */
export type ListKey = { [K in keyof TownPalette]: TownPalette[K] extends string[] ? K : never }[keyof TownPalette];
/** What a part is painted with: a single color, one color of a list (by index, wrapping), or plain white. */
export type PaintRef = ColorKey | readonly [ListKey, number] | null;

/** The color a paint reference stands for in a palette (`null` is white, for parts tinted per instance). */
export function paintColor(palette: TownPalette, paint: PaintRef): string {
  if (paint === null) return '#ffffff';
  if (typeof paint === 'string') return palette[paint];
  const list = palette[paint[0]];
  return list[((paint[1] % list.length) + list.length) % list.length]!;
}
