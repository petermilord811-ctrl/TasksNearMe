'use client';

import { useRouter } from 'next/navigation';
import { Smartphone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type HelperOnboardingHandlers, type VerificationSummary } from '@/contracts';
import { FlowFrame, FlowHeading, FlowIcon } from '@/ui/components/verify-flow/flow-frame';
import { SuccessMark } from '@/ui/components/verify-flow/checks';
import { PhoneStep } from '@/ui/screens/helper/phone-step';

/** The phone check in the verification flows' frame: the number, the texted code, done (2026-11-27). */
export function PhoneFlow({ variant, verification, handlers, doneHref = routes.app.helperVerification(), initialSentTo }: {
  variant: 'dialog' | 'page';
  verification: VerificationSummary;
  handlers: Pick<HelperOnboardingHandlers, 'onStartPhone' | 'onConfirmPhone'>;
  doneHref?: string;
  initialSentTo?: string;
}) {
  const t = useTranslations('verifyFlow.phone');
  const router = useRouter();
  const verified = verification.phone.verified;
  return <FlowFrame
    variant={variant}
    title={t('title')}
    screen="phone"
    direction={1}
    {...(variant === 'page' ? { onClose: () => { router.push(doneHref); router.refresh(); } } : {})}
  >
    <FlowHeading icon={verified ? <SuccessMark /> : <FlowIcon><Smartphone /></FlowIcon>} description={verified ? undefined : t('description')}>{t(verified ? 'verifiedTitle' : 'title')}</FlowHeading>
    <PhoneStep verification={verification} handlers={handlers} initialSentTo={initialSentTo} inDialog compact />
  </FlowFrame>;
}
