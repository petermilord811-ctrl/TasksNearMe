'use client';

import { useId } from 'react';
import Link from 'next/link';
import { BadgeCheck, CircleDollarSign, Lock, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import type { ActionHandler, ActionResult, BackgroundCheckStatus, BadgeTone, CategorySlug, CategoryView, HelperOnboardingHandlers, IdentityStatus, PayoutAccountStatus, VerificationSummary } from '@/contracts';
import { routes } from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { VerificationBadges } from '@/ui/components/people/verification-badges';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useFormAction } from '@/ui/lib/use-form-action';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';

export type VerificationTrack = 'identity' | 'payout' | 'background';

export const identityStatusTones: Record<IdentityStatus, BadgeTone> = {
  not_started: 'neutral', processing: 'info', requires_input: 'warning', verified: 'success', canceled: 'neutral',
};
export const payoutStatusTones: Record<PayoutAccountStatus, BadgeTone> = {
  not_started: 'neutral', pending: 'info', requirements_due: 'warning', active: 'success', restricted: 'danger',
};
export const backgroundStatusTones: Record<BackgroundCheckStatus, BadgeTone> = {
  not_required: 'neutral', not_started: 'neutral', invited: 'info', pending: 'info', clear: 'success',
  consider: 'warning', suspended: 'danger', canceled: 'neutral', expired: 'warning',
};

export interface VerificationPanelProps {
  track: VerificationTrack;
  verification: VerificationSummary;
  categories: CategoryView[];
  bookableCategories: CategorySlug[];
  firstPayoutDays?: number;
  handlers?: Pick<HelperOnboardingHandlers, 'onStartIdentity' | 'onStartPayout' | 'onStartBackgroundCheck' | 'onRefreshStatus'>;
  headingLevel?: 2 | 3;
  initialResult?: ActionResult;
  stickyAction?: boolean;
}

/** Displays provider status supplied by the app; provider forms stay with the providers. */
export function VerificationPanel({ track, verification, categories, bookableCategories, firstPayoutDays, handlers, headingLevel = 2, initialResult, stickyAction = false }: VerificationPanelProps) {
  const t = useTranslations('verification');
  const id = useId();
  const form = useForm();
  const action = useFormAction(form, { initialResult });
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  const status = verification[track].status;
  const tone = track === 'identity' ? identityStatusTones[verification.identity.status]
    : track === 'payout' ? payoutStatusTones[verification.payout.status] : backgroundStatusTones[verification.background.status];
  const Icon = track === 'identity' ? ShieldCheck : track === 'payout' ? CircleDollarSign : BadgeCheck;
  const complete = track === 'identity' ? status === 'verified' : track === 'payout' ? status === 'active' : status === 'clear' || status === 'not_required';
  const underReview = track === 'background' && status === 'consider';
  const supportNeeded = track === 'payout' && status === 'restricted' || track === 'background' && status === 'suspended';
  let providerAction: { label: string; handler: ActionHandler } | undefined;

  if (handlers && !supportNeeded && !underReview) {
    if (track === 'identity') {
      if (status === 'processing') providerAction = { label: t('setup.checkStatus'), handler: handlers.onRefreshStatus };
      else if (status !== 'verified') providerAction = { label: t(status === 'requires_input' || status === 'canceled' ? 'setup.tryAgain' : 'setup.startIdentity'), handler: handlers.onStartIdentity };
    } else if (track === 'payout' && status !== 'active') {
      providerAction = { label: t(status === 'not_started' ? 'setup.startPayout' : 'setup.continuePayout'), handler: handlers.onStartPayout };
    } else if (track === 'background') {
      if (status === 'invited' || status === 'pending') providerAction = { label: t('setup.checkStatus'), handler: handlers.onRefreshStatus };
      else if (status === 'not_started' || status === 'expired' || status === 'canceled') providerAction = { label: t(status === 'not_started' ? 'setup.startBackground' : 'setup.restartBackground'), handler: handlers.onStartBackgroundCheck };
    }
  }

  if (track === 'background' && verification.background.requiredFor.length === 0) return null;

  const badges = {
    phoneVerified: false,
    ...(track === 'identity' && status === 'verified' && verification.identity.verifiedAt ? { idVerifiedAt: verification.identity.verifiedAt } : {}),
    ...(track === 'background' && status === 'clear' && verification.background.checkedAt ? { backgroundCheckedAt: verification.background.checkedAt } : {}),
  };

  return <section aria-labelledby={`${id}-heading`} className="space-y-5 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><Icon aria-hidden="true" className="size-5" /></span>
        <Heading id={`${id}-heading`} className="font-heading text-lg font-semibold">{t(`setup.titles.${track}`)}</Heading>
      </div>
      <StatusBadge tone={tone} label={t(`statuses.${track}.${status}`)} />
    </div>

    {!underReview && <>
      <div className="space-y-3 text-sm leading-6 text-muted-foreground">
        {track === 'identity' && <>
          <p>{t('setup.identityExplanation')}</p>
          {status === 'requires_input' && <p className="rounded-lg bg-badge-warning p-3 text-badge-warning-foreground">{t(`identityFailureReasons.${verification.identity.failureReason ?? 'other'}`)}</p>}
          <p>{t('setup.identityPublic')}</p>
        </>}
        {track === 'payout' && <>
          <p>{t('setup.payoutExplanation')}</p>
          {firstPayoutDays !== undefined && <p>{t('setup.firstPayout', { days: firstPayoutDays })}</p>}
          {status === 'requirements_due' && <p className="font-medium text-foreground">{t('setup.payoutRequirements')}</p>}
          {status === 'restricted' && <p>{t('setup.payoutRestricted')}</p>}
        </>}
        {track === 'background' && <>
          <p>{t('setup.backgroundExplanation')}</p>
          <div>
            <p className="font-medium text-foreground">{t('setup.requiredCategories')}</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">{verification.background.requiredFor.map((slug) => <li key={slug}>{categories.find((category) => category.slug === slug)?.name ?? t(`setup.categoryNames.${slug}`)}</li>)}</ul>
          </div>
          {(status === 'invited' || status === 'pending') && <p>{t(`setup.backgroundWaiting.${status}`)}</p>}
          {status === 'suspended' && <p>{t('setup.backgroundSuspended')}</p>}
          {bookableCategories.length > 0 && <div className="rounded-lg bg-secondary p-3 text-secondary-foreground">
            <p className="font-medium">{t('setup.bookableCategories')}</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">{bookableCategories.map((slug) => <li key={slug}>{categories.find((category) => category.slug === slug)?.name ?? t(`setup.categoryNames.${slug}`)}</li>)}</ul>
          </div>}
        </>}
      </div>

      {(badges.idVerifiedAt || badges.backgroundCheckedAt) && <VerificationBadges badges={badges} />}
      {!complete && !supportNeeded && <p className="flex items-start gap-2 text-sm text-muted-foreground"><Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t(`setup.privacy.${track}`)}</p>}
      <FormFeedback result={action.result && !action.result.ok ? { ...action.result, fieldErrors: undefined } : action.result} />
      {providerAction && <div className={stickyAction ? 'fixed inset-x-0 bottom-app-navigation z-20 border-t bg-card px-gutter pt-3 pb-[max(.75rem,env(safe-area-inset-bottom))] sm:static sm:z-auto sm:border-0 sm:bg-transparent sm:p-0' : undefined}><div className="mx-auto max-w-reading"><Button className="w-full whitespace-normal sm:w-auto" type="button" disabled={action.pending} aria-busy={action.pending} onClick={() => void action.run(providerAction.handler, undefined)}>
        {action.pending && <Spinner />}{providerAction.label}
      </Button></div></div>}
      {supportNeeded && <Button asChild variant="outline" className="w-full sm:w-auto"><Link href={routes.app.support()}>{t('setup.contactSupport')}</Link></Button>}
      {!handlers && !complete && !supportNeeded && <Button asChild variant="outline" className="w-full whitespace-normal sm:w-auto"><Link href={routes.app.helperOnboarding(track)}>{t(`setup.open.${track}`)}</Link></Button>}
    </>}
  </section>;
}
