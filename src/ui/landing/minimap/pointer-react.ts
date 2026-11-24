/**
 * How the 3D town reacts to the pointer (2026-11-24, owner: "In 3D map, by cursor movement, make map elements
 * (people, building, etc..) react it (but use less performance)"): plain math, shared by the town's frame loop and
 * its tests. The trees and houses react in their shaders (town.ts); people and pins here, a few dozen a frame.
 */

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/**
 * How near the pointer is to a spot (0–1): full within the first 30% of `reach`, easing out to nothing at `reach`,
 * times how present the pointer is (`strength`, 0–1: it fades in and out).
 */
export function nearness(strength: number, distance: number, reach: number): number {
  if (strength <= 0) return 0;
  const start = reach * 0.3;
  const t = clamp01((distance - start) / (reach - start));
  return strength * (1 - t * t * (3 - 2 * t));
}

/**
 * The heading of someone at (x, z), facing `yaw` (the town's convention: atan2(-dz, dx) of where they face), turned
 * toward the pointer at (toX, toZ): by how near it is, at most `share` of the way (walkers only glance), the short
 * way round.
 */
export function turnToward(yaw: number, x: number, z: number, toX: number, toZ: number, near: number, share: number): number {
  if (near <= 0.001) return yaw;
  const face = Math.atan2(-(toZ - z), toX - x);
  const turn = Math.atan2(Math.sin(face - yaw), Math.cos(face - yaw));
  return yaw + turn * Math.min(1, near * 1.25) * share;
}
