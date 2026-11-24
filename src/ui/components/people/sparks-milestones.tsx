'use client';

import { Check, Contact } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { SparkLevel, SparksPageData } from '@/contracts';
import { cn } from '@/ui/lib/utils';

type MilestoneState = 'done' | 'current' | 'ahead';

const nodeClass: Record<MilestoneState, string> = {
  done: 'bg-primary text-primary-foreground',
  current: 'bg-card ring-[3px] ring-primary shadow-[0_0_0_7px_var(--color-brand-soft)]',
  ahead: 'border-2 border-border bg-card',
};

/**
 * Sparks' levels as a milestone track (2026-11-24, owner: "make milestone as real milestone: dot style horizontal or
 * chevron style or combined new style"): a round milestone for each level, joined by chevron-shaped segments that point
 * on to the next one. Reached milestones are filled with a check, the person's own is ringed, and the segment after it
 * fills with their progress toward the next. Each says where it starts, the chats a day it allows, and, for the top two,
 * that it shows the contact details helpers share. Down the page on phones, across from `md` up.
 */
export function SparksMilestones({ levels, total, current, className }: { levels: SparksPageData['levels']; total: number; current: SparkLevel; className?: string }) {
  const t = useTranslations('sparks');
  const locale = useLocale();
  // The page's language, never the browser's, so the server's HTML and the browser's agree.
  const number = (value: number) => value.toLocaleString(locale === 'es' ? 'es-US' : 'en-US');
  const currentIndex = Math.max(0, levels.findIndex((row) => row.level === current));

  return <ol aria-label={t('milestones.label')} className={cn('grid md:grid-cols-6', className)}>
    {levels.map((row, index) => {
      const state: MilestoneState = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'ahead';
      const next = levels[index + 1];
      const fill = !next || index > currentIndex ? 0 : index < currentIndex ? 1 : Math.min(1, Math.max(0, (total - row.at) / (next.at - row.at)));
      return <li key={row.level} aria-current={state === 'current' ? 'step' : undefined} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 md:block">
        <div aria-hidden="true" className="flex flex-col items-center md:flex-row">
          <span className={cn('relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full', nodeClass[state])}>
            {state === 'done' ? <Check className="size-4" strokeWidth={3} /> : state === 'current' ? <span className="size-2.5 rounded-full bg-primary" /> : <span className="size-1.5 rounded-full bg-muted-foreground/40" />}
          </span>
          {next && <span className="relative my-1.5 w-2 flex-1 overflow-hidden bg-muted [clip-path:polygon(0_0,50%_4px,100%_0,100%_calc(100%_-_6px),50%_100%,0_calc(100%_-_6px))] md:mx-1.5 md:my-0 md:h-2 md:w-auto md:[clip-path:polygon(0_0,calc(100%_-_7px)_0,100%_50%,calc(100%_-_7px)_100%,0_100%,5px_50%)]">
            <span className="absolute inset-x-0 top-0 h-[calc(var(--fill)*100%)] bg-primary md:inset-y-0 md:left-0 md:right-auto md:h-full md:w-[calc(var(--fill)*100%)]" style={{ ['--fill' as string]: fill }} />
          </span>}
        </div>
        <div className={cn('min-w-0 space-y-0.5 md:mt-2.5 md:pr-3', next && 'pb-5 md:pb-0')}>
          <p className={cn('text-sm font-semibold leading-5', state === 'current' && 'text-primary', state === 'ahead' && 'text-foreground/80')}>
            {t(`levels.${row.level}`)}<span className="sr-only"> · {t(`milestones.state.${state}`)}</span>
          </p>
          <p className="text-xs tabular-nums text-muted-foreground">{t('milestones.from', { at: number(row.at) })}</p>
          <p className="text-xs text-muted-foreground">{t('milestones.chats', { count: row.directChatsPerDay })}</p>
          {row.helperContact && <p className="pt-1"><span className="inline-flex max-w-full items-center gap-1 rounded-full bg-badge-brand px-2 py-px text-xs font-medium text-badge-brand-foreground"><Contact aria-hidden="true" className="size-3 shrink-0" />{t('contactBadge')}</span></p>}
        </div>
      </li>;
    })}
  </ol>;
}
