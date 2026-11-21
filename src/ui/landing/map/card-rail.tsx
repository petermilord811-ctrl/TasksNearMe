'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import type { LandingMapData } from '@/contracts';
import { usePrefersReducedMotion } from '@/ui/motion';
import { cn } from '@/ui/lib/utils';
import { CATEGORY_ICONS } from '../category-icons';
import { useLanding } from '../landing-state';
import { useOptionalMapExplorer } from './explorer-state';
import { effectiveSort, listOrigin, nearbyPins } from './map-math';
import { pinPrice } from './pin-card';

/** How many tasks the row holds (the list beside the map has the rest). */
const RAIL_LIMIT = 24;
/** A swipe has settled when the row has been still this long (ms). */
const SETTLE_MS = 140;
/** One card per wheel notch at most this often (ms), so a fast wheel doesn't race through the row. */
const WHEEL_STEP_MS = 220;

/** Moves the row by one card (and its gap) in `direction` (1: on, −1: back). */
function stepRail(rail: HTMLElement, direction: number, reduced: boolean) {
  const card = rail.querySelector<HTMLElement>('[data-rail-id]');
  if (!card) return;
  const gap = Number.parseFloat(getComputedStyle(rail).columnGap) || 12;
  rail.scrollBy({ left: direction * (card.offsetWidth + gap), behavior: reduced ? 'auto' : 'smooth' });
}

/**
 * The full-screen map's tasks as a row of cards along its bottom (9.7: a phone layout made for touch), in step with
 * the pins: swipe the row and the map glides to the card in the middle and lights its pin; tap a pin and its card
 * slides to the middle; tap a card and its task opens on the map (its card there links to the task). The same tasks
 * as the list beside the map (its category, order and distance), the first 24.
 */
export function MapCardRail({ map, className }: { map: LandingMapData; className?: string }) {
  const t = useTranslations('landing.map');
  const categories = useTranslations('helperCard.categories');
  const { selectedCategory, litTaskId, focusedTaskId, setHighlightedTaskId, pickTask, location } = useLanding();
  const explorer = useOptionalMapExplorer();
  const reduced = usePrefersReducedMotion();
  const from = listOrigin(map, location.status === 'granted' ? location.point : undefined);
  const sort = effectiveSort(explorer?.sortChoice ?? undefined, from);
  const withinMiles = from ? (explorer?.withinMiles ?? null) : null;
  const rows = useMemo(
    () => nearbyPins(map.pins, { from, category: selectedCategory, limit: RAIL_LIMIT, sort, withinMiles }),
    [map.pins, from, selectedCategory, sort, withinMiles],
  );
  const railRef = useRef<HTMLOListElement>(null);
  /** The card the row was last brought to by the map (a tapped pin): its settling doesn't move the map back. */
  const steered = useRef<string | null>(null);
  /** The pin this row lit: letting go clears only that one. */
  const lit = useRef<string | null>(null);

  // A pin tapped (or a card picked) on the map: its card slides to the middle of the row.
  const target = focusedTaskId ?? litTaskId;
  useEffect(() => {
    const rail = railRef.current;
    if (!rail || !target || target === lit.current) return;
    const card = rail.querySelector<HTMLElement>(`[data-rail-id="${CSS.escape(target)}"]`);
    if (!card) return;
    steered.current = target;
    rail.scrollTo({ left: card.offsetLeft - (rail.clientWidth - card.offsetWidth) / 2, behavior: reduced ? 'auto' : 'smooth' });
  }, [target, reduced]);

  // A swipe settles on a card: the map glides to it and lights its pin.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    let timer = 0;
    const settle = () => {
      const middle = rail.scrollLeft + rail.clientWidth / 2;
      let best: HTMLElement | null = null;
      for (const card of rail.querySelectorAll<HTMLElement>('[data-rail-id]')) {
        if (!best || Math.abs(card.offsetLeft + card.offsetWidth / 2 - middle) < Math.abs(best.offsetLeft + best.offsetWidth / 2 - middle)) best = card;
      }
      const id = best?.dataset.railId;
      if (!id) return;
      if (steered.current === id) {
        steered.current = null;
        return;
      }
      steered.current = null;
      lit.current = id;
      setHighlightedTaskId(id);
      explorer?.requestFocus({ kind: 'peek', id });
    };
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(settle, SETTLE_MS);
    };
    rail.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.clearTimeout(timer);
      rail.removeEventListener('scroll', onScroll);
    };
  }, [explorer, setHighlightedTaskId]);

  // A mouse wheel turns the row a card at a time: the row has no height to scroll, and its snap would undo the wheel's
  // small steps (2026-11-21: "not scrollable").
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    let pending = 0;
    let last = 0;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || rail.scrollWidth <= rail.clientWidth) return;
      event.preventDefault();
      pending += event.deltaY;
      const now = performance.now();
      if (Math.abs(pending) < 30 || now - last < WHEEL_STEP_MS) return;
      last = now;
      stepRail(rail, Math.sign(pending), reduced);
      pending = 0;
    };
    rail.addEventListener('wheel', onWheel, { passive: false });
    return () => rail.removeEventListener('wheel', onWheel);
  }, [reduced]);

  // Whether the row can turn either way: the arrows step aside at its ends (and when every card fits).
  const [ends, setEnds] = useState({ start: true, end: true });
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const update = () => setEnds({ start: rail.scrollLeft <= 4, end: rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 4 });
    update();
    rail.addEventListener('scroll', update, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(rail);
    return () => {
      rail.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, [rows.length]);

  // Leaving full screen: the pin this row lit goes quiet again.
  useEffect(
    () => () => {
      if (lit.current) setHighlightedTaskId(null);
    },
    [setHighlightedTaskId],
  );

  if (rows.length === 0) return null;
  const arrow = 'glass pointer-events-auto absolute top-1/2 z-[1] hidden size-11 -translate-y-1/2 place-items-center rounded-full text-foreground/80 shadow-overlay transition-[transform,opacity] hover:text-foreground active:scale-95 disabled:pointer-events-none disabled:opacity-0 [@media(hover:hover)_and_(pointer:fine)]:grid';
  return (
    <div className={cn('pointer-events-none', className)}>
      {/* A mouse steps through the row with these (touch screens swipe it). */}
      <button type="button" onClick={() => railRef.current && stepRail(railRef.current, -1, reduced)} disabled={ends.start} aria-label={t('railPrev')} className={cn(arrow, 'left-[max(0.75rem,env(safe-area-inset-left))]')}>
        <ChevronLeft aria-hidden="true" className="size-5" />
      </button>
      <button type="button" onClick={() => railRef.current && stepRail(railRef.current, 1, reduced)} disabled={ends.end} aria-label={t('railNext')} className={cn(arrow, 'right-[max(0.75rem,env(safe-area-inset-right))]')}>
        <ChevronRight aria-hidden="true" className="size-5" />
      </button>
    <ol
      ref={railRef}
      aria-label={t('railLabel')}
      className={cn(
        'pointer-events-auto flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain scroll-smooth motion-reduce:scroll-auto',
        'px-[max(1rem,env(safe-area-inset-left))] pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [@media(hover:hover)_and_(pointer:fine)]:px-16',
      )}
    >
      {rows.map(({ pin, miles }) => {
        const Icon = CATEGORY_ICONS[pin.categorySlug];
        const on = pin.id === focusedTaskId || pin.id === litTaskId;
        return (
          <li key={pin.id} data-rail-id={pin.id} className="w-[min(78vw,19rem)] shrink-0 snap-center">
            <button
              type="button"
              onClick={() => {
                lit.current = pin.id;
                pickTask(pin.id);
                explorer?.requestFocus({ kind: 'task', id: pin.id });
              }}
              aria-pressed={pin.id === focusedTaskId}
              className={cn(
                'glass flex w-full flex-col gap-1.5 rounded-3xl p-4 text-left shadow-overlay transition-[box-shadow,transform] active:scale-[0.98]',
                on && 'ring-2 ring-violet/60',
              )}
            >
              <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="inline-flex min-w-0 items-center gap-1.5 font-medium">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full text-white" style={{ background: `var(--cat-${pin.categorySlug})` }}>
                    <Icon aria-hidden="true" className="size-3" />
                  </span>
                  <span className="truncate">{categories(pin.categorySlug)}</span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-primary tabular-nums">{pinPrice(pin, (rate) => t('perHour', { rate }))}</span>
              </span>
              <span className="line-clamp-2 font-display text-[15px]/5 font-semibold">{pin.title}</span>
              <span className="inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
                <span className="truncate">{pin.areaName}{miles !== undefined && <> · {t('milesAway', { miles })}</>}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
    </div>
  );
}
