/**
 * What the stage shows at each moment of its two steps (see `clock.ts`), as plain math shared by every layer: the
 * town, the live map, its panels and the categories read the same numbers, so they can't drift apart. One thing moves
 * at a time (owner, 2026-11-24: "slide is mess"):
 *
 * Step one, town to map (0 to 1): the words leave first; the town's camera dives at the first task's pin; the pin's
 * ring opens into a window on the real map, at the town's angle with the same task under the same point; the map's
 * camera pulls back and flattens into the city while the other tasks pop in; the heading and the explorer arrive last,
 * once the camera is still.
 *
 * Step two, map to categories (1 to 2): the panels leave first; the map shrinks into its tile, onto a grid that is
 * already in place under it (nothing slides or fades in behind it); then each task flies into its category's count.
 */

/**
 * How much of the way to its pin the town's camera covers at the end of its dive (the town grows about 3.6 times):
 * the 3D town moves its camera (`town.ts`, `setDive`), a still picture scales by the same amount.
 */
export const TOWN_DIVE_REACH = 0.72;

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
/** How far `t` is through [from, to] (0–1). */
export const span = (t: number, from: number, to: number) => clamp01((t - from) / (to - from));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export function backOut(t: number): number {
  if (t <= 0) return 0;
  const c1 = 1.70158;
  return 1 + (c1 + 1) * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/** Step one's moments (fractions of the step). */
export const STEP_ONE = {
  wordsOut: [0, 0.2],
  dive: [0, 0.54],
  ring: [0.06, 0.54],
  pullBack: [0.5, 0.86],
  flatten: [0.5, 0.8],
  pinMorph: [0.52, 0.68],
  pinsIn: [0.66, 0.74],
  pinsInStagger: 0.018,
  headingIn: [0.82, 1],
  explorerIn: [0.86, 1],
} as const;

/** Step two's moments. */
export const STEP_TWO = {
  panelsOut: [0, 0.16],
  dock: [0.1, 0.6],
  fly: [0.54, 0.74],
  flyStagger: 0.028,
  labelIn: [0.86, 1],
} as const;

export interface StageMoment {
  /** How far through step one and step two (0–1 each). */
  one: number;
  two: number;
  /** The hero's words (and the town's task cards) leaving: 0 there, 1 gone. */
  wordsOut: number;
  /** The town's camera diving at the pin (0–1, eased in: it speeds up as the window opens). */
  dive: number;
  /** The town is still drawn (the window hasn't covered the screen yet). */
  townShown: boolean;
  /** The window onto the map: null before it opens, else how open (0–1, growing faster as it goes). */
  ring: number | null;
  /** The map's camera from its close, tilted view over the task to the flat city (0–1). */
  pullBack: number;
  /** The map's tilt going flat (0–1). */
  flatten: number;
  /** The hero's pin shrinking into a map pin (0–1); null once it has become one. */
  pinMorph: number | null;
  /** The heading and the explorer arriving (0–1). */
  headingIn: number;
  explorerIn: number;
  /** ... and leaving again in step two (0–1). */
  panelsOut: number;
  /** The map shrinking into its tile (0–1). */
  dock: number;
  /** The categories' grid is there, under the map. */
  gridShown: boolean;
  /** The docked map's label coming in (0–1). */
  labelIn: number;
}

export function stageMoment(value: number): StageMoment {
  const one = clamp01(value);
  const two = clamp01(value - 1);
  const ring = span(one, STEP_ONE.ring[0], STEP_ONE.ring[1]);
  const dive = span(one, STEP_ONE.dive[0], STEP_ONE.dive[1]);
  return {
    one,
    two,
    wordsOut: easeInOut(span(one, STEP_ONE.wordsOut[0], STEP_ONE.wordsOut[1])),
    dive: dive * dive,
    townShown: one < STEP_ONE.ring[1],
    ring: one < STEP_ONE.ring[0] ? null : Math.pow(ring, 1.6),
    pullBack: easeInOut(span(one, STEP_ONE.pullBack[0], STEP_ONE.pullBack[1])),
    flatten: easeInOut(span(one, STEP_ONE.flatten[0], STEP_ONE.flatten[1])),
    pinMorph: one < STEP_ONE.pinMorph[1] ? easeInOut(span(one, STEP_ONE.pinMorph[0], STEP_ONE.pinMorph[1])) : null,
    headingIn: easeOut(span(one, STEP_ONE.headingIn[0], STEP_ONE.headingIn[1])),
    explorerIn: easeOut(span(one, STEP_ONE.explorerIn[0], STEP_ONE.explorerIn[1])),
    panelsOut: easeInOut(span(two, STEP_TWO.panelsOut[0], STEP_TWO.panelsOut[1])),
    dock: easeInOut(span(two, STEP_TWO.dock[0], STEP_TWO.dock[1])),
    gridShown: two > 0,
    labelIn: easeOut(span(two, STEP_TWO.labelIn[0], STEP_TWO.labelIn[1])),
  };
}

/** The `index`th of the map's tasks popping in during step one (0 hidden, overshooting a little, then 1). */
export function pinIn(one: number, index: number): number {
  const from = STEP_ONE.pinsIn[0] + index * STEP_ONE.pinsInStagger;
  return backOut(span(one, from, from + (STEP_ONE.pinsIn[1] - STEP_ONE.pinsIn[0])));
}

/** The `index`th task flying from the docked map into its count during step two (0–1; 1 has landed). */
export function pinFlight(two: number, index: number): number {
  const from = STEP_TWO.fly[0] + index * STEP_TWO.flyStagger;
  return easeInOut(span(two, from, from + (STEP_TWO.fly[1] - STEP_TWO.fly[0])));
}

/** The window's radius: from just around the pin (`from`) to past the screen's farthest corner (`to`). */
export function ringRadius(open: number, from: number, to: number): number {
  return lerp(from, to, open);
}

/** How far a point must reach to cover a box from (x, y): its farthest corner, and a little more. */
export function farthestCorner(x: number, y: number, width: number, height: number): number {
  return 8 + Math.max(Math.hypot(x, y), Math.hypot(width - x, y), Math.hypot(x, height - y), Math.hypot(width - x, height - y));
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The map shrinking into its tile (container transform): a uniform scale (no squashing) of the full-screen map, and a
 * crop of it to the tile's shape around `focus` (the city), with its corners rounding as it goes. `dock` 0 is the
 * whole screen, 1 the tile. Returns the transform (translate, then scale from the top-left corner) and the crop in the
 * map's own (unscaled) pixels.
 */
export function dockFrame(dock: number, screen: { width: number; height: number }, tile: Box, focus: { x: number; y: number }, radius: number) {
  const { width: W, height: H } = screen;
  const finalScale = Math.max(tile.width / W, tile.height / H);
  const cropWidth = tile.width / finalScale;
  const cropHeight = tile.height / finalScale;
  const cropX = Math.min(Math.max(0, focus.x - cropWidth / 2), W - cropWidth);
  const cropY = Math.min(Math.max(0, focus.y - cropHeight / 2), H - cropHeight);
  const shown = { x: lerp(0, tile.x, dock), y: lerp(0, tile.y, dock), width: lerp(W, tile.width, dock), height: lerp(H, tile.height, dock) };
  const crop = { x: lerp(0, cropX, dock), y: lerp(0, cropY, dock), width: lerp(W, cropWidth, dock), height: 0 };
  const scale = shown.width / crop.width;
  crop.height = shown.height / scale;
  crop.y = Math.max(0, Math.min(crop.y, H - crop.height));
  return {
    scale,
    translate: { x: shown.x - scale * crop.x, y: shown.y - scale * crop.y },
    crop,
    shown,
    radius: lerp(0, radius, dock),
  };
}
