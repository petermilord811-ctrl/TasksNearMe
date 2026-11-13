import { cameraPose, projector } from './camera';
import { simplify, type Pt } from './geometry';
import { TOWN_LAYOUTS, townScene, WATER_LEVEL, type TownLayout } from './scene';

/**
 * The hero town's skeleton: its land as the 3D town will show it, drawn flat (SVG) from the same scene and the
 * same resting camera, so it shows from the first paint and the live town grows out of it without a jump. Each
 * level of plates (the two terraces, then the plate the town stands on) is one path of top faces; its side faces
 * are that path drawn a few times on the way down to the plates' thickness as seen from the camera (the camera is
 * far and narrow, so a level's sides are close to one shift of its tops). The water is a faint path under them.
 *
 * The paths are generated ahead (`skeleton-data.ts`, by `skeleton.test.ts`), so the page never builds the scene
 * to draw them. Coordinates are stage units (the composition's), rounded to whole units.
 */
export interface SkeletonLevel {
  /** The level's top faces. */
  top: string;
  /** How far its side faces reach below its top on the stage (the plates' thickness, seen from the camera). */
  side: { dx: number; dy: number };
}

export interface Skeleton {
  /** The stage (the SVG's viewBox; the land runs on beyond it where the composition has more). */
  width: number;
  height: number;
  /** Everything drawn, for the shimmer's sweep. */
  bounds: { x: number; y: number; width: number; height: number };
  /** Lowest first (the terraces), the town's plate last. */
  levels: SkeletonLevel[];
  water: string;
}

/** How far a simplified outline may stray from the real one (stage units: under a pixel on wide screens). */
const TOLERANCE = 1.1;

/** Closed outlines as one compact path: absolute moves, relative lines between whole units. */
function pathOf(outlines: Pt[][]): string {
  const number = (value: number, first: boolean) => (value < 0 || first ? `${value}` : ` ${value}`);
  return outlines
    .filter((outline) => outline.length >= 3)
    .map((outline) => {
      const points = outline.map((point) => ({ x: Math.round(point.x), y: Math.round(point.y) }));
      let path = `M${points[0]!.x} ${points[0]!.y}l`;
      let first = true;
      for (let i = 1; i < points.length; i += 1) {
        const dx = points[i]!.x - points[i - 1]!.x;
        const dy = points[i]!.y - points[i - 1]!.y;
        if (dx === 0 && dy === 0) continue;
        path += number(dx, first) + number(dy, false);
        first = false;
      }
      return `${path}z`;
    })
    .join('');
}

export function buildSkeleton(layout: TownLayout): Skeleton {
  const scene = townScene(layout);
  const { stage, view } = scene.composition;
  const project = projector(cameraPose(0, 0, 0, 1, view), stage);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const extend = (point: Pt) => {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  };

  const levels = [0, 1, 2].map((level): SkeletonLevel => {
    let shiftX = 0;
    let shiftY = 0;
    let count = 0;
    const outlines = scene.slabs
      .filter((slab) => slab.level === level)
      .map((slab) => {
        const tops = slab.outline.map((point) => {
          const top = project({ x: point.x, y: slab.top, z: point.y });
          const bottom = project({ x: point.x, y: slab.top - slab.thickness, z: point.y });
          shiftX += bottom.x - top.x;
          shiftY += bottom.y - top.y;
          count += 1;
          extend(bottom);
          extend(top);
          return { x: top.x, y: top.y };
        });
        return simplify(tops, TOLERANCE);
      });
    const round = (value: number) => Math.round(value * 10) / 10;
    return { top: pathOf(outlines), side: { dx: round(shiftX / Math.max(1, count)), dy: round(shiftY / Math.max(1, count)) } };
  });

  const water = scene.water.map((outline) => simplify(outline.map((point) => project({ x: point.x, y: WATER_LEVEL, z: point.y })), TOLERANCE));
  for (const outline of water) outline.forEach(extend);

  return {
    width: stage.width,
    height: stage.height,
    bounds: { x: Math.floor(minX), y: Math.floor(minY), width: Math.ceil(maxX - minX), height: Math.ceil(maxY - minY) },
    levels,
    water: pathOf(water),
  };
}

/** The generated module (`skeleton-data.ts`), written by `skeleton.test.ts` with `-u`. */
export function renderSkeletonModule(): string {
  const skeletons = Object.fromEntries(TOWN_LAYOUTS.map((layout) => [layout, buildSkeleton(layout)]));
  return [
    '// Generated from the town\'s scene by skeleton.test.ts (see skeleton.ts). Don\'t edit by hand; after changing the',
    '// scene or the camera, update it with: npx vitest run src/ui/landing/minimap/skeleton.test.ts -u',
    "import type { TownLayout } from './scene';",
    "import type { Skeleton } from './skeleton';",
    '',
    `export const SKELETONS: Record<TownLayout, Skeleton> = ${JSON.stringify(skeletons, null, 2)};`,
    '',
  ].join('\n');
}
