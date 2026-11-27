'use client';

import { useId, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { BadgeCheck, Clock, Lock, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import type { BadgeTone, PosterIdentityHandlers, PosterIdentityPageData } from '@/contracts';
import { routes } from '@/contracts';
import { useFormat } from '@/ui/lib/format';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { PageHeader } from '@/ui/components/layout/page-header';
import { StatusBadge } from '@/ui/components/status/status-badge';
import { useFormAction } from '@/ui/lib/use-form-action';
import { Button } from '@/ui/primitives/button';
import { FieldError } from '@/ui/primitives/field';
import { Spinner } from '@/ui/primitives/spinner';
import { identityStatusTones } from '@/ui/components/status/verification-tones';

const checkboxClass = 'mt-0.5 size-5 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

function Note({ tone, children }: { tone: 'info' | 'warning' | 'success'; children: ReactNode }) {
  const Icon = tone === 'warning' ? TriangleAlert : tone === 'info' ? Clock : BadgeCheck;
  const tones = { warning: 'bg-badge-warning text-badge-warning-foreground', info: 'bg-badge-info text-badge-info-foreground', success: 'bg-badge-success text-badge-success-foreground' };
  return <p className={`flex items-start gap-2 rounded-lg p-3 ${tones[tone]}`}><Icon aria-hidden="true" className="mt-1 size-4 shrink-0" /><span>{children}</span></p>;
}

/**
 * A client's ID check, when risk asks for one: why, the check's state, the Texas biometric notice before
 * it opens, and "Continue" back to what they were doing once it passes. The check itself is the provider's.
 */
export function PosterIdentityScreen({ data, handlers }: { data: PosterIdentityPageData; handlers: PosterIdentityHandlers }) {
  const { formatDateTime } = useFormat();
  const t = useTranslations('posterIdentity');
  const v = useTranslations('verification');
  const id = useId();
  const form = useForm();
  const action = useFormAction(form);
  const [agreed, setAgreed] = useState(false);
  const [agreeError, setAgreeError] = useState(false);
  const { identity, reason, continueHref } = data;

  const verified = identity.status === 'verified' && !identity.nameCheck;
  const needed = Boolean(reason) && !verified && !identity.nameCheck;
  const supportNeeded = needed && (identity.blocked === 'too_many_attempts' || identity.blocked === 'under_18');
  const processing = needed && !identity.blocked && identity.status === 'processing';
  const canStart = needed && !identity.blocked && identity.status !== 'processing';
  const tone: BadgeTone = identity.nameCheck ? 'info' : identity.blocked && needed ? 'warning' : identityStatusTones[identity.status];
  const label = identity.nameCheck ? v('statuses.identityNameCheck') : identity.blocked && needed ? v('statuses.identityBlocked') : v(`statuses.identity.${identity.status}`);

  async function start() {
    if (identity.consentNeeded && !agreed) { setAgreeError(true); return; }
    setAgreeError(false);
    await action.run(handlers.onStartIdentity, { consent: agreed, next: continueHref });
  }

  return <div className="mx-auto w-full max-w-[720px] space-y-6 lg:space-y-8">
    <PageHeader title={t('title')} description={t(`reasons.${reason ?? 'none'}`)} />

    <section aria-labelledby={`${id}-heading`} className="space-y-5 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><ShieldCheck aria-hidden="true" className="size-5" /></span>
          <h2 id={`${id}-heading`} className="font-heading text-lg font-semibold">{t('cardTitle')}</h2>
        </div>
        <StatusBadge tone={tone} label={label} />
      </div>

      <div className="space-y-3 text-sm leading-6 text-muted-foreground">
        {verified && <Note tone="success">{t('verified')}</Note>}
        {identity.nameCheck && <Note tone="info">{t('nameCheck')}</Note>}
        {!reason && !verified && !identity.nameCheck && <p>{t('notNeeded')}</p>}
        {needed && <>
          {identity.status !== 'processing' && !identity.blocked && <p>{t('explanation')}</p>}
          {identity.status === 'requires_input' && !identity.blocked && <Note tone="warning">{v(`identityFailureReasons.${identity.failureReason ?? 'other'}`)}</Note>}
          {identity.blocked === 'try_later' && <Note tone="warning">{v('setup.identityBlocked.try_later', { time: identity.retryAt ? formatDateTime(identity.retryAt) : '' })}</Note>}
          {identity.blocked === 'too_many_attempts' && <Note tone="warning">{v('setup.identityBlocked.too_many_attempts')}</Note>}
          {identity.blocked === 'under_18' && <Note tone="warning">{v('setup.identityBlocked.under_18')}</Note>}
          {processing && <p>{t('processing')}</p>}
        </>}
        {!verified && <p className="flex items-start gap-2"><Lock aria-hidden="true" className="mt-1 size-4 shrink-0" />{t('privacy')}</p>}
      </div>

      {canStart && identity.consentNeeded && <div className="space-y-2">
        <div className="space-y-2 rounded-xl border bg-background p-4 text-sm leading-6">
          <p className="font-medium">{v('setup.biometric.title')}</p>
          <p className="text-muted-foreground">{v('setup.biometric.body')}</p>
          <label className="flex min-h-11 cursor-pointer items-start gap-3">
            <input type="checkbox" checked={agreed} onChange={(event) => { setAgreed(event.target.checked); setAgreeError(false); }} aria-invalid={agreeError || undefined} aria-describedby={agreeError ? `${id}-agree-error` : undefined} className={checkboxClass} />
            <span>{v('setup.biometric.checkbox')}</span>
          </label>
        </div>
        {agreeError && <FieldError id={`${id}-agree-error`}>{v('setup.biometric.required')}</FieldError>}
      </div>}

      <FormFeedback result={action.result && !action.result.ok ? { ...action.result, fieldErrors: undefined } : action.result} />

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {canStart && <Button className="w-full whitespace-normal sm:w-auto" type="button" disabled={action.pending} aria-busy={action.pending} onClick={() => void start()}>
          {action.pending && <Spinner />}{t(identity.status === 'requires_input' || identity.status === 'canceled' ? 'tryAgain' : 'start')}
        </Button>}
        {(processing || identity.nameCheck) && <Button className="w-full whitespace-normal sm:w-auto" type="button" disabled={action.pending} aria-busy={action.pending} onClick={() => void action.run(handlers.onRefreshStatus, undefined)}>
          {action.pending && <Spinner />}{t('checkStatus')}
        </Button>}
        {processing && <Button className="w-full whitespace-normal sm:w-auto" type="button" variant="outline" disabled={action.pending} onClick={() => void start()}>{t('continueCheck')}</Button>}
        {(verified || !reason) && !identity.nameCheck && <Button asChild className="w-full sm:w-auto"><Link href={continueHref}>{t('continue')}</Link></Button>}
        {supportNeeded && <Button asChild variant="outline" className="w-full sm:w-auto"><Link href={routes.app.support()}>{t('contactSupport')}</Link></Button>}
      </div>
    </section>
  </div>;
}
