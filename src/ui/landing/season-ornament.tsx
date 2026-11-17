import type { ReactNode } from 'react';
import type { Season } from '@/shared/seasons';
import { cn } from '@/ui/lib/utils';
import { mapleRadius } from './leaf-shape';

/** Where the shapes sit (percent of the box), how big (px), turned how far, and how strong: around the edges,
 *  clear of the words in the middle. */
const SPOTS = [
  { x: 5, y: 15, size: 46, turn: -14, alpha: 0.2 },
  { x: 13, y: 68, size: 30, turn: 22, alpha: 0.15 },
  { x: 24, y: 9, size: 20, turn: 40, alpha: 0.13 },
  { x: 3, y: 88, size: 24, turn: -30, alpha: 0.13 },
  { x: 91, y: 13, size: 38, turn: 18, alpha: 0.2 },
  { x: 96, y: 50, size: 22, turn: -24, alpha: 0.13 },
  { x: 85, y: 79, size: 52, turn: 8, alpha: 0.17 },
  { x: 71, y: 93, size: 18, turn: -40, alpha: 0.12 },
  { x: 33, y: 92, size: 26, turn: 30, alpha: 0.11 },
] as const;

/** A maple leaf (the weather's outline), traced around its middle in a 100 × 100 box; its stem is drawn apart. */
const MAPLE = (() => {
  const points: string[] = [];
  for (let step = 0; step <= 120; step++) {
    const theta = (step / 120) * Math.PI * 2;
    const r = mapleRadius(theta) * 47;
    points.push(`${(50 + Math.sin(theta) * r).toFixed(1)} ${(47 - Math.cos(theta) * r).toFixed(1)}`);
  }
  return `M${points.join('L')}Z`;
})();

/** Each season's shapes, drawn in a 100 × 100 box in the current color. */
const SHAPES: Record<Season, ((index: number) => ReactNode)> = {
  winter: () => (
    <g stroke="currentColor" strokeWidth="6" strokeLinecap="round" fill="none">
      {[0, 60, 120, 180, 240, 300].map((angle) => (
        <g key={angle} transform={`rotate(${angle} 50 50)`}>
          <path d="M50 50V8" />
          <path d="M50 24L39 14M50 24L61 14M50 38L42 31M50 38L58 31" />
        </g>
      ))}
    </g>
  ),
  fall: (index) =>
    index % 2 === 0 ? (
      <g fill="currentColor">
        <path d={MAPLE} />
        <path d="M50 62V98" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      </g>
    ) : (
      <g fill="currentColor">
        <path d="M50 4Q88 40 50 92Q12 40 50 4Z" />
        <path d="M50 14V98" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity="0.5" />
      </g>
    ),
  spring: () => (
    <g fill="currentColor">
      {[0, 72, 144, 216, 288].map((angle) => (
        <ellipse key={angle} cx="50" cy="27" rx="15" ry="21" transform={`rotate(${angle} 50 50)`} />
      ))}
      <circle cx="50" cy="50" r="9" opacity="0.6" />
    </g>
  ),
  summer: (index) =>
    index % 3 === 0 ? (
      <g fill="currentColor">
        <circle cx="50" cy="50" r="17" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
          <rect key={angle} x="47" y="6" width="6" height="18" rx="3" transform={`rotate(${angle} 50 50)`} />
        ))}
      </g>
    ) : (
      <path d="M50 4C54 40 60 46 96 50C60 54 54 60 50 96C46 60 40 54 4 50C40 46 46 40 50 4Z" fill="currentColor" />
    ),
};

/**
 * A quiet scatter of the season's shapes (snowflakes, leaves, blossoms, suns and sparkles) for a colored card: still,
 * decorative and out of the way of its words. It fills its positioned parent and takes the parent's text color.
 */
export function SeasonOrnament({ season, className }: { season: Season; className?: string }) {
  const shape = SHAPES[season];
  return (
    <div aria-hidden="true" data-ornament={season} className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      {SPOTS.map((spot, index) => (
        <svg
          key={index}
          viewBox="0 0 100 100"
          focusable="false"
          className="absolute"
          style={{ left: `${spot.x}%`, top: `${spot.y}%`, width: spot.size, height: spot.size, opacity: spot.alpha, transform: `translate(-50%, -50%) rotate(${spot.turn}deg)` }}
        >
          {shape(index)}
        </svg>
      ))}
    </div>
  );
}
