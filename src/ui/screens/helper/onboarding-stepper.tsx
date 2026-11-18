'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, ChevronDown, Gift, Hourglass, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type OnboardingProgress, type OnboardingStep, type OnboardingStepState } from '@/contracts';
import { cn } from '@/ui/lib/utils';

/**
 * Where the helper is in setup. Wide screens show every step; phones show only "Step 5 of 9: Phone" with a
 * progress bar (the step names itself once there, not again in a box), so the step's own card starts right under
 * it; "All steps" opens the list (done steps link back for changes). `giftSteps`: the steps that earn the welcome
 * gift card, marked with a small gift, in the list and on the phone's line.
 */
/** The profile's three steps are one part of setup (plan 9.11): one entry, done once all three are. */
const PROFILE_STEPS: readonly OnboardingStep[] = ['profile', 'services', 'area'];

function grouped(steps: OnboardingProgress['steps']): OnboardingProgress['steps'] {
  const profile = steps.filter((item) => PROFILE_STEPS.includes(item.step));
  if (profile.length === 0) return steps;
  const state: OnboardingStepState = profile.every((item) => item.state === 'done') ? 'done' : profile.some((item) => item.state === 'current') ? 'current' : 'todo';
  const rest = steps.filter((item) => !PROFILE_STEPS.includes(item.step));
  return [{ step: 'profile', state }, ...rest];
}

export function OnboardingStepper({ progress, step: viewing, giftSteps }: { progress: OnboardingProgress; step: OnboardingStep; giftSteps?: readonly OnboardingStep[] }) {
  const t = useTranslations('helperOnboarding');
  const [expanded, setExpanded] = useState(false);
  const steps = grouped(progress.steps);
  const currentStep = PROFILE_STEPS.includes(viewing) ? 'profile' : viewing;
  const total = steps.length;
  const position = Math.max(0, steps.findIndex((item) => item.step === currentStep));
  const done = steps.filter((item) => item.state === 'done' || item.state === 'skipped').length;
  return <nav aria-label={t('screen.progressLabel')} className="space-y-3">
    <div className="flex items-center gap-3 sm:hidden">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 text-sm font-medium">
          {t('screen.stepOf', { number: position + 1, total, step: t(`screen.steps.${currentStep}`) })}
          {/* The welcome gift card's cue stays on phones: this step is one of its three checks. */}
          {giftSteps?.includes(currentStep) && <><Gift aria-hidden="true" className="size-3.5 shrink-0 text-badge-reward-foreground" /><span className="sr-only">. {t('screen.giftStep')}</span></>}
        </p>
        <div aria-hidden="true" className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.round((done / total) * 100)}%` }} /></div>
      </div>
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded((open) => !open)} className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-md px-2 text-sm font-medium text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        {t(expanded ? 'screen.fewerSteps' : 'screen.allSteps')}<ChevronDown aria-hidden="true" className={cn('size-4 transition-transform', expanded && 'rotate-180')} />
      </button>
    </div>
    {/* Phones: the bar above names the step, so the list (the current step's box too) waits for "All steps" and
        the step's own card sits right under the bar. */}
    <ol className={cn('grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4', !expanded && 'max-sm:hidden')}>
      {steps.map(({ step, state }, index) => {
        const content = <><span aria-hidden="true" className={cn('flex size-7 shrink-0 items-center justify-center rounded-full border text-sm tabular-nums', state === 'current' && 'border-primary bg-primary text-primary-foreground', state === 'done' && 'border-primary/20 bg-secondary text-secondary-foreground')}>
          {state === 'done' ? <Check className="size-4" /> : state === 'locked' ? <Lock className="size-3.5" /> : state === 'in_review' ? <Hourglass className="size-3.5" /> : index + 1}
        </span><span className="min-w-0"><span className="flex items-center gap-1 text-sm font-medium">{t(`screen.steps.${step}`)}{giftSteps?.includes(step) && <Gift aria-hidden="true" className="size-3.5 shrink-0 text-badge-reward-foreground" />}</span><span className="block text-xs text-muted-foreground">{t(`screen.states.${state}`)}{giftSteps?.includes(step) && <span className="sr-only">. {t('screen.giftStep')}</span>}</span></span></>;
        return <li key={step} aria-current={state === 'current' ? 'step' : undefined}>
          {state === 'done' ? <Link href={routes.app.helperOnboarding(step)} className="flex min-h-14 items-center gap-2 rounded-lg p-2 hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{content}</Link> : <div className={cn('flex min-h-14 items-center gap-2 rounded-lg p-2', state === 'current' && 'bg-secondary/60')}>{content}</div>}
        </li>;
      })}
    </ol>
  </nav>;
}
