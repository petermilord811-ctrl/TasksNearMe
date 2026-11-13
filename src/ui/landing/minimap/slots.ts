import type { TownLayout } from './scene';

/**
 * Where the mini-map's pins stand on each layout's stage (fractions of its width and height): the pin's head
 * (the still picture draws its pin there), the top of the head (cards hang from it), and the ring's center on
 * the plate. They're fixed because the towns are: `scene.test.ts` checks them against the generator and the
 * camera, so they never drift. The 3D view moves its pins a little (they bob, the camera leans toward the
 * pointer and tilts as the hero scrolls away) and reports where they are each frame instead.
 */

export const SLOT_IDS = ['center', 'east', 'west', 'north', 'south'] as const;
export type SlotId = (typeof SLOT_IDS)[number];

type Point = { x: number; y: number };
export type SlotAnchor = { head: Point; top: Point; base: Point };

export const SLOT_ANCHORS: Record<TownLayout, Record<SlotId, SlotAnchor>> = {
  wide: {
    center: { head: { x: 0.6142, y: 0.4319 }, top: { x: 0.6145, y: 0.4154 }, base: { x: 0.6129, y: 0.4976 } },
    east: { head: { x: 0.9254, y: 0.6004 }, top: { x: 0.9267, y: 0.5836 }, base: { x: 0.9205, y: 0.6672 } },
    west: { head: { x: 0.1702, y: 0.7927 }, top: { x: 0.1692, y: 0.7757 }, base: { x: 0.1743, y: 0.8607 } },
    north: { head: { x: 0.8616, y: 0.1739 }, top: { x: 0.8626, y: 0.158 }, base: { x: 0.8579, y: 0.2374 } },
    south: { head: { x: 0.7765, y: 0.8266 }, top: { x: 0.7774, y: 0.8095 }, base: { x: 0.773, y: 0.8948 } },
  },
  band: {
    center: { head: { x: 0.5616, y: 0.2515 }, top: { x: 0.562, y: 0.2209 }, base: { x: 0.5604, y: 0.3718 } },
    east: { head: { x: 0.9227, y: 0.392 }, top: { x: 0.9249, y: 0.3609 }, base: { x: 0.9139, y: 0.5145 } },
    west: { head: { x: 0.1603, y: 0.5091 }, top: { x: 0.1584, y: 0.4776 }, base: { x: 0.1675, y: 0.6332 } },
    north: { head: { x: 0.2561, y: 0.2423 }, top: { x: 0.2549, y: 0.2118 }, base: { x: 0.261, y: 0.3625 } },
    south: { head: { x: 0.6397, y: 0.702 }, top: { x: 0.6405, y: 0.6699 }, base: { x: 0.6365, y: 0.8283 } },
  },
};

/** Which pins carry a card on each layout, where it sits (px from the top of the pin's head), and from which width. */
export const CARD_PLACEMENTS: Record<TownLayout, Partial<Record<SlotId, { dx: number; dy: number; from: 'sm' | 'md' | 'lg' | 'xl' }>>> = {
  wide: {
    center: { dx: -120, dy: -146, from: 'lg' },
    // From xl only: below 1280 px the wide stage runs past the screen's right edge.
    east: { dx: -282, dy: -124, from: 'xl' },
  },
  band: {
    // Beside its pin, not above it: the band's top edge fades into the page.
    center: { dx: 26, dy: -52, from: 'sm' },
  },
};
