'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, LazyMotion, domAnimation, m } from 'motion/react';
import { useTranslations } from 'next-intl';
import { ArrowRight, Hammer, Laptop, Leaf, Package, Sparkles, type LucideIcon } from 'lucide-react';
import { CATEGORY_SLUGS, routes, type CategorySlug } from '@/contracts';
import { spring, usePrefersReducedMotion } from '@/ui/motion';
import { cn } from '@/ui/lib/utils';
import { useOptionalLanding } from './landing-state';

export const CATEGORY_ICONS: Record<CategorySlug, LucideIcon> = {
  'furniture-assembly': Hammer,
  'moving-help': Package,
  'yard-cleanup': Leaf,
  'light-cleaning': Sparkles,
  'computer-help': Laptop,
};

const ROTATE_MS = 2800;

/**
 * "I need help to… assemble a bookshelf": a pill that cycles real examples and, when opened, morphs into a
 * panel of every category (the pill grows into it, like the video's pill-to-panel). Each choice starts the
 * posting wizard in that category. Rotation stops on hover, focus, or reduced motion.
 */
export function AskPill({ className }: { className?: string }) {
  const t = useTranslations('landing.hero');
  const categories = useTranslations('helperCard.categories');
  const landing = useOptionalLanding();
  const reduced = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [held, setHeld] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const current = CATEGORY_SLUGS[index % CATEGORY_SLUGS.length]!;

  useEffect(() => {
    if (reduced || held || open) return;
    const timer = window.setInterval(() => setIndex((value) => value + 1), ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [reduced, held, open]);

  // Close when focus or a click goes elsewhere.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <LazyMotion features={domAnimation}>
      <div ref={rootRef} className={cn('relative mx-auto w-full max-w-xl', className)} onPointerEnter={() => setHeld(true)} onPointerLeave={() => setHeld(false)}>
        <m.div layout transition={reduced ? { duration: 0 } : spring.bloom} className={cn('glass overflow-hidden text-left', open ? 'rounded-[1.75rem]' : 'rounded-full')}>
          <m.button
            layout="position"
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((value) => !value)}
            className="flex min-h-14 w-full items-center gap-3 rounded-full py-2 pr-2 pl-5 text-left"
          >
            <span className="sr-only">{t('askLabel')}</span>
            <span aria-hidden="true" className="shrink-0 text-muted-foreground">{t('askPrompt')}</span>
            <span aria-hidden="true" className="relative min-w-0 flex-1 overflow-hidden whitespace-nowrap">
              <span key={current} className="enter block truncate font-medium text-foreground">{t(`examples.${current}`)}</span>
            </span>
            <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-foreground text-background transition-transform duration-300" style={{ transform: open ? 'rotate(90deg)' : undefined }}>
              <ArrowRight className="size-4" />
            </span>
          </m.button>
          <AnimatePresence initial={false}>
            {open && (
              <m.ul
                id={panelId}
                key="panel"
                initial={reduced ? false : { opacity: 0, y: -6, filter: 'blur(6px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -4, filter: 'blur(4px)' }}
                transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                className="grid gap-1 px-2 pb-2 sm:grid-cols-2"
              >
                {CATEGORY_SLUGS.map((category, position) => {
                  const Icon = CATEGORY_ICONS[category];
                  return (
                    <m.li key={category} initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduced ? 0 : 0.04 * position, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
                      <Link
                        href={routes.app.newTask({ category })}
                        onPointerEnter={() => landing?.setActiveCategory(category)}
                        onPointerLeave={() => landing?.setActiveCategory(null)}
                        onFocus={() => landing?.setActiveCategory(category)}
                        onBlur={() => landing?.setActiveCategory(null)}
                        className="group/ask flex min-h-12 items-center gap-3 rounded-2xl px-3 py-2 transition-colors hover:bg-card"
                      >
                        <span className="grid size-8 shrink-0 place-items-center rounded-xl" style={{ background: `color-mix(in oklab, var(--cat-${category}) 16%, transparent)`, color: `var(--cat-${category})` }}>
                          <Icon aria-hidden="true" className="size-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{categories(category)}</span>
                          <span className="block truncate text-xs text-muted-foreground">{t(`examples.${category}`)}</span>
                        </span>
                      </Link>
                    </m.li>
                  );
                })}
              </m.ul>
            )}
          </AnimatePresence>
        </m.div>
      </div>
    </LazyMotion>
  );
}
