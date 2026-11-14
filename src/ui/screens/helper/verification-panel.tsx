'use client';

import { useId, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { BadgeCheck, CircleDollarSign, Clock, Lock, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import type { ActionHandler, ActionResult, BackgroundCheckStatus, BadgeTone, CategorySlug, CategoryView, HelperOnboardingHandlers, PayoutAccountStatus, VerificationSummary } from '@/contracts';
import { routes } from '@/contracts';
import { useFormat } from '@/ui/lib/format';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { VerificationBadges } from '@/ui/components/people/verification-badges';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useFormAction } from '@/ui/lib/use-form-action';
import { Button } from '@/ui/primitives/button';
import { FieldError } from '@/ui/primitives/field';
import { Spinner } from '@/ui/primitives/spinner';
import { identityBadge, IdentityStages } from './identity-stages';

export { identityStatusTones } from './identity-stages';

/**
 * The hosted tracks this panel shows (the phone and home address have their own steps). For the ID, it's
 * the provider's double check, once our team approved the photos (`IdentityCaptureStep` takes them).
 */
export type ProviderTrack = 'identity' | 'payout' | 'background';
export const payoutStatusTones: Record<PayoutAccountStatus, BadgeTone> = {
  not_started: 'neutral', pending: 'info', requirements_due: 'warning', active: 'success', restricted: 'danger',
};
export const backgroundStatusTones: Record<BackgroundCheckStatus, BadgeTone> = {
  not_required: 'neutral', not_started: 'neutral', invited: 'info', pending: 'info', clear: 'success',
  consider: 'warning', suspended: 'danger', canceled: 'neutral', expired: 'warning',
};

export interface VerificationPanelProps {
  track: ProviderTrack;
  verification: VerificationSummary;
  categories: CategoryView[];
  bookableCategories: CategorySlug[];
  firstPayoutDays?: number;
  handlers?: Pick<HelperOnboardingHandlers, 'onStartIdentity' | 'onStartPayout' | 'onStartBackgroundCheck' | 'onRefreshStatus'>;
  headingLevel?: 2 | 3;
  initialResult?: ActionResult;
  stickyAction?: boolean;
}

const checkboxClass = 'mt-0.5 size-5 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

function Note({ tone, children }: { tone: 'info' | 'warning' | 'success'; children: ReactNode }) {
  const Icon = tone === 'warning' ? TriangleAlert : tone === 'info' ? Clock : BadgeCheck;
  return <p className={tone === 'warning' ? 'flex items-start gap-2 rounded-lg bg-badge-warning p-3 text-badge-warning-foreground' : tone === 'info' ? 'flex items-start gap-2 rounded-lg bg-badge-info p-3 text-badge-info-foreground' : 'flex items-start gap-2 rounded-lg bg-badge-success p-3 text-badge-success-foreground'}>
    <Icon aria-hidden="true" className="mt-1 size-4 shrink-0" /><span>{children}</span>
  </p>;
}

/** Displays provider status supplied by the app; provider forms stay with the providers. */
export function VerificationPanel({ track, verification, bookableCategories, firstPayoutDays, handlers, headingLevel = 2, initialResult, stickyAction = false }: VerificationPanelProps) {
  const { formatDate, formatDateTime } = useFormat();
  const t = useTranslations('verification');
  const categoryNames = useTranslations('helperCard.categories');
  const id = useId();
  const form = useForm();
  const action = useFormAction(form, { initialResult });
  const [agreed, setAgreed] = useState(false);
  const [agreeError, setAgreeError] = useState(false);
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  const { identity, payout, background } = verification;
  const backgroundApproved = background.status === 'clear' || (background.status === 'consider' && background.adjudication === 'engaged');
  const backgroundCounts = backgroundApproved || !!background.validUntil;
  /** The provider's check opens once our own check (stage 1) is approved; without one (clients), it's the only check. */
  const capture = identity.capture;
  const providerOpen = !capture || capture.stage === 'approved';
  const identityBadgeView = identityBadge(identity);

  const tone: BadgeTone = track === 'identity'
    ? identityBadgeView.tone
    : track === 'payout' ? payoutStatusTones[payout.status]
      : background.adjudication === 'engaged' ? 'success' : background.adjudication === 'post_adverse' ? 'danger' : backgroundStatusTones[background.status];
  const label = track === 'identity'
    ? t(identityBadgeView.key)
    : track === 'payout' ? t(`statuses.payout.${payout.status}`)
      : background.adjudication ? t(`statuses.backgroundAdjudication.${background.adjudication}`) : t(`statuses.background.${background.status}`);
  const Icon = track === 'identity' ? ShieldCheck : track === 'payout' ? CircleDollarSign : BadgeCheck;
  const complete = track === 'identity' ? identity.status === 'verified' && !identity.nameCheck : track === 'payout' ? payout.status === 'active' : backgroundApproved || background.status === 'not_required';
  const supportNeeded = (track === 'payout' && payout.status === 'restricted') || (track === 'background' && (background.status === 'suspended' || background.adjudication === 'post_adverse')) || (track === 'identity' && (identity.blocked === 'under_18' || identity.blocked === 'too_many_attempts' || identity.blocked === 'double_check_review' || identity.blocked === 'duplicate_id'));
  /** Consent (identity) or the disclosure (background) is needed before the provider opens. */
  const needsAgreement = track === 'identity' ? identity.consentNeeded : track === 'background' ? background.disclosureNeeded : false;
  /** A helper's notice covers both stages of the ID check; a client's, the provider's check alone. */
  const notice = track === 'identity' ? (capture ? 'capture.notice' : 'setup.biometric') : 'setup.disclosure';

  let providerAction: { label: string; run: () => Promise<ActionResult | undefined> } | undefined;
  let secondaryAction: { label: string; run: () => Promise<ActionResult | undefined> } | undefined;
  const run = <I,>(handler: ActionHandler<I>, input: I) => () => action.run(handler, input);
  if (handlers && !supportNeeded) {
    if (track === 'identity' && identity.status !== 'verified' && !identity.blocked && providerOpen) {
      if (identity.status === 'processing') {
        providerAction = { label: t('setup.checkStatus'), run: run(handlers.onRefreshStatus, undefined) };
        secondaryAction = { label: t('setup.continueIdentity'), run: run(handlers.onStartIdentity, { consent: agreed }) };
      } else {
        const start = capture ? 'setup.startDoubleCheck' : 'setup.startIdentity';
        providerAction = { label: t(identity.status === 'requires_input' || identity.status === 'canceled' ? 'setup.tryAgain' : start), run: run(handlers.onStartIdentity, { consent: agreed }) };
      }
    } else if (track === 'identity' && identity.nameCheck) {
      providerAction = { label: t('setup.checkStatus'), run: run(handlers.onRefreshStatus, undefined) };
    } else if (track === 'payout' && payout.status !== 'active') {
      providerAction = { label: t(payout.status === 'not_started' ? 'setup.startPayout' : 'setup.continuePayout'), run: run(handlers.onStartPayout, undefined) };
    } else if (track === 'background') {
      if (background.status === 'invited' || background.status === 'pending' || (background.status === 'consider' && !background.adjudication)) {
        providerAction = { label: t('setup.checkStatus'), run: run(handlers.onRefreshStatus, undefined) };
      } else if (background.canStart) {
        const key = background.renewalOpen ? 'setup.startRenewal' : background.status === 'not_started' ? 'setup.startBackground' : 'setup.restartBackground';
        providerAction = { label: t(key), run: run(handlers.onStartBackgroundCheck, { acknowledged: agreed }) };
      }
    }
  }

  if (track === 'background' && background.requiredFor.length === 0) return null;
  const startsProvider = providerAction && (track === 'identity' ? identity.status !== 'processing' && !identity.nameCheck : track === 'background' ? background.canStart : false);

  async function press(next: NonNullable<typeof providerAction>, starts: boolean) {
    if (starts && needsAgreement && !agreed) { setAgreeError(true); return; }
    setAgreeError(false);
    await next.run();
  }

  const badges = {
    phoneVerified: false,
    ...(track === 'identity' && identity.status === 'verified' && !identity.nameCheck && identity.verifiedAt ? { idVerifiedAt: identity.verifiedAt } : {}),
    ...(track === 'background' && background.status === 'clear' && background.checkedAt ? { backgroundCheckedAt: background.checkedAt } : {}),
  };
  const categoryName = (slug: CategorySlug) => categoryNames(slug);

  return <section aria-labelledby={`${id}-heading`} className="space-y-5 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><Icon aria-hidden="true" className="size-5" /></span>
        <Heading id={`${id}-heading`} className="font-heading text-lg font-semibold">{t(`setup.titles.${track}`)}</Heading>
      </div>
      <StatusBadge tone={tone} label={label} />
    </div>

    <div className="space-y-3 text-sm leading-6 text-muted-foreground">
      {track === 'identity' && <>
        {capture && <IdentityStages identity={identity} />}
        {!complete && identity.blocked !== 'double_check_review' && identity.blocked !== 'duplicate_id' && <p>{t(capture?.stage === 'approved' ? 'setup.identityDoubleCheck' : capture?.stage === 'in_review' ? 'capture.inReview' : capture ? 'capture.explanation' : 'setup.identityExplanation')}</p>}
        {capture?.stage === 'needed' && capture.rejectionReason && !identity.blocked && <Note tone="warning">{t(`capture.rejectionReasons.${capture.rejectionReason}`)}</Note>}
        {identity.requested && <Note tone={identity.renewal ? 'info' : 'warning'}>{t(`setup.identityRequested.${identity.requested}`, { date: identity.renewal ? formatDate(identity.renewal.countsUntil) : '' })}</Note>}
        {identity.status === 'requires_input' && !identity.blocked && <Note tone="warning">{t(`identityFailureReasons.${identity.failureReason ?? 'other'}`)}</Note>}
        {identity.blocked === 'try_later' && <Note tone="warning">{t('setup.identityBlocked.try_later', { time: identity.retryAt ? formatDateTime(identity.retryAt) : '' })}</Note>}
        {identity.blocked === 'too_many_attempts' && <Note tone="warning">{t('setup.identityBlocked.too_many_attempts')}</Note>}
        {identity.blocked === 'under_18' && <Note tone="warning">{t('setup.identityBlocked.under_18')}</Note>}
        {identity.blocked === 'double_check_review' && <Note tone="warning">{t('setup.identityBlocked.double_check_review')}</Note>}
        {identity.blocked === 'duplicate_id' && <Note tone="warning">{t('setup.identityBlocked.duplicate_id')}</Note>}
        {identity.nameCheck && <Note tone="info">{t.rich('setup.identityNameCheck', { account: (chunks) => <Link href={routes.app.account()} className="font-medium underline underline-offset-4">{chunks}</Link> })}</Note>}
        {identity.status === 'processing' && <p>{t('setup.identityProcessing')}</p>}
        <p>{t('setup.identityPublic')}</p>
      </>}
      {track === 'payout' && <>
        <p>{t('setup.payoutExplanation')}</p>
        {firstPayoutDays !== undefined && <p>{t('setup.firstPayout', { days: firstPayoutDays })}</p>}
        {payout.status === 'requirements_due' && <p className="font-medium text-foreground">{t('setup.payoutRequirements')}</p>}
        {payout.status === 'restricted' && <p>{t('setup.payoutRestricted')}</p>}
      </>}
      {track === 'background' && <>
        {!backgroundCounts && <p>{t('setup.backgroundExplanation')}</p>}
        <div>
          <p className="font-medium text-foreground">{t('setup.requiredCategories')}</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">{background.requiredFor.map((slug) => <li key={slug}>{categoryName(slug)}</li>)}</ul>
        </div>
        {background.validUntil && <Note tone={background.renewalOpen ? 'warning' : 'success'}>{t(background.renewalOpen ? 'setup.backgroundRenewal' : 'setup.backgroundValidUntil', { date: formatDate(background.validUntil) })}</Note>}
        {background.status === 'invited' && <p>{background.invitationExpiresAt ? t('setup.backgroundInvitedUntil', { date: formatDateTime(background.invitationExpiresAt) }) : t('setup.backgroundWaiting.invited')}</p>}
        {background.status === 'pending' && <p>{t('setup.backgroundWaiting.pending')}</p>}
        {background.status === 'consider' && !background.adjudication && <Note tone="info">{t('setup.backgroundReview')}</Note>}
        {background.adjudication === 'pre_adverse' && <Note tone="warning">{t('setup.backgroundPreAdverse', { date: background.disputeUntil ? formatDate(background.disputeUntil) : '' })}</Note>}
        {background.adjudication === 'post_adverse' && <Note tone="warning">{t('setup.backgroundPostAdverse')}</Note>}
        {background.adjudication === 'engaged' && <Note tone="success">{t('setup.backgroundEngaged')}</Note>}
        {background.status === 'suspended' && <Note tone="warning">{t('setup.backgroundSuspended')}</Note>}
        {background.status === 'expired' && !background.validUntil && <Note tone="warning">{t('setup.backgroundExpired')}</Note>}
        {bookableCategories.length > 0 && <div className="rounded-lg bg-secondary p-3 text-secondary-foreground">
          <p className="font-medium">{t('setup.bookableCategories')}</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">{bookableCategories.map((slug) => <li key={slug}>{categoryName(slug)}</li>)}</ul>
        </div>}
      </>}
    </div>

    {(badges.idVerifiedAt || badges.backgroundCheckedAt) && <VerificationBadges badges={badges} />}

    {handlers && startsProvider && needsAgreement && <div className="space-y-2">
      <div className="space-y-2 rounded-xl border bg-background p-4 text-sm leading-6">
        <p className="font-medium">{t(track === 'identity' ? 'setup.biometric.title' : 'setup.disclosure.title')}</p>
        <p className="text-muted-foreground">{t(`${notice}.body`)}</p>
        <label className="flex min-h-11 cursor-pointer items-start gap-3">
          <input type="checkbox" checked={agreed} onChange={(event) => { setAgreed(event.target.checked); setAgreeError(false); }} aria-invalid={agreeError || undefined} aria-describedby={agreeError ? `${id}-agree-error` : undefined} className={checkboxClass} />
          <span>{t(`${notice}.checkbox`)}</span>
        </label>
      </div>
      {agreeError && <FieldError id={`${id}-agree-error`}>{t(`${notice}.required`)}</FieldError>}
    </div>}

    {!complete && !supportNeeded && <p className="flex items-start gap-2 text-sm text-muted-foreground"><Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{t(`setup.privacy.${track}`)}</p>}
    <FormFeedback result={action.result && !action.result.ok ? { ...action.result, fieldErrors: undefined } : action.result} />
    {providerAction && <div className={stickyAction ? 'fixed inset-x-0 bottom-app-navigation z-20 border-t bg-card px-gutter pt-3 pb-[max(.75rem,env(safe-area-inset-bottom))] sm:static sm:z-auto sm:border-0 sm:bg-transparent sm:p-0' : undefined}><div className="mx-auto flex max-w-reading flex-col gap-2 sm:flex-row sm:flex-wrap">
      <Button className="w-full whitespace-normal sm:w-auto" type="button" disabled={action.pending} aria-busy={action.pending} onClick={() => void press(providerAction, !!startsProvider)}>
        {action.pending && <Spinner />}{providerAction.label}
      </Button>
      {secondaryAction && <Button className="w-full whitespace-normal sm:w-auto" type="button" variant="outline" disabled={action.pending} onClick={() => void press(secondaryAction, true)}>{secondaryAction.label}</Button>}
    </div></div>}
    {supportNeeded && <Button asChild variant="outline" className="w-full sm:w-auto"><Link href={routes.app.support()}>{t('setup.contactSupport')}</Link></Button>}
    {!handlers && !complete && !supportNeeded && <Button asChild variant="outline" className="w-full whitespace-normal sm:w-auto"><Link href={routes.app.helperOnboarding(track)}>{t(`setup.open.${track}`)}</Link></Button>}
  </section>;
}
