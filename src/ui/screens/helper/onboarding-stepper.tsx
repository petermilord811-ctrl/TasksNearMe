'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, ChevronDown, Hourglass, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type OnboardingProgress, type OnboardingStep } from '@/contracts';
import { cn } from '@/ui/lib/utils';

/**
 * Where the helper is in setup. Wide screens show every step; phones show "Step 5 of 9" with a progress
 * bar and only the current step, so the step's own form starts on the first screen; "All steps" opens
 * the rest (done steps link back for changes).
 */
export function OnboardingStepper({ progress, step: currentStep }: { progress: OnboardingProgress; step: OnboardingStep }) {
  const t = useTranslations('helperOnboarding');
  const [expanded, setExpanded] = useState(false);
  const total = progress.steps.length;
  const position = Math.max(0, progress.steps.findIndex((item) => item.step === currentStep));
  const done = progress.steps.filter((item) => item.state === 'done' || item.state === 'skipped').length;
  return <nav aria-label={t('screen.progressLabel')} className="space-y-3">
    <div className="flex items-center gap-3 sm:hidden">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{t('screen.stepOf', { number: position + 1, total, step: t(`screen.steps.${currentStep}`) })}</p>
        <div aria-hidden="true" className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.round((done / total) * 100)}%` }} /></div>
      </div>
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded((open) => !open)} className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-md px-2 text-sm font-medium text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        {t(expanded ? 'screen.fewerSteps' : 'screen.allSteps')}<ChevronDown aria-hidden="true" className={cn('size-4 transition-transform', expanded && 'rotate-180')} />
      </button>
    </div>
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {progress.steps.map(({ step, state }, index) => {
        const content = <><span aria-hidden="true" className={cn('flex size-7 shrink-0 items-center justify-center rounded-full border text-sm tabular-nums', state === 'current' && 'border-primary bg-primary text-primary-foreground', state === 'done' && 'border-primary/20 bg-secondary text-secondary-foreground')}>
          {state === 'done' ? <Check className="size-4" /> : state === 'locked' ? <Lock className="size-3.5" /> : state === 'in_review' ? <Hourglass className="size-3.5" /> : index + 1}
        </span><span className="min-w-0"><span className="block text-sm font-medium">{t(`screen.steps.${step}`)}</span><span className="block text-xs text-muted-foreground">{t(`screen.states.${state}`)}</span></span></>;
        // Phones keep only the step on screen until "All steps" is opened.
        return <li key={step} aria-current={state === 'current' ? 'step' : undefined} className={cn(!expanded && step !== currentStep && 'max-sm:hidden', !expanded && step === currentStep && 'max-sm:col-span-2')}>
          {state === 'done' ? <Link href={routes.app.helperOnboarding(step)} className="flex min-h-14 items-center gap-2 rounded-lg p-2 hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{content}</Link> : <div className={cn('flex min-h-14 items-center gap-2 rounded-lg p-2', state === 'current' && 'bg-secondary/60')}>{content}</div>}
        </li>;
      })}
    </ol>
  </nav>;
}
