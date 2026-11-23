'use client';

import Link from 'next/link';
import { ArrowRight, Check, Clock, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { HelperSetupReminder } from '@/contracts';
import { routes } from '@/contracts/routes';
import { cn } from '@/ui/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/primitives/popover';

/** The ring's share done, drawn as an arc (the reminder's progress). */
function ProgressRing({ done, total, className }: { done: number; total: number; className?: string }) {
  const radius = 15;
  const length = 2 * Math.PI * radius;
  const share = total > 0 ? done / total : 0;
  return <svg aria-hidden="true" viewBox="0 0 36 36" className={cn('-rotate-90', className)}>
    <circle cx="18" cy="18" r={radius} fill="none" strokeWidth="3.5" className="stroke-primary/15" />
    <circle cx="18" cy="18" r={radius} fill="none" strokeWidth="3.5" strokeLinecap="round" className="stroke-primary transition-[stroke-dashoffset] duration-700 ease-[var(--ease-out)]" strokeDasharray={length} strokeDashoffset={length * (1 - share)} />
  </svg>;
}

/**
 * The verified-helper reminder (owner, 2026-11-23: "show 'Finish setting up to start helping' as 'to be verified
 * helper' and show it as reminder type, not full-width bar"): a small pill beside the search bar with the checks done
 * so far, which opens the checks, each one a link, in any order. While the home address isn't verified it says that's
 * what opens helping; after, the rest earns the verified badge.
 */
export function VerifiedHelperReminder({ reminder, className }: { reminder: HelperSetupReminder; className?: string }) {
  const t = useTranslations('shell.reminder');
  const steps = useTranslations('helperOnboarding.screen.steps');
  const { done, total, canHelp } = reminder;
  return <Popover>
    <PopoverTrigger asChild>
      <button type="button" className={cn('group/reminder relative flex min-h-12 shrink-0 items-center gap-2.5 rounded-full border border-primary/25 bg-brand-soft/90 py-1.5 pr-4 pl-1.5 text-left shadow-card backdrop-blur-md transition-[translate,box-shadow,background-color] duration-300 ease-[var(--ease-out)] hover:-translate-y-0.5 hover:bg-brand-soft max-sm:size-12 max-sm:justify-center max-sm:p-0', className)}>
        <span className="relative grid size-9 shrink-0 place-items-center">
          <ProgressRing done={done} total={total} className="absolute inset-0 size-9" />
          <ShieldCheck aria-hidden="true" className="size-4 text-primary" />
          {!canHelp && <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-primary ring-2 ring-card motion-safe:animate-pulse" />}
        </span>
        {/* The button's name is its own words (axe: label-content-name-mismatch), read but not shown on phones. */}
        <span className="min-w-0 leading-tight max-sm:sr-only">
          <span className="block text-[0.8125rem] font-semibold text-foreground">{t('title')}</span>{' '}
          <span className="block text-xs text-muted-foreground tabular-nums">{t('count', { done, total })}</span>
        </span>
      </button>
    </PopoverTrigger>
    <PopoverContent align="end" sideOffset={8} className="w-[min(22rem,calc(100vw-2rem))] p-0">
      <div className="space-y-1 border-b border-foreground/[0.07] p-4 dark:border-white/[0.07]">
        <p className="flex items-center gap-2 font-display text-base font-semibold"><ShieldCheck aria-hidden="true" className="size-5 text-primary" />{t('title')}</p>
        <p className="text-sm text-muted-foreground">{t(canHelp ? 'bodyVerified' : 'bodyStart')}</p>
        <div className="flex items-center gap-3 pt-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-primary/15"><div className="h-full rounded-full bg-primary transition-[width] duration-700 ease-[var(--ease-out)]" style={{ width: `${total > 0 ? Math.round((done / total) * 100) : 0}%` }} /></div>
          <span className="text-xs font-medium text-muted-foreground tabular-nums">{t('count', { done, total })}</span>
        </div>
      </div>
      <ul className="p-2">
        {reminder.checks.map(({ step, state }) => {
          const finished = state === 'done';
          const waiting = state === 'in_review';
          return <li key={step}>
            <Link href={routes.app.helperOnboarding(step)} className="flex min-h-12 items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-accent">
              <span aria-hidden="true" className={cn('grid size-7 shrink-0 place-items-center rounded-full', finished ? 'bg-primary text-primary-foreground' : waiting ? 'bg-info/15 text-info' : 'border border-foreground/15 text-muted-foreground')}>
                {finished ? <Check className="size-3.5" /> : waiting ? <Clock className="size-3.5" /> : <span className="size-1.5 rounded-full bg-current" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn('block text-sm font-medium', finished && 'text-muted-foreground')}>{steps(step)}</span>
                <span className="block text-xs text-muted-foreground">{t(`states.${finished ? 'done' : waiting ? 'in_review' : step === 'address' && !canHelp ? 'opens' : 'todo'}`)}</span>
              </span>
              {!finished && <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />}
            </Link>
          </li>;
        })}
      </ul>
      <div className="flex items-center justify-between gap-3 border-t border-foreground/[0.07] p-3 pl-4 dark:border-white/[0.07]">
        <span className="text-xs text-muted-foreground">{t('anyOrder')}</span>
        <Link href={routes.app.helperOnboarding(reminder.next)} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-[1.03]">{t('continue')}<ArrowRight aria-hidden="true" className="size-4" /></Link>
      </div>
    </PopoverContent>
  </Popover>;
}
