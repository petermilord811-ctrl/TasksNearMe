'use client';

import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { useEffect, useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode, type SyntheticEvent } from 'react';
import { useTranslations } from 'next-intl';
import { BadgeCheck, MapPin, Pause, Play, Star } from 'lucide-react';
import { routes, type HelperSummary, type TaskPublicView } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { usePrefersReducedMotion } from '@/ui/motion';
import { cn } from '@/ui/lib/utils';
import type { Season } from '@/shared/seasons';
import type { TownFlora } from './flora';
import { setHeroPaused, useHeroPaused } from '../hero-pause';
import { clearHeroReady, markHeroReady } from '../hero-ready';
import { MAP_SECTION_ID, useOptionalLanding } from '../landing-state';
import { BUILD_UP } from './build-up';
import type { TownLayout, TownModel } from './scene';
import type { SceneReply, SceneRequest } from './scene-worker';
import { CARD_PLACEMENTS, SLOT_ANCHORS, SLOT_IDS, type SlotId } from './slots';
import type { TownController, TownView } from './town';

export type TownMode = 'interactive' | 'static';

/** On the wide stage, the hero's words must end by this fraction of its height (the plates' tallest things start below). */
const WORDS_FIT = 0.76;
const CARD = { width: 240, height: 98 };
/** Wide screens get the town beside the headline; narrower ones get the band under it (the hero's `lg`). */
const WIDE_QUERY = '(min-width: 1024px)';
/** Both layouts' skeletons, stills, pins and cards are rendered; CSS shows the one for the screen's width. */
const LAYOUTS: { layout: TownLayout; shown: string }[] = [
  { layout: 'band', shown: 'lg:hidden' },
  { layout: 'wide', shown: 'hidden lg:block' },
];
/** The skeleton fades off the live town that's drawn under it, then goes (ms, matching the classes below). */
const SKELETON_FADE = 650;
/** Without a live town, the still picture fades in over the skeleton, which then goes. */
const STILL_FADE = 750;
/** The cards bloom in one after another as their pins land. */
const CARD_STAGGER = 90;
/** A card stays pointed at for a moment after the pointer slips off it (no flicker at its edges). */
const HOVER_GRACE = 140;

/** Which layout the screen shows now (the server renders both; CSS shows the right one before this runs). */
function useTownLayout(): TownLayout {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== 'function') return () => {};
      const list = window.matchMedia(WIDE_QUERY);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => (typeof window.matchMedia === 'function' && window.matchMedia(WIDE_QUERY).matches ? 'wide' : 'band'),
    () => 'wide',
  );
}

/** A software renderer (no GPU acceleration) would draw the town slowly and drain the battery. */
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render/i;

/**
 * Whether the 3D town will run well here: WebGL 2 on a real GPU (asked on the page, when the worker couldn't
 * tell). Without one, the still picture stays.
 */
function webglWorthIt(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2');
    if (!gl) return false;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return !SOFTWARE_RENDERER.test(renderer);
  } catch {
    return false;
  }
}

/**
 * The town's worker (see `scene-worker.ts`): which GPU draws WebGL here (null when it can't tell), then the
 * layout's town. Null when workers aren't available: then both are done on the page (the town in steps).
 */
function startTownWorker(layout: TownLayout, flora: TownFlora, signal: AbortSignal): { gpu: Promise<string | null>; scene: Promise<TownModel | null>; stop: () => void } | null {
  let worker: Worker;
  try {
    worker = new Worker(new URL('./scene-worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
  let answerGpu: (name: string | null) => void = () => {};
  let answerScene: (model: TownModel | null) => void = () => {};
  const gpu = new Promise<string | null>((resolve) => (answerGpu = resolve));
  const scene = new Promise<TownModel | null>((resolve) => (answerScene = resolve));
  const stop = () => {
    worker.terminate();
    signal.removeEventListener('abort', stop);
    answerGpu(null);
    answerScene(null);
  };
  signal.addEventListener('abort', stop, { once: true });
  worker.onmessage = (event: MessageEvent<SceneReply>) => {
    const reply = event.data;
    if (reply.kind === 'gpu') answerGpu(reply.renderer);
    else {
      answerScene(reply.layout === layout && reply.flora === flora ? reply.model : null);
      stop();
    }
  };
  worker.onerror = stop;
  worker.postMessage({ layout, flora } satisfies SceneRequest);
  return { gpu, scene, stop };
}

/** The canvas's pixel ratio: sharp enough, but light on the GPU (at most 1.5, and about 4 million pixels). */
function pixelRatio(width: number, height: number, coarse: boolean): number {
  const budget = Math.sqrt(4_000_000 / Math.max(1, width * height));
  return Math.max(1, Math.min(window.devicePixelRatio || 1, coarse ? 1.25 : 1.5, budget));
}

const darkAt = (element: Element) => {
  const scheme = getComputedStyle(element).colorScheme;
  return scheme.includes('dark') && !scheme.includes('light');
};

/** The canvas covers the window; the stage (the composition's box) sits somewhere in it, maybe partly outside. */
function measureView(view: HTMLElement, stage: HTMLElement): TownView {
  const outer = view.getBoundingClientRect();
  const inner = stage.getBoundingClientRect();
  return {
    width: Math.max(1, outer.width),
    height: Math.max(1, outer.height),
    stage: { left: inner.left - outer.left, top: inner.top - outer.top, width: Math.max(1, inner.width), height: Math.max(1, inner.height) },
  };
}

/** Where a card's leader line meets it: the point of the card nearest the pin, pulled in a little. */
function attachPoint(dx: number, dy: number): { x: number; y: number } {
  const x = Math.min(Math.max(0, dx + 14), dx + CARD.width - 14);
  const y = Math.min(Math.max(0, dy + 12), dy + CARD.height - 12);
  return { x, y };
}

/** A card shows from this width up (Tailwind needs the class names written out). */
const FROM: Record<'sm' | 'md' | 'lg' | 'xl', string> = { sm: 'sm:block', md: 'md:block', lg: 'lg:block', xl: 'xl:block' };

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/**
 * The hero's mini-map: a window (`className`, placed and sized by the hero) onto a stage of fixed shape
 * (`stageClassName` places it): 16:10 beside the headline on wide screens, a 10:8 band under it on narrower
 * ones, each with its own town. In `interactive` mode it shows the town's skeleton from the first paint (its land,
 * drawn on the server from the same scene and camera: `skeleton`) while it gets the 3D town (three.js) ready
 * without holding up the page: the scene is built in a worker while the 3D code downloads, the town is put
 * together in short steps, its shaders compile in the background, and its first frame is drawn while it's
 * hidden. Then the skeleton fades off the live land under it and the town builds itself up (`BUILD_UP`): the
 * houses grow, the trees pop up, the pins drop in and their cards bloom in as they land (again if the screen
 * crosses into the other layout). It runs only while it's on screen, the
 * tab is visible, motion is allowed and the visitor hasn't paused it (a still frame otherwise; the pause button
 * stays inside the window, in view). As the town scrolls away, the camera tilts toward a view from above and
 * pulls back, handing over to the real map below. The pins carry real open tasks, colored by category; the
 * cards hang from their pins' resting places (a lifting pin never moves its card from under the pointer),
 * quiet down when another category is pointed at, and a click shows the task on the real map. In `static` mode
 * (previews, tests) it shows the still picture, with the same pins and cards; without a GPU (or if the town
 * can't start) the still fades in over the skeleton. Reduced motion or a paused town: no build-up and no shimmer.
 *
 * It tells the page when it's done (`markHeroReady`: built up, or the still is in), so the map below starts
 * loading after it rather than during it.
 *
 * The town is decorative (`aria-hidden`); the cards copy tasks the map's list already offers, so they're out
 * of the tab order.
 */
export function TownStage({
  tasks,
  helper,
  mode,
  season,
  flora = 'texas',
  weather = false,
  skeleton,
  className,
  stageClassName,
  controlsClassName,
}: {
  tasks: TaskPublicView[];
  helper?: HelperSummary;
  mode: TownMode;
  /** The season the town is dressed for (its trees, lawns, water and light; its still picture). */
  season: Season;
  /** Which region's plants grow in the town (flora.ts: the market's), and so which still pictures it shows. */
  flora?: TownFlora;
  /** The season's weather moves over the town (SeasonWeather): the Pause button shows from the start, for both. */
  weather?: boolean;
  /** The town's skeleton (`TownSkeleton`, rendered on the server), shown until the live town takes over. */
  skeleton?: ReactNode;
  className?: string;
  stageClassName?: string;
  controlsClassName?: string;
}) {
  const t = useTranslations('landing.hero');
  const tMap = useTranslations('landing.map');
  const landing = useOptionalLanding();
  const reduced = usePrefersReducedMotion();
  const paused = useHeroPaused();
  const layout = useTownLayout();
  // Read inside the town's frame callback (set once per town), so kept in refs.
  const reducedRef = useRef(reduced);
  const pausedRef = useRef(paused);
  useEffect(() => {
    reducedRef.current = reduced;
    pausedRef.current = paused;
  }, [reduced, paused]);
  // The town is built once per layout; a new season repaints it (below) rather than building it again.
  const seasonRef = useRef(season);
  const paintedFor = useRef(season);
  useEffect(() => {
    seasonRef.current = season;
  }, [season]);
  const windowRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const lineRefs = useRef(new Map<string, SVGPathElement>());
  const viewRef = useRef<TownView | null>(null);
  /** The canvas's box on the screen and the viewport's size (kept on resize and scroll: never read in the frame loop). */
  const boxRef = useRef<{ left: number; top: number; width: number; height: number; viewportWidth: number; viewportHeight: number } | null>(null);
  /** Where each card and leader line was last put (written only when it moved). */
  const placedRef = useRef(new Map<string, string>());
  const hoveredRef = useRef<string | null>(null);
  const leaveTimer = useRef(0);
  // Each of these belongs to a layout, so the moment the screen crosses into the other one, everything below
  // sees no town (the old one is let go), its skeleton is back, and nothing is drawn with a town that's gone.
  const [built, setBuilt] = useState<{ town: TownController; layout: TownLayout } | null>(null);
  /** No live town: previews and tests (static), no GPU, or it couldn't start. The still picture shows instead. */
  const [failed, setFailed] = useState(mode === 'static');
  /** The layout whose live town has drawn (it's shown, under the skeleton, which fades off it). */
  const [shownIn, setShownIn] = useState<TownLayout | null>(null);
  /** The layout whose skeleton has faded off its live town (and is gone). */
  const [revealedIn, setRevealedIn] = useState<TownLayout | null>(null);
  /** The layout whose cards are in (its pins have landed). */
  const [cardsIn, setCardsIn] = useState<TownLayout | null>(null);
  /** The still picture has loaded (it fades in over the skeleton), and then the skeleton is gone. */
  const [stillReady, setStillReady] = useState(mode === 'static');
  const [stillDone, setStillDone] = useState(mode === 'static');
  /** The still picture couldn't load (missing, offline): the skeleton stays, with the pins and cards on it. */
  const [stillBroken, setStillBroken] = useState(false);
  /** The theme when the still was called for: its picture loads first (eager, high priority), the other's lazily. */
  const [stillDark, setStillDark] = useState(false);
  const [onScreen, setOnScreen] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [covered, setCovered] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  const pins = tasks.slice(0, SLOT_IDS.length).map((task, index) => ({ slotId: SLOT_IDS[index]!, task }));
  const focus = landing?.activeCategory ?? null;
  const lit = hovered ?? landing?.litTaskId ?? null;
  const town = built !== null && built.layout === layout ? built.town : null;
  const shown = town !== null && shownIn === layout;
  const live = shown;
  const skeletonFading = shown || (failed && stillReady && !stillBroken);
  const skeletonGone = failed ? stillDone && !stillBroken : shown && revealedIn === layout;
  const cardsShown = (drawn: TownLayout) => (failed ? stillReady : cardsIn === drawn);
  const pinsKey = pins.map((pin) => `${pin.slotId}:${pin.task.id}:${pin.task.categorySlug}`).join('|');

  // Get the layout's town ready (only on a real GPU), without long pauses on the main thread.
  useEffect(() => {
    if (mode === 'static') return;
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    const view = windowRef.current;
    if (!canvas || !stage || !view) return;
    const controller = new AbortController();
    let made: TownController | null = null;
    const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    // Off the main thread, right away: the worker (which GPU, then the scene) and the 3D code's download.
    // Putting the town together waits until the page has settled after its first paint (the still is up).
    const worker = startTownWorker(layout, flora, controller.signal);
    const code = import('./town');
    code.catch(() => {}); // a failed download is handled where it's awaited
    // Whether this GPU is worth it, as soon as the worker can tell: without one the still picture is the page's
    // largest picture (its LCP on phones), so it starts loading now rather than after the page has settled.
    const worthIt = (async () => {
      const gpu = worker ? await worker.gpu : null;
      return typeof gpu === 'string' ? !SOFTWARE_RENDERER.test(gpu) : webglWorthIt();
    })();
    void worthIt.then((ok) => {
      if (ok || controller.signal.aborted) return;
      worker?.stop();
      setStillDark(darkAt(stage));
      setFailed(true);
    });
    const build = async () => {
      if (!(await worthIt) || controller.signal.aborted) return;
      try {
        const [model, { createTown, townPalette }] = await Promise.all([worker ? worker.scene : Promise.resolve(null), code]);
        if (controller.signal.aborted) return;
        const measured = measureView(view, stage);
        viewRef.current = measured;
        const dark = darkAt(stage);
        paintedFor.current = seasonRef.current;
        const next = await createTown(canvas, {
          palette: townPalette(dark ? 'dark' : 'light', paintedFor.current, flora),
          shadowSize: coarse ? 1024 : 2048,
          layout,
          flora,
          // It grows out of its skeleton (unless motion is reduced or it's paused: then it's simply there).
          buildUp: true,
          scene: model ?? undefined,
          size: { width: measured.width, height: measured.height, pixelRatio: pixelRatio(measured.width, measured.height, coarse), view: measured },
          signal: controller.signal,
        });
        if (controller.signal.aborted) {
          next.dispose();
          return;
        }
        // The theme may have changed while it was being built.
        if (darkAt(stage) !== dark) next.setPalette(townPalette(dark ? 'light' : 'dark', seasonRef.current, flora));
        made = next;
        setBuilt({ town: next, layout });
      } catch (error) {
        if (controller.signal.aborted) return;
        // The still picture stays; in development, say why.
        if (process.env.NODE_ENV !== 'production') console.error('The 3D town could not start:', error);
        setStillDark(darkAt(stage));
        setFailed(true);
      }
    };
    // Safari has no requestIdleCallback: a short timeout instead.
    const hasIdle = typeof window.requestIdleCallback === 'function';
    const handle = hasIdle ? window.requestIdleCallback(() => void build(), { timeout: 300 }) : window.setTimeout(() => void build(), 60);
    return () => {
      controller.abort();
      if (hasIdle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
      made?.dispose();
      setBuilt((current) => (current?.town === made ? null : current));
    };
  }, [mode, layout, flora]);

  // The skeleton fades off the live town drawn under it, then goes.
  useEffect(() => {
    if (!shown) return;
    const timer = window.setTimeout(() => setRevealedIn(layout), reduced ? 0 : SKELETON_FADE);
    return () => window.clearTimeout(timer);
  }, [shown, reduced, layout]);

  // No live town: the still picture fades in over the skeleton (once it has loaded), then the skeleton goes.
  useEffect(() => {
    if (!failed || !stillReady || stillDone) return;
    const timer = window.setTimeout(() => setStillDone(true), reduced ? 0 : STILL_FADE);
    return () => window.clearTimeout(timer);
  }, [failed, stillReady, stillDone, reduced]);

  // The page below waits for the hero: ready when the town has built up (see the frame callback), or once the
  // still picture is in.
  useEffect(() => {
    if (failed && stillReady) markHeroReady();
  }, [failed, stillReady]);
  useEffect(() => () => clearHeroReady(), []);
  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);

  // Keep the canvas sharp at the window's size, showing the stage's part of it; follow the theme.
  useEffect(() => {
    const stage = stageRef.current;
    const view = windowRef.current;
    if (!town || !stage || !view) return;
    const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    const resize = new ResizeObserver(() => {
      const measured = measureView(view, stage);
      viewRef.current = measured;
      const box = view.getBoundingClientRect();
      boxRef.current = { left: box.left, top: box.top, width: box.width, height: box.height, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight };
      town.setSize(measured.width, measured.height, pixelRatio(measured.width, measured.height, coarse));
      town.setView(measured);
      town.renderOnce();
    });
    resize.observe(view);
    resize.observe(stage);
    let dark = darkAt(stage);
    const repaint = () => {
      const next = darkAt(stage);
      if (next === dark) return;
      dark = next;
      void import('./town').then(({ townPalette }) => {
        town.setPalette(townPalette(dark ? 'dark' : 'light', season, flora));
        town.renderOnce();
      });
    };
    const themeWatch = new MutationObserver(repaint);
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    const media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    media?.addEventListener('change', repaint);
    // Another season (a preview switching it): the same town, repainted.
    if (paintedFor.current !== season) {
      paintedFor.current = season;
      void import('./town').then(({ townPalette }) => {
        town.setPalette(townPalette(dark ? 'dark' : 'light', season, flora));
        town.renderOnce();
      });
    }
    return () => {
      resize.disconnect();
      themeWatch.disconnect();
      media?.removeEventListener('change', repaint);
    };
  }, [town, season, flora]);

  // Run only while it's seen.
  useEffect(() => {
    const view = windowRef.current;
    if (!view || !('IntersectionObserver' in window)) return;
    const seen = new IntersectionObserver(([entry]) => setOnScreen(Boolean(entry?.isIntersecting)), { rootMargin: '80px 0px' });
    seen.observe(view);
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      seen.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!town) return;
    // Reduced motion, or paused: no build-up, the town is simply there.
    if (reduced || paused) town.finishIntro();
    if (onScreen && !hidden && !covered && !reduced && !paused) town.start();
    else {
      town.stop();
      if (!covered) town.renderOnce();
    }
  }, [town, onScreen, hidden, covered, reduced, paused]);

  // As the page scrolls on, the camera tilts toward a view from above and pulls back (the real map takes over).
  // Wide screens: the hero is pinned and the map's section slides up over it, so the tilt follows how much of the
  // screen that sheet covers, and the town stops drawing once it's covered. Phones: it follows the town's own way
  // out of view, starting after the text.
  useEffect(() => {
    const view = windowRef.current;
    if (!town || !view) return;
    const sheet = layout === 'wide' ? document.getElementById(MAP_SECTION_ID) : null;
    let frame = 0;
    const update = () => {
      frame = 0;
      const viewport = window.innerHeight || 1;
      const box = view.getBoundingClientRect();
      boxRef.current = { left: box.left, top: box.top, width: box.width, height: box.height, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight };
      let progress: number;
      if (sheet) {
        const top = sheet.getBoundingClientRect().top;
        progress = Math.max(0, Math.min(1, 1 - top / viewport));
        setCovered(top <= 0);
      } else {
        const top = box.top + window.scrollY;
        const start = Math.max(0, top - viewport * 0.35);
        const end = Math.max(start + 1, top + box.height - viewport * 0.15);
        progress = Math.max(0, Math.min(1, (window.scrollY - start) / (end - start)));
        setCovered(false);
      }
      if (reduced) return;
      town.setTilt(easeInOut(progress));
      if (paused) town.renderOnce();
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [town, reduced, paused, layout]);

  // The pins: real tasks, colored by category; another category quiets them, the pointed-at one lifts.
  useEffect(() => {
    const stage = stageRef.current;
    if (!town || !stage) return;
    const css = getComputedStyle(stage);
    town.setPins(
      pins.map(({ slotId, task }) => ({
        slotId,
        // Each pin's yard shows its own kind of task (a moving truck, a leaf pile…).
        category: task.categorySlug,
        color: css.getPropertyValue(`--cat-${task.categorySlug}`).trim() || '#7c5cff',
        dim: focus !== null && task.categorySlug !== focus,
        lit: lit === task.id,
      })),
    );
    town.renderOnce();
    // `pins` is derived from `tasks`; `pinsKey` says when it changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [town, pinsKey, focus, lit]);

  // Every frame: the camera leans toward the pointer (held still while a card is pointed at, so the card stays
  // under it), this layout's cards follow their pins' resting places, and their leader lines reach the pins
  // themselves (which bob, and lift while lit). The first frame drawn here shows the town (the skeleton fades
  // off it); the build-up's progress brings the cards in as the pins land, and says when the hero is done.
  useEffect(() => {
    if (!town) return;
    const pointer = landing?.pointer;
    const placed = placedRef.current;
    placed.clear();
    let drawn = false;
    let cards = false;
    let done = false;
    town.onFrame(() => {
      const sample = pointer?.current;
      if (!hoveredRef.current) town.setPointer(sample?.active ? sample.x * 2 - 1 : 0, sample?.active ? sample.y * 2 - 1 : 0, Boolean(sample?.active));
      // The pointer over the town itself (its canvas): the town reacts where it points. Not with reduced motion or paused.
      const box = boxRef.current;
      if (box && sample?.active && !reducedRef.current && !pausedRef.current) {
        const fx = (sample.x * box.viewportWidth - box.left) / Math.max(1, box.width);
        const fy = (sample.y * box.viewportHeight - box.top) / Math.max(1, box.height);
        town.setHover(fx * 2 - 1, 1 - fy * 2, fx >= 0 && fx <= 1 && fy >= 0 && fy <= 1);
      } else town.setHover(0, 0, false);
      const view = viewRef.current;
      if (view) {
        for (const slotId of SLOT_IDS) {
          const key = `${layout}:${slotId}`;
          const element = cardRefs.current.get(key);
          if (!element) continue;
          const rest = town.pinAt(slotId, true);
          if (!rest) continue;
          // Moved by transform from the stage's corner (no layout), and only when it has moved.
          const at = `translate3d(${(rest.x * view.width - view.stage.left).toFixed(1)}px, ${(rest.y * view.height - view.stage.top).toFixed(1)}px, 0)`;
          // A card element new to this (its first frame, or mounted again) switches from its left/top to the transform.
          if (!element.hasAttribute('data-town-placed')) {
            element.setAttribute('data-town-placed', '');
            element.style.left = '0';
            element.style.top = '0';
            placed.delete(key);
            placed.delete(`${key}:line`);
          }
          if (placed.get(key) !== at) {
            placed.set(key, at);
            element.style.transform = at;
          }
          const line = lineRefs.current.get(key);
          const now = town.pinAt(slotId);
          const placement = CARD_PLACEMENTS[layout][slotId];
          if (line && now && placement) {
            const attach = attachPoint(placement.dx, placement.dy);
            const d = `M${((now.x - rest.x) * view.width).toFixed(1)} ${((now.y - rest.y) * view.height).toFixed(1)}L${attach.x} ${attach.y}`;
            const lineKey = `${key}:line`;
            if (placed.get(lineKey) !== d) {
              placed.set(lineKey, d);
              line.setAttribute('d', d);
            }
          }
        }
      }
      if (!drawn) {
        drawn = true;
        setShownIn(layout);
      }
      const progress = town.buildProgress();
      if (!cards && progress >= BUILD_UP.cards) {
        cards = true;
        setCardsIn(layout);
      }
      if (!done && progress >= 1) {
        done = true;
        markHeroReady();
      }
    });
    // A stopped town (reduced motion, paused, off screen) draws this frame now; a running one draws it next.
    town.renderOnce();
    return () => town.onFrame(null);
  }, [town, layout, landing?.pointer]);

  // Wide screens: the hero's words sit over the town's empty top-left corner and must end above its plates
  // (the tallest things under them start at about 76% of the stage's height, which is the hero's height). When
  // the words are taller (a short screen, bigger text), the hero grows so the whole town grows with it.
  useEffect(() => {
    const hero = windowRef.current?.closest('section');
    const words = hero?.querySelector<HTMLElement>('[data-hero-words] > *');
    if (!hero || !words || layout !== 'wide') return;
    let frame = 0;
    const fit = () => {
      frame = 0;
      hero.style.removeProperty('min-height');
      const top = hero.getBoundingClientRect().top;
      const needed = Math.ceil((words.getBoundingClientRect().bottom - top) / WORDS_FIT);
      if (needed > hero.getBoundingClientRect().height + 1) hero.style.minHeight = `${needed}px`;
      // Pinned, a hero taller than the screen stays put once its bottom reaches the screen's bottom.
      hero.style.setProperty('--hero-stick', `${Math.min(0, Math.round(window.innerHeight - hero.getBoundingClientRect().height))}px`);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(fit);
    };
    fit();
    const sized = new ResizeObserver(schedule);
    sized.observe(words);
    window.addEventListener('resize', schedule, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      sized.disconnect();
      window.removeEventListener('resize', schedule);
      hero.style.removeProperty('min-height');
      hero.style.removeProperty('--hero-stick');
    };
  }, [layout]);

  // A still that doesn't load mustn't hold the page back: the pins and cards come in over the skeleton, and the
  // map below starts. Only the picture being shown counts (the other theme's may be fetched too).
  const stillFailed = (event: SyntheticEvent<HTMLImageElement>) => {
    if (event.currentTarget.checkVisibility?.() === false) return;
    setStillBroken(true);
    setStillReady(true);
  };
  const showOnMap = (event: MouseEvent, task: TaskPublicView) => {
    if (!landing || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    landing.focusTask({ id: task.id, categorySlug: task.categorySlug });
  };
  const pointAt = (id: string) => {
    window.clearTimeout(leaveTimer.current);
    hoveredRef.current = id;
    setHovered(id);
  };
  const pointAway = (id: string) => {
    window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => {
      if (hoveredRef.current !== id) return;
      hoveredRef.current = null;
      setHovered(null);
    }, HOVER_GRACE);
  };

  return (
    <div ref={windowRef} className={cn('pointer-events-none', className)}>
      {/* The live town draws the whole window: the stage's part, or more of the land around it. */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className={cn('absolute inset-0 size-full transition-opacity duration-[250ms] motion-reduce:transition-none', live ? 'opacity-100' : 'opacity-0', failed && 'hidden')}
      />

      <div ref={stageRef} className={cn('absolute aspect-[10/8] lg:aspect-[16/10]', stageClassName)}>
        {/* The skeleton: from the first paint until the live town is drawn under it (or the still is in). */}
        {mode !== 'static' && skeleton && !skeletonGone && (
          <div aria-hidden="true" className={cn('absolute inset-0 transition-opacity duration-[650ms] ease-out motion-reduce:transition-none', skeletonFading && 'opacity-0')}>
            {skeleton}
          </div>
        )}

        {/* The still picture: previews and tests, and browsers without a GPU (it fades in over the skeleton
            once it has loaded). Each layout its own. */}
        {failed && (
          <div aria-hidden="true" className={cn('absolute inset-0 transition-opacity duration-700 motion-reduce:transition-none', stillReady ? 'opacity-100' : 'opacity-0')}>
            {/* The wide still also shows the land left of the stage (it's 2600 × 1000 units; the stage starts at 1000).
                The band (phones and tablets) comes in two sizes, 800 and 1250 px wide. The theme's own picture loads
                first and at high priority (it's the page's LCP without a GPU); the other only if the theme changes. */}
            {(['light', 'dark'] as const).map((theme) => {
              const first = (theme === 'dark') === stillDark;
              const band = `/ui/landing/town-${flora}-band-${theme}-${season}`;
              return (
                <picture key={theme} className={theme === 'light' ? 'dark:hidden' : 'hidden dark:block'}>
                  <source media={WIDE_QUERY} srcSet={`/ui/landing/town-${flora}-wide-${theme}-${season}.webp`} />
                  <img
                    src={`${band}.webp`}
                    srcSet={`${band}-800.webp 800w, ${band}.webp 1250w`}
                    sizes="(min-width: 640px) 104vw, 108vw"
                    alt=""
                    loading={first ? 'eager' : 'lazy'}
                    fetchPriority={first ? 'high' : 'auto'}
                    decoding="async"
                    onLoad={() => setStillReady(true)}
                    onError={stillFailed}
                    className="absolute top-0 left-0 size-full max-w-none lg:left-[-62.5%] lg:w-[162.5%]"
                  />
                </picture>
              );
            })}
            {LAYOUTS.map(({ layout: drawn, shown: shownAt }) => (
              <div key={drawn} className={cn('absolute inset-0', shownAt)}>
                {pins.map(({ slotId, task }) => {
                  const anchor = SLOT_ANCHORS[drawn][slotId];
                  const dim = focus !== null && task.categorySlug !== focus;
                  return (
                    <span key={slotId} className={cn('absolute transition-opacity duration-500', dim && 'opacity-30')} style={{ left: `${anchor.head.x * 100}%`, top: `${anchor.head.y * 100}%` }}>
                      <span className="absolute size-[2vw] max-h-8 max-w-8 min-h-4 min-w-4 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-full rounded-br-none shadow-[0_6px_14px_-6px_rgb(0_0_0/0.45)]" style={{ background: `var(--cat-${task.categorySlug})` }}>
                        <span className="absolute inset-[30%] rounded-full bg-white" />
                      </span>
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* Cards that hang from the pins (each layout its own; none on the smallest phones), in as the pins land.
            Nothing above them fades (that would switch their frosted glass off mid-fade): each card makes its own
            entrance, one after another. */}
        <div aria-hidden="true" className="absolute inset-0">
          {LAYOUTS.map(({ layout: drawn, shown: shownAt }) => cardsShown(drawn) && (
            <div key={drawn} className={cn('absolute inset-0', shownAt)}>
              {pins.map(({ slotId, task }, index) => {
                const placement = CARD_PLACEMENTS[drawn][slotId as SlotId];
                if (!placement) return null;
                const anchor = SLOT_ANCHORS[drawn][slotId].top;
                const dim = focus !== null && task.categorySlug !== focus;
                const on = lit === task.id;
                const attach = attachPoint(placement.dx, placement.dy);
                const key = `${drawn}:${slotId}`;
                return (
                  <div
                    key={slotId}
                    ref={(element) => {
                      if (element) cardRefs.current.set(key, element);
                      else cardRefs.current.delete(key);
                    }}
                    className={cn('absolute hidden', FROM[placement.from])}
                    style={{ left: `${anchor.x * 100}%`, top: `${anchor.y * 100}%` }}
                  >
                    <svg className="absolute top-0 left-0 overflow-visible" width="1" height="1" aria-hidden="true" focusable="false">
                      <path
                        ref={(element) => {
                          if (element) lineRefs.current.set(key, element);
                          else lineRefs.current.delete(key);
                        }}
                        d={`M0 0L${attach.x} ${attach.y}`}
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        className={cn('transition-[opacity,color] duration-500', on ? 'text-foreground/70' : 'text-foreground/45', dim && !on && 'opacity-25')}
                      />
                      <circle r="3" cx={attach.x} cy={attach.y} className={cn('fill-foreground/60 transition-opacity duration-500', dim && !on && 'opacity-30')} />
                    </svg>
                    {/* The pointer is followed on this still box, not on the card that rises from it: a card
                        rising away from a pointer near its bottom edge would otherwise flicker. */}
                    <div
                      className="pointer-events-auto absolute top-0 left-0"
                      style={{ transform: `translate(${placement.dx}px, ${placement.dy}px)` }}
                      onPointerEnter={() => pointAt(task.id)}
                      onPointerLeave={() => pointAway(task.id)}
                    >
                      <Link
                        href={routes.publicTask(task.slug)}
                        tabIndex={-1}
                        title={tMap('showOnMap')}
                        onClick={(event) => showOnMap(event, task)}
                        className={cn(
                          'town-card glass pointer-events-auto block rounded-3xl p-4',
                          on && 'is-lit',
                          dim && !on && 'is-quiet',
                        )}
                        style={{ width: CARD.width, minHeight: CARD.height, ['--enter-delay' as string]: `${index * CARD_STAGGER}ms` }}
                      >
                        <span className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5 font-medium">
                            <span className="size-2 rounded-full" style={{ background: `var(--cat-${task.categorySlug})` }} />
                            {t('floatingTaskLabel')}
                          </span>
                          <span>{t('floatingOffers', { count: task.offerCount })}</span>
                        </span>
                        <span className="mt-1.5 block truncate font-display text-[15px]/5 font-semibold">{task.title}</span>
                        <span className="mt-2.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          {task.location.kind === 'local' && <span className="inline-flex min-w-0 items-center gap-1"><MapPin className="size-3.5 shrink-0" /><span className="truncate">{task.location.areaName}</span></span>}
                          <span className="text-base font-semibold text-primary tabular-nums">{task.budget.type === 'fixed' ? formatMoney(task.budget.priceCents) : tMap('perHour', { rate: formatMoney(task.budget.rateCents) })}</span>
                        </span>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {helper && cardsShown('wide') && (
            // Only when the town is tall enough: on short screens it would crowd the top bar and the first card.
            <div className="town-card-hit pointer-events-auto absolute hidden xl:[@container(min-height:700px)]:block" style={{ left: '53%', top: '11%' }}>
              <Link
                href={routes.helperProfile(helper.handle)}
                tabIndex={-1}
                className="town-card glass flex w-60 items-center gap-3 rounded-3xl p-3.5"
                style={{ ['--enter-delay' as string]: `${pins.length * CARD_STAGGER + 120}ms` }}
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl text-sm font-semibold text-white" style={{ backgroundImage: 'var(--iridescent)' }}>{helper.initials}</span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1 font-display text-[15px] font-semibold">{helper.displayName}<BadgeCheck className="size-4 text-violet" /></span>
                  <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    {helper.rating ? <><Star className="size-3.5 fill-current text-reward" />{t('floatingRating', { rating: helper.rating.average.toFixed(1), count: helper.rating.count })}</> : t('floatingNew')}
                    <span aria-hidden="true">·</span>
                    <span className="truncate">{helper.areaName}</span>
                  </span>
                </span>
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* The town and the weather over it both move (the weather from the start, the town once it's live). */}
      {mode !== 'static' && !reduced && (live || failed || weather) && (
        <button
          type="button"
          onClick={() => setHeroPaused(!paused)}
          aria-pressed={paused}
          aria-label={paused ? t('play') : t('pause')}
          className={cn('glass pointer-events-auto absolute inline-flex size-11 items-center justify-center rounded-full text-foreground/80 transition-transform hover:text-foreground active:scale-95', controlsClassName)}
        >
          {paused ? <Play aria-hidden="true" className="size-4" /> : <Pause aria-hidden="true" className="size-4" />}
        </button>
      )}
    </div>
  );
}
