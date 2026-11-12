'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { BadgeCheck, MapPin, Star } from 'lucide-react';
import { routes, type HelperSummary, type TaskPublicView } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { useFinePointer, usePrefersReducedMotion } from '@/ui/motion';
import { cn } from '@/ui/lib/utils';
import { useOptionalLanding } from './landing-state';

interface Slot {
  /** Position around the hero (percent of the hero box) and depth (0 near, 1 far). */
  left: string;
  top: string;
  depth: number;
  tilt: number;
  delay: number;
}

const TASK_SLOTS: Slot[] = [
  { left: '5%', top: '20%', depth: 0.25, tilt: -5, delay: 520 },
  { left: '74%', top: '58%', depth: 0.6, tilt: 4, delay: 760 },
];
const HELPER_SLOTS: Slot[] = [
  { left: '76%', top: '16%', depth: 0.5, tilt: 3, delay: 640 },
  { left: '8%', top: '62%', depth: 0.8, tilt: -3, delay: 880 },
];

/**
 * Real open tasks and helpers floating around the hero at different depths (wide screens only). They
 * drift gently on their own, lean toward the cursor (nearer cards move more), lift on hover, and quiet down
 * when a category is picked elsewhere on the page. Decorative copies of content that's on the page anyway,
 * so they're out of the tab order.
 */
export function FloatingCards({ tasks, helpers }: { tasks: TaskPublicView[]; helpers: HelperSummary[] }) {
  const t = useTranslations('landing.hero');
  const tMap = useTranslations('landing.map');
  const landing = useOptionalLanding();
  const reduced = usePrefersReducedMotion();
  const fine = useFinePointer();
  const layerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pointer = landing?.pointer;

  useEffect(() => {
    if (reduced || !fine || !pointer) return;
    let frame = 0;
    const current = { x: 0, y: 0 };
    const tick = () => {
      const p = pointer.current;
      const tx = p.active ? p.x - 0.5 : 0;
      const ty = p.active ? p.y - 0.4 : 0;
      current.x += (tx - current.x) * 0.06;
      current.y += (ty - current.y) * 0.06;
      layerRefs.current.forEach((layer) => {
        if (!layer) return;
        const depth = Number(layer.dataset.depth ?? 0.5);
        const strength = 46 * (1 - depth * 0.6);
        layer.style.transform = `translate3d(${(current.x * strength).toFixed(2)}px, ${(current.y * strength * 0.7).toFixed(2)}px, 0) rotateY(${(current.x * 6).toFixed(2)}deg) rotateX(${(-current.y * 6).toFixed(2)}deg)`;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduced, fine, pointer]);

  const focus = landing?.activeCategory ?? null;
  const cards = [
    ...tasks.slice(0, TASK_SLOTS.length).map((task, i) => ({ kind: 'task' as const, task, slot: TASK_SLOTS[i]! })),
    ...helpers.slice(0, HELPER_SLOTS.length).map((helper, i) => ({ kind: 'helper' as const, helper, slot: HELPER_SLOTS[i]! })),
  ];

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden [perspective:1200px] xl:block">
      {cards.map((card, i) => {
        const dim = focus !== null && (card.kind === 'helper' ? !card.helper.services.some((service) => service.categorySlug === focus) : card.task.categorySlug !== focus);
        return (
          <div
            key={card.kind === 'task' ? card.task.id : card.helper.id}
            ref={(element) => {
              layerRefs.current[i] = element;
            }}
            data-depth={card.slot.depth}
            className="absolute will-change-transform"
            style={{ left: card.slot.left, top: card.slot.top, zIndex: Math.round((1 - card.slot.depth) * 10) }}
          >
            <div className="bloom-in" style={{ ['--enter-delay' as string]: `${card.slot.delay}ms`, ['--bloom-origin' as string]: '50% 50%' }}>
              <div className="[animation:drift_7s_ease-in-out_infinite]" style={{ animationDelay: `${-i * 1.7}s`, rotate: `${card.slot.tilt}deg`, scale: `${1 - card.slot.depth * 0.18}` }}>
                {card.kind === 'task' ? (
                  <Link
                    href={routes.publicTask(card.task.slug)}
                    tabIndex={-1}
                    className={cn('glass pointer-events-auto block w-60 rounded-3xl p-4 transition-[opacity,transform,filter] duration-500 hover:-translate-y-1', dim && 'opacity-30 blur-[1px]')}
                  >
                    <span className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        <span className="size-2 rounded-full" style={{ background: `var(--cat-${card.task.categorySlug})` }} />
                        {t('floatingTaskLabel')}
                      </span>
                      <span>{t('floatingOffers', { count: card.task.offerCount })}</span>
                    </span>
                    <span className="mt-2 block font-display text-[15px]/5 font-semibold">{card.task.title}</span>
                    <span className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                      {card.task.location.kind === 'local' && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{card.task.location.areaName}</span>}
                      <span className="text-sm font-semibold text-foreground tabular-nums">{card.task.budget.type === 'fixed' ? formatMoney(card.task.budget.priceCents) : tMap('perHour', { rate: formatMoney(card.task.budget.rateCents) })}</span>
                    </span>
                  </Link>
                ) : (
                  <Link
                    href={routes.helperProfile(card.helper.handle)}
                    tabIndex={-1}
                    className={cn('glass pointer-events-auto flex w-56 items-center gap-3 rounded-3xl p-3.5 transition-[opacity,transform,filter] duration-500 hover:-translate-y-1', dim && 'opacity-30 blur-[1px]')}
                  >
                    <span className="grid size-11 shrink-0 place-items-center rounded-2xl text-sm font-semibold text-white" style={{ backgroundImage: 'var(--iridescent)' }}>{card.helper.initials}</span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1 font-display text-[15px] font-semibold">{card.helper.displayName}<BadgeCheck className="size-4 text-violet" /></span>
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        {card.helper.rating ? <><Star className="size-3.5 fill-current text-reward" />{t('floatingRating', { rating: card.helper.rating.average.toFixed(1), count: card.helper.rating.count })}</> : t('floatingNew')}
                        <span aria-hidden="true">·</span>{card.helper.areaName}
                      </span>
                    </span>
                  </Link>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
