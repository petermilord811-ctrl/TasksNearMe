import type { CSSProperties } from 'react';
import { cn } from '@/ui/lib/utils';
import type { TownLayout } from './scene';
import { SKELETONS } from './skeleton-data';

/** Both layouts are drawn; CSS shows the one for the screen's width (the hero's `lg`), like the town itself. */
const SHOWN: Record<TownLayout, string> = { band: 'lg:hidden', wide: 'hidden lg:block' };
/** The side faces: the level's tops drawn this many times on the way down to its thickness. */
const SIDE_STEPS = [1, 2, 3, 4];
/** The shimmer's band (stage units) and its slant. */
const SHEEN = 620;
const SLANT = 0.3;

/**
 * The hero town's skeleton: its land (the terraces and the plate, their sides a shade darker, the water faint),
 * drawn from the same scene and camera as the 3D town (`skeleton.ts`), with a soft shimmer sweeping over it while
 * the town gets ready. Server-rendered and decorative: it shows from the first paint, and the live town grows out
 * of it exactly where it stands. Each layout's SVG fills the stage box (same aspect); the land past the stage's
 * edges shows too (`overflow: visible`), as the live canvas draws it.
 */
export function TownSkeleton() {
  return (
    <>
      {(['band', 'wide'] as const).map((layout) => (
        <SkeletonDrawing key={layout} layout={layout} className={SHOWN[layout]} />
      ))}
    </>
  );
}

function SkeletonDrawing({ layout, className }: { layout: TownLayout; className: string }) {
  const shape = SKELETONS[layout];
  const id = `town-skeleton-${layout}`;
  const { bounds } = shape;
  const down = (dx: number, dy: number, step: number) => `translate(${((dx * step) / SIDE_STEPS.length).toFixed(1)} ${((dy * step) / SIDE_STEPS.length).toFixed(1)})`;
  // The shimmer: a soft slanted band in a strip that just holds it; the strip slides from left of the land to
  // right of it (clipped to the land, so only the land catches the light). The band's lines lean, so lower down
  // it sits further left: the strip starts that much further left, so the band is never cut by its edge.
  const height = bounds.height + 240;
  const across = Math.round(SHEEN * (1 + SLANT * SLANT));
  const lean = Math.round(SLANT * height);
  const bandX = bounds.x - across - 40;
  const strip = { x: bandX - lean - 40, y: bounds.y - 120, width: across + lean + 80, height };
  const travel = bounds.width + across + lean + 160;
  return (
    <svg aria-hidden="true" focusable="false" viewBox={`0 0 ${shape.width} ${shape.height}`} className={cn('town-skeleton absolute inset-0 size-full overflow-visible', className)}>
      <defs>
        {shape.levels.map((level, index) => (
          <path key={index} id={`${id}-${index}`} d={level.top} />
        ))}
        <clipPath id={`${id}-land`}>
          <path d={shape.water} />
          {shape.levels.flatMap((level, index) =>
            [0, ...SIDE_STEPS].map((step) => <use key={`${index}-${step}`} href={`#${id}-${index}`} transform={step ? down(level.side.dx, level.side.dy, step) : undefined} />),
          )}
        </clipPath>
        <linearGradient id={`${id}-sheen`} gradientUnits="userSpaceOnUse" x1={bandX} y1={strip.y} x2={bandX + SHEEN} y2={strip.y + SHEEN * SLANT}>
          <stop offset="0" className="town-skeleton-sheen-stop" stopOpacity="0" />
          <stop offset="0.5" className="town-skeleton-sheen-stop" stopOpacity="1" />
          <stop offset="1" className="town-skeleton-sheen-stop" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={shape.water} className="town-skeleton-water" />
      {shape.levels.map((level, index) => (
        <g key={index}>
          {[...SIDE_STEPS].reverse().map((step) => (
            <use key={step} href={`#${id}-${index}`} transform={down(level.side.dx, level.side.dy, step)} className="town-skeleton-side" />
          ))}
          <use href={`#${id}-${index}`} className={`town-skeleton-top town-skeleton-top-${index}`} />
        </g>
      ))}
      <g clipPath={`url(#${id}-land)`}>
        <rect
          className="town-skeleton-sheen"
          x={strip.x}
          y={strip.y}
          width={strip.width}
          height={strip.height}
          fill={`url(#${id}-sheen)`}
          style={{ ['--sheen-travel' as string]: `${Math.round(travel)}px` } as CSSProperties}
        />
      </g>
    </svg>
  );
}
