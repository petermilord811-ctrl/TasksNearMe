/**
 * The hero town's build-up, as one timeline the 3D town (`town.ts`) and its stage (`town-stage.tsx`) share. It
 * starts from the skeleton's state (the land already in place, seen from the resting camera), so the skeleton
 * cross-fades into the live town without a jump; then the houses grow, the trees pop up in a wave from the
 * middle, the pins drop in, and the things that move fade in. Fractions of `seconds`; `[from, length]`.
 */
export const BUILD_UP = {
  seconds: 2.3,
  houses: [0.08, 0.42],
  trees: [0.18, 0.55],
  pins: [0.52, 0.3],
  movers: [0.58, 0.34],
  /** The cards bloom in as the pins land. */
  cards: 0.72,
} as const;
