'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Pause, Play } from 'lucide-react';
import type { CategorySlug } from '@/contracts';
import { usePrefersReducedMotion } from '@/ui/motion';
import { cn } from '@/ui/lib/utils';
import { useOptionalLanding } from '../landing-state';
import { createLoop, NeighborhoodScene, type ScenePalette } from './engine';

const PAUSE_KEY = 'tnm-canvas-paused';
const PAUSE_EVENT = 'tnm-canvas-paused';

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
const MAX_DPR = 2;
const LIGHT_SCALE = 1 / 6;

function readPalette(element: HTMLElement, categories: readonly string[]): ScenePalette {
  const css = getComputedStyle(element);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const dark = css.colorScheme.includes('dark') && !css.colorScheme.includes('light');
  return {
    light: [v('--iri-1', '#ff8a5b'), v('--iri-2', '#ff5fa2'), v('--iri-3', '#8b5cf6'), v('--iri-4', '#6c8cff')],
    tasks: Object.fromEntries(categories.map((category) => [category, v(`--cat-${category}`, '#8b5cf6')])),
    helper: v('--card', '#ffffff'),
    ring: v('--violet', '#6d4ef5'),
    line: v('--iri-3', '#8b5cf6'),
    lightAlpha: dark ? 0.34 : 0.18,
  };
}

/**
 * The hero's living background (see ./engine.ts). Runs only while the hero is on screen and the tab is
 * visible; draws one still frame under reduced motion or when paused; the pause control is remembered for
 * the visit. Decorative: `aria-hidden`, and the control has its own label.
 *
 * The children of the sibling marked `data-canvas-clear` (the hero's text column) are the scene's clear
 * zones: it quiets down behind them and follows them as they resize.
 */
export function HeroCanvas({ categories, labels, className }: { categories: readonly CategorySlug[]; labels: { pause: string; play: string }; className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landing = useOptionalLanding();
  const reduced = usePrefersReducedMotion();
  const paused = useSyncExternalStore(subscribePaused, readPaused, () => false);
  const focusRef = useRef<string | null>(null);
  const activeCategory = landing?.activeCategory ?? null;
  const pointerRef = landing?.pointer;

  useEffect(() => {
    focusRef.current = activeCategory;
  }, [activeCategory]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { alpha: true });
    if (!wrap || !canvas || !ctx) return;
    const light = document.createElement('canvas');
    const lightCtx = light.getContext('2d');
    if (!lightCtx) return;

    let width = 0;
    let height = 0;
    const scene = new NeighborhoodScene({ width: 1, height: 1, categories, palette: readPalette(wrap, categories), seed: 11 });
    let rect = wrap.getBoundingClientRect();
    const column = wrap.parentElement?.querySelector<HTMLElement>('[data-canvas-clear]') ?? null;
    const zoneElements = column ? Array.from(column.children) : [];
    const readZones = () => {
      const base = wrap.getBoundingClientRect();
      scene.setClearZones(zoneElements.map((element) => {
        const box = element.getBoundingClientRect();
        return { x: box.left - base.left, y: box.top - base.top, w: box.width, h: box.height };
      }));
    };

    const size = () => {
      rect = wrap.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      light.width = Math.max(1, Math.round(width * LIGHT_SCALE));
      light.height = Math.max(1, Math.round(height * LIGHT_SCALE));
      scene.resize(width, height);
    };

    const render = (dt: number) => {
      const pointer = pointerRef?.current;
      if (pointer?.active) {
        scene.setPointer(pointer.x * window.innerWidth - rect.left, pointer.y * window.innerHeight - rect.top, true);
      } else {
        scene.setPointer(0, 0, false);
      }
      scene.setFocus(focusRef.current);
      scene.update(dt);
      scene.drawLight(lightCtx, light.width, light.height);
      scene.draw(ctx, light);
    };

    const loop = createLoop(render);
    let visible = true;
    const sync = () => {
      const animate = visible && !document.hidden && !reduced && !paused;
      if (animate) loop.start();
      else {
        loop.stop();
        render(0);
      }
    };

    size();
    readZones();
    render(0);
    canvas.dataset.ready = 'true';

    const resize = new ResizeObserver(() => {
      size();
      readZones();
      render(0);
    });
    resize.observe(wrap);
    for (const element of zoneElements) resize.observe(element);
    // The text rises into place and the fonts swap in after the first read: read the zones again then.
    const settle = window.setTimeout(readZones, 1400);
    void document.fonts?.ready.then(readZones);
    const onScroll = () => {
      rect = wrap.getBoundingClientRect();
    };
    const seen = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      sync();
    });
    seen.observe(wrap);
    const onVisibility = () => sync();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('scroll', onScroll, { passive: true });
    // The theme can change under us (the top bar's switch or the system): re-read the colors.
    const repaint = () => {
      scene.setPalette(readPalette(wrap, categories));
      render(0);
    };
    const themeWatch = new MutationObserver(repaint);
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    media?.addEventListener('change', repaint);
    sync();

    return () => {
      loop.stop();
      window.clearTimeout(settle);
      resize.disconnect();
      seen.disconnect();
      themeWatch.disconnect();
      media?.removeEventListener('change', repaint);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('scroll', onScroll);
    };
  }, [categories, reduced, paused, pointerRef]);

  const toggle = () => writePaused(!paused);

  return (
    <div ref={wrapRef} className={cn('pointer-events-none absolute inset-0 -z-10 overflow-hidden', className)}>
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(60%_50%_at_20%_20%,color-mix(in_oklab,var(--iri-1)_22%,transparent),transparent_70%),radial-gradient(55%_45%_at_85%_30%,color-mix(in_oklab,var(--iri-3)_20%,transparent),transparent_70%),radial-gradient(60%_50%_at_60%_95%,color-mix(in_oklab,var(--iri-4)_18%,transparent),transparent_70%)]" />
      <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 size-full opacity-0 transition-opacity duration-700 data-[ready=true]:opacity-100" />
      {!reduced && (
        <button
          type="button"
          onClick={toggle}
          aria-pressed={paused}
          aria-label={paused ? labels.play : labels.pause}
          className="glass pointer-events-auto absolute right-3 bottom-3 inline-flex size-11 items-center justify-center rounded-full text-foreground/80 transition-transform hover:text-foreground active:scale-95 sm:right-5 sm:bottom-5"
        >
          {paused ? <Play aria-hidden="true" className="size-4" /> : <Pause aria-hidden="true" className="size-4" />}
        </button>
      )}
    </div>
  );
}
