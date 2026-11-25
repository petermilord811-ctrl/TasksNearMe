'use client';

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { useChapters, useChaptersOn } from './chapter-stage';
import { dockFrame, farthestCorner, pinFlight, ringRadius, type Box, type StageMoment } from './timeline';

/** The map's parts the stage moves (the hook makes the refs; the map's section attaches them). */
export interface MapChapterParts {
  /** The map's box: the window onto it opens here, and it docks into its tile. */
  frame: RefObject<HTMLDivElement | null>;
  /** The card over its top left (on phones, along its top) and the explorer. */
  heading: RefObject<HTMLDivElement | null>;
  explorer: RefObject<HTMLDivElement | null>;
  /** The layer the tasks fly across, with the window's rim (`[data-window-rim]`) and its dots (`[data-flight-dot]`). */
  flight: RefObject<HTMLDivElement | null>;
  /** Over the docked map: its name and a way back to it. */
  tile: RefObject<HTMLButtonElement | null>;
}

/** How many tasks fly from the docked map into their counts at most. */
export const FLIGHT_DOTS = 12;

interface Flight {
  /** Each dot: where it starts on the undocked map (px), its color and its category. */
  dots: { x: number; y: number; color: string; category: string }[];
  /** Each category's count on its card (px on the stage), by slug. */
  counts: Map<string, { element: HTMLElement; x: number; y: number }>;
}

interface Options {
  wide: boolean;
  /** A task's category from its pin's id. */
  categoryOf: (pinId: string) => string | null;
  /** The middle of the free map (px in the map): the docked tile is cut around it. */
  focus: () => { x: number; y: number };
}

const px = (value: number) => `${value.toFixed(2)}px`;

/**
 * Moves the map's parts with the landing's stage (`timeline.ts`). Step one: the map shows through a circle around the
 * hero's first task pin that grows past the screen's corners (its rim lit), while the camera pulls back with it
 * (`arrival.ts`); then the card and the explorer come in. Step two: they leave, the map shrinks into its tile in the
 * categories' grid (a uniform scale and a crop, its corners rounding), and the tasks on it fly into their categories'
 * counts. Sizes are measured on resize and when step two starts, never while it moves; nothing is added to the page as
 * it plays. Hidden parts stay in the page (faded, not clickable) so a keyboard can still reach them: focus in one
 * brings its chapter (`chapter-stage.tsx`).
 */
export function useMapChapter(options: Options): MapChapterParts {
  const chapters = useChapters();
  const on = useChaptersOn();
  const frameRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const explorerRef = useRef<HTMLDivElement>(null);
  const flightRef = useRef<HTMLDivElement>(null);
  const tileRef = useRef<HTMLButtonElement>(null);
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !chapters || !on) return;
    const heading = headingRef.current;
    const explorer = explorerRef.current;
    const tile = tileRef.current;
    const stage = frame.closest<HTMLElement>('[data-chapter-stage]');
    let size = { width: frame.offsetWidth, height: frame.offsetHeight };
    let tileBox: Box | null = null;
    let flight: Flight | null = null;
    const rim = flightRef.current?.querySelector<HTMLElement>('[data-window-rim]') ?? null;
    const dots = Array.from(flightRef.current?.querySelectorAll<HTMLElement>('[data-flight-dot]') ?? []);

    // The stage's size and the tile's place in the grid. The grid settles after the stage does (its fonts, its photos,
    // longer words in Spanish), and the tile moves with it (owner, 2026-11-25: the docked map sat a row lower than its
    // tile): read again when the tile or the grid changes size, once the fonts are in, and as each dock starts.
    const tileElement = stage?.querySelector<HTMLElement>('[data-map-tile]') ?? null;
    const grid = stage?.querySelector<HTMLElement>('[data-category-grid]') ?? null;
    const measure = () => {
      size = { width: frame.offsetWidth, height: frame.offsetHeight };
      if (tileElement && stage) {
        const outer = stage.getBoundingClientRect();
        const box = tileElement.getBoundingClientRect();
        tileBox = { x: box.left - outer.left, y: box.top - outer.top, width: box.width, height: box.height };
      }
      flight = null;
    };
    measure();
    let docking = false;
    let alive = true;
    const sized = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    for (const element of [frame, stage, grid, tileElement]) if (element) sized?.observe(element);
    void document.fonts?.ready.then(() => {
      if (alive) measure();
    });

    /** Step two is starting: where the tasks are on the map and where their counts are, read once. */
    const prepareFlight = (dock: ReturnType<typeof dockFrame> | null): Flight => {
      const outer = stage?.getBoundingClientRect() ?? { left: 0, top: 0 };
      const found: Flight['dots'] = [];
      for (const marker of frame.querySelectorAll<HTMLElement>('[data-marker-key^="p"]')) {
        if (found.length >= dots.length) break;
        const category = latest.current.categoryOf((marker.dataset.markerKey ?? '').slice(1));
        if (!category) continue;
        const box = marker.getBoundingClientRect();
        if (box.width === 0) continue;
        let x = box.left + box.width / 2 - outer.left;
        let y = box.top + box.height / 2 - outer.top;
        // Read part-way through a dock: back to where it sits on the whole map.
        if (dock) {
          x = (x - dock.translate.x) / dock.scale;
          y = (y - dock.translate.y) / dock.scale;
        }
        if (x < 0 || y < 0 || x > size.width || y > size.height) continue;
        found.push({ x, y, category, color: `var(--cat-${category})` });
      }
      const counts: Flight['counts'] = new Map();
      for (const element of stage?.querySelectorAll<HTMLElement>('[data-open-count]') ?? []) {
        const box = element.getBoundingClientRect();
        counts.set(element.dataset.openCount ?? '', { element, x: box.left + Math.min(14, box.width / 2) - outer.left, y: box.top + box.height / 2 - outer.top });
      }
      return { dots: found, counts };
    };

    const draw = (value: number, moment: StageMoment) => {
      // A dock starting: where the tile is now.
      if (moment.dock > 0 && !docking) measure();
      docking = moment.dock > 0;
      const { width, height } = size;
      if (!width || !height) return;
      const { wide, focus } = latest.current;

      // The window: a circle around the hero's pin, with its lit rim.
      let dock: ReturnType<typeof dockFrame> | null = null;
      if (moment.ring === null) {
        frame.style.opacity = '';
        frame.style.clipPath = '';
        frame.style.transform = '';
      } else if (moment.townShown) {
        const pin = chapters.pin() ?? { x: width / 2, y: height / 2 };
        const radius = ringRadius(moment.ring, 18, farthestCorner(pin.x, pin.y, width, height));
        frame.style.opacity = '1';
        frame.style.transform = '';
        frame.style.clipPath = `circle(${px(radius)} at ${px(pin.x)} ${px(pin.y)})`;
        if (rim) {
          rim.style.visibility = '';
          rim.style.width = rim.style.height = px(radius * 2);
          rim.style.transform = `translate3d(${px(pin.x - radius)}, ${px(pin.y - radius)}, 0)`;
        }
      } else {
        frame.style.opacity = '1';
        frame.style.clipPath = '';
        if (moment.dock > 0 && tileBox) {
          dock = dockFrame(moment.dock, { width, height }, tileBox, focus(), 18);
          const { crop, scale, translate } = dock;
          frame.style.transform = `translate3d(${px(translate.x)}, ${px(translate.y)}, 0) scale(${scale.toFixed(5)})`;
          frame.style.clipPath = `inset(${px(crop.y)} ${px(width - crop.x - crop.width)} ${px(height - crop.y - crop.height)} ${px(crop.x)} round ${px(dock.radius / scale)})`;
        } else frame.style.transform = '';
      }
      if (rim && (moment.ring === null || !moment.townShown) && rim.style.visibility !== 'hidden') rim.style.visibility = 'hidden';
      // The map takes the pointer only while it's the chapter on screen.
      frame.style.pointerEvents = value >= 0.86 && value <= 1.04 ? 'auto' : 'none';

      // The card and the explorer: last in, first out.
      const shownHeading = moment.headingIn * (1 - moment.panelsOut);
      const shownExplorer = moment.explorerIn * (1 - moment.panelsOut);
      if (heading) {
        heading.style.opacity = String(shownHeading);
        heading.style.transform = shownHeading < 1 ? `translate3d(0, ${((1 - moment.headingIn) * 0.8 - moment.panelsOut * 0.4).toFixed(3)}rem, 0)` : '';
        heading.style.pointerEvents = shownHeading > 0.5 ? 'auto' : 'none';
      }
      if (explorer) {
        explorer.style.opacity = String(shownExplorer);
        explorer.style.transform = shownExplorer >= 1 ? '' : wide ? `scale(${(0.965 + 0.035 * moment.explorerIn - 0.03 * moment.panelsOut).toFixed(4)})` : `translate3d(0, ${((1 - moment.explorerIn + moment.panelsOut) * 1.4).toFixed(3)}rem, 0)`;
        explorer.style.pointerEvents = shownExplorer > 0.5 ? 'auto' : 'none';
      }

      // Step two: the tasks fly into their counts, and the counts come in as they land.
      if (moment.two > 0) flight ??= prepareFlight(dock);
      else flight = null;
      const landed = new Set<string>();
      dots.forEach((dot, index) => {
        const start = flight?.dots[index];
        const target = start ? flight?.counts.get(start.category) : undefined;
        const travel = start && target ? pinFlight(moment.two, index) : 0;
        if (!start || !target || moment.two < 0.5 || travel >= 1) {
          if (travel >= 1 && start) landed.add(start.category);
          dot.style.visibility = 'hidden';
          return;
        }
        const scale = dock?.scale ?? 1;
        const from = { x: (dock?.translate.x ?? 0) + scale * start.x, y: (dock?.translate.y ?? 0) + scale * start.y };
        const control = { x: (from.x + target.x) / 2, y: Math.min(from.y, target.y) - height * 0.14 };
        const rest = 1 - travel;
        const x = rest * rest * from.x + 2 * rest * travel * control.x + travel * travel * target.x;
        const y = rest * rest * from.y + 2 * rest * travel * control.y + travel * travel * target.y;
        dot.style.visibility = '';
        dot.style.background = start.color;
        dot.style.transform = `translate3d(${px(x)}, ${px(y)}, 0) scale(${(0.8 * (1 - 0.4 * travel)).toFixed(3)})`;
      });
      // Only on a change: the attribute restyles what's under the map (its markers and buttons).
      const docked = moment.two >= 0.5;
      if (docked !== frame.hasAttribute('data-docked')) frame.toggleAttribute('data-docked', docked);
      for (const [category, count] of flight?.counts ?? []) {
        const shown = landed.has(category) || (moment.two >= 0.92 && !flight?.dots.some((dot) => dot.category === category));
        count.element.style.opacity = shown ? '1' : '';
        count.element.style.transform = shown ? 'none' : '';
      }

      // The docked map's name, and a way back to it.
      if (tile) {
        const shown = moment.labelIn;
        tile.style.visibility = shown > 0 && tileBox ? '' : 'hidden';
        if (shown > 0 && tileBox) {
          tile.style.opacity = String(shown);
          tile.style.transform = `translate3d(${px(tileBox.x)}, ${px(tileBox.y)}, 0)`;
          tile.style.width = px(tileBox.width);
          tile.style.height = px(tileBox.height);
        }
        tile.style.pointerEvents = shown > 0.5 ? 'auto' : 'none';
      }
    };
    const stop = chapters.subscribe(draw);
    return () => {
      alive = false;
      stop();
      sized?.disconnect();
      // Off the stage: everything back as it was.
      for (const element of [frame, heading, explorer, tile]) {
        if (!element) continue;
        for (const property of ['clip-path', 'transform', 'opacity', 'pointer-events', 'width', 'height']) element.style.removeProperty(property);
        element.removeAttribute('data-docked');
      }
      for (const dot of dots) dot.style.visibility = 'hidden';
      if (rim) rim.style.visibility = 'hidden';
      for (const count of stage?.querySelectorAll<HTMLElement>('[data-open-count]') ?? []) {
        count.style.removeProperty('opacity');
        count.style.removeProperty('transform');
      }
    };
  }, [chapters, on]);

  return { frame: frameRef, heading: headingRef, explorer: explorerRef, flight: flightRef, tile: tileRef };
}
