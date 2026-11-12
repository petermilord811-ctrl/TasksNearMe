/**
 * Motion tokens: one source for durations, easings and springs (mirrored as CSS variables in
 * src/ui/theme/globals.css). Calm and quick: 150–700 ms, ease-out, springs without bounce.
 */
export const duration = {
  instant: 120,
  fast: 200,
  base: 320,
  slow: 560,
  slower: 800,
} as const;

/** Cubic-bezier control points (for motion/react and the canvas). */
export const easing = {
  out: [0.22, 1, 0.36, 1],
  inOut: [0.65, 0, 0.35, 1],
} as const;

export const spring = {
  /** Panels and cards that grow out of their trigger. */
  bloom: { type: 'spring', stiffness: 260, damping: 30, mass: 0.9 },
  /** Small things that follow the pointer. */
  follow: { type: 'spring', stiffness: 170, damping: 22, mass: 0.6 },
} as const;

/** Stagger between siblings in a group (ms). */
export const stagger = 70;

/** The out-expo-like curve as a function (0–1 → 0–1), for rAF tweens. */
export function easeOut(t: number): number {
  return 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 4);
}
