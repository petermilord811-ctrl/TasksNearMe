'use client';

import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, LazyMotion, domMax, m } from 'motion/react';
import { useTranslations } from 'next-intl';
import { Pause, Play } from 'lucide-react';
import { routes, type HomePageData, type ISODateTime, type MapArea } from '@/contracts';
import { useFormat } from '@/ui/lib/format';
import { usePrefersReducedMotion } from '@/ui/motion';
import { cn } from '@/ui/lib/utils';
import { pinPrice } from '../map/pin-card';

const SHOW_MS = 4200;
/** How many newest tasks take turns. */
const ITEMS = 6;
/** It stops by itself after this many rounds (and a button pauses it any time). */
const ROUNDS = 3;

/**
 * One line of the newest open tasks, taking turns: "● New · Mount two floating shelves · Windsor Park · $55.00 ·
 * 2 hours ago", each a link to the task. The area only, never an address. It narrows to the picked neighborhood.
 * It pauses while pointed at or focused, has a pause button, stops after a few rounds, and doesn't move at all
 * under reduced motion. Not announced as it changes (that would be noise); the map's list is the full version.
 */
export function ActivityLine({ data, now, area, onShowAll, className }: { data: HomePageData; now: ISODateTime; area: MapArea | null; onShowAll: () => void; className?: string }) {
  const { formatRelative } = useFormat();
  const t = useTranslations('landing.hero.activity');
  const tMap = useTranslations('landing.map');
  const reduced = usePrefersReducedMotion();
  const items = useMemo(() => (area ? data.map.pins.filter((pin) => pin.areaName === area.name) : data.map.pins).slice(0, ITEMS), [data.map.pins, area]);
  const [turn, setTurn] = useState(0);
  const [hold, setHold] = useState(false);
  const [paused, setPaused] = useState(false);
  const done = turn >= items.length * ROUNDS - 1;
  const moving = !reduced && !hold && !paused && !done && items.length > 1;
  const itemsKey = items.map((pin) => pin.id).join('|');

  // A new neighborhood starts from its newest task.
  const [shownKey, setShownKey] = useState(itemsKey);
  if (shownKey !== itemsKey) {
    setShownKey(itemsKey);
    setTurn(0);
  }

  useEffect(() => {
    if (!moving) return;
    const timer = window.setTimeout(() => setTurn((value) => value + 1), SHOW_MS);
    return () => window.clearTimeout(timer);
  }, [moving, turn]);

  if (data.map.pins.length === 0) return null;
  if (items.length === 0 && area) {
    return (
      <p className={cn('flex min-h-9 items-center gap-2 text-sm text-muted-foreground', className)}>
        {t('none', { area: area.name })}
        <button type="button" onClick={onShowAll} className="font-semibold text-primary underline-offset-4 hover:underline">
          {t('everywhere', { market: data.market.name })}
        </button>
      </p>
    );
  }

  const pin = items[turn % items.length]!;
  return (
    <LazyMotion features={domMax}>
      <div
        className={cn('flex min-h-9 min-w-0 items-center gap-1.5 text-sm', className)}
        onPointerEnter={() => setHold(true)}
        onPointerLeave={() => setHold(false)}
        onFocus={() => setHold(true)}
        onBlur={() => setHold(false)}
      >
        {items.length > 1 && !reduced && (
          <button
            type="button"
            onClick={() => {
              if (done) setTurn(turn % items.length);
              setPaused(!paused && !done);
            }}
            aria-label={moving ? t('pause') : t('play')}
            className="relative -ml-1 grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors after:absolute after:-inset-2 after:content-[''] hover:bg-foreground/[0.06] hover:text-foreground"
          >
            {moving ? <Pause aria-hidden="true" className="size-3.5" /> : <Play aria-hidden="true" className="size-3.5" />}
          </button>
        )}
        <span className="sr-only">{t('label')}:</span>
        {/* The title always shows; the area, the price, the time and "New" join as the line gets room. */}
        <span className="@container relative h-9 min-w-0 flex-1 overflow-hidden">
          {/* The lines sit on top of each other already (absolute), so they simply swap: "popLayout" would measure
              the leaving one and add a style sheet to the page on every turn, restyling the whole page (round three). */}
          <AnimatePresence initial={false}>
            <m.span
              key={pin.id}
              className="absolute inset-0 flex items-center"
              initial={reduced ? false : { y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { y: '-100%', opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <Link href={routes.publicTask(pin.slug)} className="group/line flex min-h-9 w-full min-w-0 items-center gap-1.5 text-muted-foreground no-underline">
                <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: `var(--cat-${pin.categorySlug})` }} />
                <span className="hidden shrink-0 text-xs font-semibold tracking-wide text-violet uppercase @min-[30rem]:inline">{t('new')}</span>
                <span className="min-w-[5rem] truncate font-medium text-foreground group-hover/line:underline">{pin.title}</span>
                <span className="hidden shrink-0 @min-[15rem]:inline">· {pin.areaName}</span>
                <span className="hidden shrink-0 font-semibold text-foreground tabular-nums @min-[20rem]:inline">· {pinPrice(pin, (rate) => tMap('perHour', { rate }))}</span>
                <span className="hidden shrink-0 @min-[26rem]:inline">· {formatRelative(pin.postedAt, now)}</span>
              </Link>
            </m.span>
          </AnimatePresence>
        </span>
      </div>
    </LazyMotion>
  );
}
