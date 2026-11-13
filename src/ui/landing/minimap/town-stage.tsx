'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore, type MouseEvent } from 'react';
import { useTranslations } from 'next-intl';
import { BadgeCheck, MapPin, Pause, Play, Star } from 'lucide-react';
import { routes, type HelperSummary, type TaskPublicView } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { usePrefersReducedMotion } from '@/ui/motion';
import { cn } from '@/ui/lib/utils';
import { MAP_SECTION_ID, useOptionalLanding } from '../landing-state';
import type { TownLayout } from './scene';
import { CARD_PLACEMENTS, SLOT_ANCHORS, SLOT_IDS, type SlotId } from './slots';
import type { TownController, TownView } from './town';

export type TownMode = 'interactive' | 'static';

const PAUSE_KEY = 'tnm-town-paused';
/** On the wide stage, the hero's words must end by this fraction of its height (the plates' tallest things start below). */
const WORDS_FIT = 0.76;
const PAUSE_EVENT = 'tnm-town-paused';
const CARD = { width: 240, height: 98 };
/** Wide screens get the town beside the headline; narrower ones get the band under it (the hero's `lg`). */
const WIDE_QUERY = '(min-width: 1024px)';
/** Both layouts' stills, pins and cards are rendered; CSS shows the one for the screen's width. */
const LAYOUTS: { layout: TownLayout; shown: string }[] = [
  { layout: 'band', shown: 'lg:hidden' },
  { layout: 'wide', shown: 'hidden lg:block' },
];

/** The visitor's pause choice for this visit (sessionStorage), as an external store. */
function readPaused(): boolean {
  try {
    return window.sessionStorage.getItem(PAUSE_KEY) === '1';
  } catch {
    return false;
  }
}
function subscribePaused(onChange: () => void) {
  window.addEventListener(PAUSE_EVENT, onChange);
  return () => window.removeEventListener(PAUSE_EVENT, onChange);
}
function writePaused(value: boolean) {
  try {
    window.sessionStorage.setItem(PAUSE_KEY, value ? '1' : '0');
  } catch {
    /* storage blocked */
  }
  window.dispatchEvent(new Event(PAUSE_EVENT));
}

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

/**
 * Whether the 3D town will run well here: WebGL 2 on a real GPU. A software renderer (no GPU acceleration)
 * would draw it slowly and drain the battery, so those browsers get the still picture instead.
 */
function webglWorthIt(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2');
    if (!gl) return false;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return !/swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer);
  } catch {
    return false;
  }
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
 * ones, each with its own town. In `interactive` mode it loads the 3D town (three.js) for the current layout
 * once the browser is idle (again if the screen crosses into the other layout); the town builds itself up, then
 * runs only while it's on screen, the tab is visible, motion is allowed and the visitor hasn't paused it (a
 * still frame otherwise; the pause button stays inside the window, in view). As the town scrolls away, the
 * camera tilts toward a view from above and pulls back, handing over to the real map below. The pins carry
 * real open tasks, colored by category; the cards above them follow their pins every frame, quiet down when
 * another category is pointed at, and a click shows the task on the real map. In `static` mode (previews,
 * tests) and without a GPU it shows a still picture of the town with the same pins and cards.
 *
 * The town is decorative (`aria-hidden`); the cards copy tasks the map's list already offers, so they're out
 * of the tab order.
 */
export function TownStage({
  tasks,
  helper,
  mode,
  className,
  stageClassName,
  controlsClassName,
}: {
  tasks: TaskPublicView[];
  helper?: HelperSummary;
  mode: TownMode;
  className?: string;
  stageClassName?: string;
  controlsClassName?: string;
}) {
  const t = useTranslations('landing.hero');
  const tMap = useTranslations('landing.map');
  const landing = useOptionalLanding();
  const reduced = usePrefersReducedMotion();
  const paused = useSyncExternalStore(subscribePaused, readPaused, () => false);
  const layout = useTownLayout();
  const windowRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const viewRef = useRef<TownView | null>(null);
  const [town, setTown] = useState<TownController | null>(null);
  const [failed, setFailed] = useState(mode === 'static');
  const [onScreen, setOnScreen] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [covered, setCovered] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  const pins = tasks.slice(0, SLOT_IDS.length).map((task, index) => ({ slotId: SLOT_IDS[index]!, task }));
  const focus = landing?.activeCategory ?? null;
  const lit = hovered ?? landing?.litTaskId ?? null;
  const live = town !== null;
  const pinsKey = pins.map((pin) => `${pin.slotId}:${pin.task.id}:${pin.task.categorySlug}`).join('|');

  // Build the layout's town once the browser has a moment (and only on a real GPU).
  useEffect(() => {
    if (mode === 'static') return;
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    const view = windowRef.current;
    if (!canvas || !stage || !view) return;
    let cancelled = false;
    let built: TownController | null = null;
    const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    const build = async () => {
      if (!webglWorthIt()) {
        if (!cancelled) setFailed(true);
        return;
      }
      try {
        const { createTown, DARK_PALETTE, LIGHT_PALETTE } = await import('./town');
        if (cancelled) return;
        built = createTown(canvas, { palette: darkAt(stage) ? DARK_PALETTE : LIGHT_PALETTE, shadowSize: coarse ? 1024 : 2048, layout });
        const measured = measureView(view, stage);
        viewRef.current = measured;
        built.setSize(measured.width, measured.height, pixelRatio(measured.width, measured.height, coarse));
        built.setView(measured);
        setTown(built);
      } catch (error) {
        // The still picture takes over; in development, say why.
        if (process.env.NODE_ENV !== 'production') console.error('The 3D town could not start:', error);
        if (!cancelled) setFailed(true);
      }
    };
    // Safari has no requestIdleCallback: a short timeout instead.
    const hasIdle = typeof window.requestIdleCallback === 'function';
    const handle = hasIdle ? window.requestIdleCallback(() => void build(), { timeout: 900 }) : window.setTimeout(() => void build(), 120);
    return () => {
      cancelled = true;
      if (hasIdle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
      built?.dispose();
      setTown(null);
    };
  }, [mode, layout]);

  // Keep the canvas sharp at the window's size, showing the stage's part of it; follow the theme.
  useEffect(() => {
    const stage = stageRef.current;
    const view = windowRef.current;
    if (!town || !stage || !view) return;
    const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    const resize = new ResizeObserver(() => {
      const measured = measureView(view, stage);
      viewRef.current = measured;
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
      void import('./town').then(({ DARK_PALETTE, LIGHT_PALETTE }) => {
        town.setPalette(dark ? DARK_PALETTE : LIGHT_PALETTE);
        town.renderOnce();
      });
    };
    const themeWatch = new MutationObserver(repaint);
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    const media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    media?.addEventListener('change', repaint);
    return () => {
      resize.disconnect();
      themeWatch.disconnect();
      media?.removeEventListener('change', repaint);
    };
  }, [town]);

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
    if (reduced) town.finishIntro();
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
      let progress: number;
      if (sheet) {
        const top = sheet.getBoundingClientRect().top;
        progress = Math.max(0, Math.min(1, 1 - top / viewport));
        setCovered(top <= 0);
      } else {
        const box = view.getBoundingClientRect();
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

  // Every frame: the camera leans toward the pointer, and this layout's cards follow their pins.
  useEffect(() => {
    if (!town) return;
    const pointer = landing?.pointer;
    town.onFrame(() => {
      const sample = pointer?.current;
      town.setPointer(sample?.active ? sample.x * 2 - 1 : 0, sample?.active ? sample.y * 2 - 1 : 0, Boolean(sample?.active));
      for (const slotId of SLOT_IDS) {
        const element = cardRefs.current.get(`${layout}:${slotId}`);
        if (!element) continue;
        const at = town.pinAt(slotId);
        const view = viewRef.current;
        if (!at || !view) continue;
        const x = (at.x * view.width - view.stage.left) / view.stage.width;
        const y = (at.y * view.height - view.stage.top) / view.stage.height;
        element.style.left = `${(x * 100).toFixed(3)}%`;
        element.style.top = `${(y * 100).toFixed(3)}%`;
      }
    });
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

  const showOnMap = (event: MouseEvent, task: TaskPublicView) => {
    if (!landing || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    landing.focusTask({ id: task.id, categorySlug: task.categorySlug });
  };

  return (
    <div ref={windowRef} className={cn('pointer-events-none', className)}>
      {/* The live town draws the whole window: the stage's part, or more of the land around it. */}
      <canvas ref={canvasRef} aria-hidden="true" className={cn('absolute inset-0 size-full transition-opacity duration-700', live ? 'opacity-100' : 'opacity-0', failed && 'hidden')} />

      <div ref={stageRef} className={cn('absolute aspect-[10/8] lg:aspect-[16/10]', stageClassName)}>
        {/* The still picture: previews, tests, and browsers without a GPU (each layout's own). */}
        {failed && (
          <div aria-hidden="true" className="absolute inset-0">
            {/* The wide still also shows the land left of the stage (it's 2600 × 1000 units; the stage starts at 1000). */}
            <picture className="dark:hidden">
              <source media={WIDE_QUERY} srcSet="/ui/landing/town-wide-light.webp" />
              <img src="/ui/landing/town-band-light.webp" alt="" loading="lazy" decoding="async" className="absolute top-0 left-0 size-full max-w-none lg:left-[-62.5%] lg:w-[162.5%]" />
            </picture>
            <picture className="hidden dark:block">
              <source media={WIDE_QUERY} srcSet="/ui/landing/town-wide-dark.webp" />
              <img src="/ui/landing/town-band-dark.webp" alt="" loading="lazy" decoding="async" className="absolute top-0 left-0 size-full max-w-none lg:left-[-62.5%] lg:w-[162.5%]" />
            </picture>
            {LAYOUTS.map(({ layout: drawn, shown }) => (
              <div key={drawn} className={cn('absolute inset-0', shown)}>
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

        {/* Cards that hang from the pins (each layout its own; none on the smallest phones). */}
        <div aria-hidden="true" className={cn('absolute inset-0 transition-opacity duration-700', live || failed ? 'opacity-100' : 'opacity-0')}>
          {LAYOUTS.map(({ layout: drawn, shown }) => (
            <div key={drawn} className={cn('absolute inset-0', shown)}>
              {pins.map(({ slotId, task }) => {
                const placement = CARD_PLACEMENTS[drawn][slotId as SlotId];
                if (!placement) return null;
                const anchor = SLOT_ANCHORS[drawn][slotId].top;
                const dim = focus !== null && task.categorySlug !== focus;
                const attach = attachPoint(placement.dx, placement.dy);
                return (
                  <div
                    key={slotId}
                    ref={(element) => {
                      const key = `${drawn}:${slotId}`;
                      if (element) cardRefs.current.set(key, element);
                      else cardRefs.current.delete(key);
                    }}
                    className={cn('absolute hidden', FROM[placement.from])}
                    style={{ left: `${anchor.x * 100}%`, top: `${anchor.y * 100}%` }}
                  >
                    <svg className="absolute top-0 left-0 overflow-visible" width="1" height="1" aria-hidden="true" focusable="false">
                      <path d={`M0 0L${attach.x} ${attach.y}`} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className={cn('text-foreground/45 transition-opacity duration-500', dim && 'opacity-20')} />
                      <circle r="3" cx={attach.x} cy={attach.y} className="fill-foreground/60" />
                    </svg>
                    <div className="absolute top-0 left-0" style={{ transform: `translate(${placement.dx}px, ${placement.dy}px)` }}>
                      <Link
                        href={routes.publicTask(task.slug)}
                        tabIndex={-1}
                        title={tMap('showOnMap')}
                        onClick={(event) => showOnMap(event, task)}
                        onPointerEnter={() => setHovered(task.id)}
                        onPointerLeave={() => setHovered(null)}
                        className={cn(
                          'bloom-in glass pointer-events-auto block rounded-3xl p-4 transition-[opacity,translate,filter,box-shadow] duration-500 hover:-translate-y-1 hover:shadow-[0_24px_50px_-26px_var(--violet)] active:scale-[0.97] active:duration-150',
                          dim && 'opacity-30 blur-[1px]',
                        )}
                        style={{ width: CARD.width, minHeight: CARD.height, ['--enter-delay' as string]: '1600ms' }}
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

          {helper && (
            // Only when the town is tall enough: on short screens it would crowd the top bar and the first card.
            <div className="absolute hidden xl:[@container(min-height:700px)]:block" style={{ left: '53%', top: '11%' }}>
              <Link
                href={routes.helperProfile(helper.handle)}
                tabIndex={-1}
                className="bloom-in glass pointer-events-auto flex w-60 items-center gap-3 rounded-3xl p-3.5 transition-transform duration-500 hover:-translate-y-1"
                style={{ ['--enter-delay' as string]: '1900ms' }}
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

      {live && !reduced && (
        <button
          type="button"
          onClick={() => writePaused(!paused)}
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
