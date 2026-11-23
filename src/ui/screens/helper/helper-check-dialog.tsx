'use client';

import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type HelperCheckDialogStep, type HelperOnboardingHandlers, type OnboardingStep, type VerificationSummary } from '@/contracts';
import { RouteDialogBody, RouteDialogHeader } from '@/ui/components/layout/route-dialog';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { buttonVariants } from '@/ui/primitives/button';
import { AddressStep } from './address-step';
import { PhoneStep } from './phone-step';

export type HelperCheckDialogData =
  | { step: HelperCheckDialogStep; verification: VerificationSummary }
  /** Setup has to go somewhere else first (a step before it, or the helper invite): its page. */
  | { step: HelperCheckDialogStep; elsewhere: OnboardingStep };

/**
 * One check of a verified helper in a dialog over the page it's opened from (2026-11-23, owner: "I hate to redirect to
 * new pages continually … if possible, use dialog"): the phone or the home address, from the verified-helper reminder
 * and the verification checklist. The right code or the sent proof closes it, and the page underneath refreshes (the
 * reminder counts it). Setup's own pages keep their step-to-step flow; the ID check, payouts and the background check
 * hand off to their providers from there.
 */
export function HelperCheckDialogScreen({ data, handlers }: { data: HelperCheckDialogData; handlers: Pick<HelperOnboardingHandlers, 'onStartPhone' | 'onConfirmPhone' | 'onSearchAddresses' | 'onSubmitAddressProof'> }) {
  const steps = useTranslations('helperOnboarding.screen.steps');
  const screen = useTranslations('helperOnboarding.screen');
  const t = useTranslations('shell.reminder');
  const title = t(`checkTitles.${data.step}`);
  if ('elsewhere' in data) {
    return <>
      <RouteDialogHeader title={title} description={t('elsewhere')} />
      <RouteDialogBody>
        <Link href={routes.app.helperOnboarding(data.elsewhere)} className={buttonVariants({ className: 'w-full sm:w-auto' })}>{screen('continueStep', { step: steps(data.elsewhere) })}<ArrowRight aria-hidden="true" /></Link>
      </RouteDialogBody>
    </>;
  }
  return <>
    <RouteDialogHeader title={title} description={t(`checkDescriptions.${data.step}`)} />
    <RouteDialogBody>
      {data.step === 'phone'
        ? <PhoneStep verification={data.verification} handlers={handlers} inDialog />
        : <AddressStep verification={data.verification} handlers={handlers} inDialog />}
    </RouteDialogBody>
  </>;
}
