import Link from 'next/link';
import { Circle, CircleCheck, CircleDashed, Clock, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { routes, type AccountVerification, type HelperStandingView, type OnboardingStepState, type VerificationStepId } from '@/contracts';
import { WelcomeGiftCardView } from '@/ui/components/rewards/welcome-gift-card';
import { cn } from '@/ui/lib/utils';

/**
 * The profile's first page (completion plan 6.5): the $50 welcome gift card (every helper whose phone, ID and
 * background checks pass, 2026-11-14) and the verification steps, each with its state and what to do next. Shown
 * above onboarding's profile step and the profile editor; the checklist also sits on the account page.
 */

const STATE_ICON: Record<OnboardingStepState, ReactNode> = {
  done: <CircleCheck className="text-success" />,
  in_review: <Clock className="text-info" />,
  current: <Circle className="text-primary" />,
  todo: <Circle className="text-muted-foreground" />,
  locked: <Lock className="text-muted-foreground" />,
  skipped: <Circle className="text-muted-foreground" />,
  later: <CircleDashed className="text-muted-foreground" />,
};

/** Where a step's next action leads, or nothing (done, locked, or not the person's to do from here). */
function actionFor(step: VerificationStepId, state: OnboardingStepState, role: AccountVerification['role']): { href: string; kind: 'start' | 'status' } | null {
  if (state === 'done' || state === 'locked' || state === 'skipped' || state === 'later') return null;
  const kind = state === 'in_review' ? 'status' : 'start';
  // The phone and the home address in a dialog over the page (2026-11-23); the other checks on their setup pages.
  if (role === 'helper') return { href: routes.app.helperCheck(step), kind };
  // A client's ID check (asked for by our team) has its own page; the phone is on this account page.
  return step === 'identity' ? { href: routes.app.verifyIdentity(routes.app.account()), kind } : null;
}

export function VerificationChecklist({ steps, role }: { steps: AccountVerification['steps']; role: AccountVerification['role'] }) {
  const t = useTranslations('helperStanding.checklist');
  return <ol className="divide-y divide-foreground/[0.07] dark:divide-white/[0.07]">
    {steps.map(({ step, state }) => {
      const action = actionFor(step, state, role);
      return <li key={step} className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
        <span aria-hidden="true" className="shrink-0 [&_svg]:size-5">{STATE_ICON[state]}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{t(`steps.${step}`)}</span>
          <span className="block text-sm text-muted-foreground">{t(`states.${state}`)}</span>
        </span>
        {action && <Link href={action.href} aria-label={t(`actions.${action.kind}Label`, { step: t(`steps.${step}`) })} className="inline-flex min-h-11 shrink-0 items-center rounded-md px-1 font-medium text-primary underline-offset-4 hover:underline">
          {t(`actions.${action.kind}`)}
        </Link>}
      </li>;
    })}
  </ol>;
}

/** The welcome gift card and the verification checklist, at the top of the profile's first page. */
export function HelperStandingPanel({ standing, className }: { standing: HelperStandingView; className?: string }) {
  const t = useTranslations('helperStanding');
  const { steps } = standing;
  const done = steps.filter((entry) => entry.state === 'done').length;
  return <div className={cn('space-y-4', className)}>
    {standing.giftCard && <WelcomeGiftCardView card={standing.giftCard} />}
    <section aria-labelledby="verification-checklist-title" className="rounded-xl border bg-card p-card shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="verification-checklist-title" className="text-lg font-semibold">{t('checklist.title')}</h2>
        <p className="text-sm text-muted-foreground tabular-nums">{t('checklist.count', { done, total: steps.length })}</p>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{t('checklist.intro')}</p>
      <div className="mt-2"><VerificationChecklist steps={steps} role="helper" /></div>
    </section>
  </div>;
}
