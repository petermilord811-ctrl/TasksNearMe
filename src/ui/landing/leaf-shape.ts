/**
 * A maple leaf's outline, as a distance from its middle (1 at the top lobe's tip) at `theta` from the top, clockwise:
 * five pointed lobes with deep notches between them, the bottom two smaller, small teeth, and a notch at the stem.
 * The falling leaves (weather.tsx) and the closing card's ornament (season-ornament.tsx) both trace it.
 */
export function mapleRadius(theta: number): number {
  const lobes = Math.pow(1 - Math.abs(Math.sin(2.5 * theta)), 1.4);
  const teeth = Math.pow(1 - Math.abs(Math.sin(7.5 * theta)), 3);
  const size = 0.6 + 0.4 * ((1 + Math.cos(theta)) / 2);
  return 0.42 + 0.5 * lobes * size + 0.06 * teeth;
}
