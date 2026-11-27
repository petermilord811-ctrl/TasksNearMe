'use client';

import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type HelperCheckDialogStep, type HelperOnboardingHandlers, type OnboardingStep, type VerificationSummary } from '@/contracts';
import { RouteDialogBody, RouteDialogHeader } from '@/ui/components/layout/route-dialog';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { buttonVariants } from '@/ui/primitives/button';
import { AddressFlow } from '@/ui/screens/verify/address-flow';
import { IdFlow } from '@/ui/screens/verify/id-flow';
import { PhoneFlow } from '@/ui/screens/verify/phone-flow';

export type HelperCheckDialogData =
  | { step: HelperCheckDialogStep; verification: VerificationSummary }
  /** Setup has to go somewhere else first (the helper invite): its page. */
  | { step: HelperCheckDialogStep; elsewhere: OnboardingStep };

export type HelperCheckDialogHandlers = Pick<
  HelperOnboardingHandlers,
  'onStartPhone' | 'onConfirmPhone' | 'onSearchAddresses' | 'onSubmitAddressProof' | 'onCheckProgress' | 'onAcceptIdentityNotice' | 'onSubmitIdentityCapture' | 'onStartIdentity' | 'onRefreshStatus'
>;

/**
 * One check in a dialog over the page it's opened from (2026-11-23, owner: "I hate to redirect to new pages continually
 * … if possible, use dialog"; 2026-11-27: the ID check too, in the Persona-style flow): the phone, the home address or
 * the ID, from Verifications, the verified-helper reminder and the verification checklist. Finishing closes it and the
 * page underneath refreshes.
 */
export function HelperCheckDialogScreen({ data, handlers }: { data: HelperCheckDialogData; handlers: HelperCheckDialogHandlers }) {
  const steps = useTranslations('helperOnboarding.screen.steps');
  const screen = useTranslations('helperOnboarding.screen');
  const t = useTranslations('shell.reminder');
  if ('elsewhere' in data) {
    return <>
      <RouteDialogHeader title={t(`checkTitles.${data.step}`)} description={t('elsewhere')} />
      <RouteDialogBody>
        <Link href={routes.app.helperOnboarding(data.elsewhere)} className={buttonVariants({ className: 'w-full sm:w-auto' })}>{screen('continueStep', { step: steps(data.elsewhere) })}<ArrowRight aria-hidden="true" /></Link>
      </RouteDialogBody>
    </>;
  }
  if (data.step === 'phone') return <PhoneFlow variant="dialog" verification={data.verification} handlers={handlers} />;
  if (data.step === 'address') return <AddressFlow variant="dialog" verification={data.verification} handlers={handlers} />;
  return <IdFlow variant="dialog" verification={data.verification} handlers={handlers} />;
}
