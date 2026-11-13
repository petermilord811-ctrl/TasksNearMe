'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { LockKeyhole } from 'lucide-react';
import type { ActionResult, SignInHandlers, SignInPageData } from '@/contracts';
import { EmailStep } from './email-step';
import { EmailCodeStep } from './email-code-step';
import { InviteCodeStep } from './invite-code-step';
import { ProfileStep } from './profile-step';
import { PhoneStep } from './phone-step';
import { PhoneCodeStep } from './phone-code-step';

const steps = { email: EmailStep, email_code: EmailCodeStep, invite_code: InviteCodeStep, profile: ProfileStep, phone: PhoneStep, phone_code: PhoneCodeStep };

export function SignInFrame({ children }: { children: ReactNode }) {
  const t = useTranslations('signIn');
  return <div className="mx-auto w-full max-w-reading py-4 md:py-8">
    <div className="mx-auto max-w-[420px] rounded-[1.375rem] border border-foreground/[0.07] bg-card p-card shadow-card dark:border-white/[0.06]">
      <div aria-hidden="true" className="mb-6 flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-primary shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_14%,transparent)]"><LockKeyhole className="size-5" /></div>
      {children}
      <p className="mt-6 border-t border-border pt-4 text-sm text-muted-foreground">{t('oneAccount')}</p>
    </div>
  </div>;
}

function SignInFlow({ data, handlers }: { data: SignInPageData; handlers: SignInHandlers }) {
  const [lastResult, setLastResult] = useState<ActionResult>();
  const Step = steps[data.step];
  return <Step data={data} handlers={handlers} initialResult={lastResult} onResult={setLastResult} />;
}

export function SignInScreen({ data, handlers }: { data: SignInPageData; handlers: SignInHandlers }) {
  return <SignInFrame><SignInFlow key={`${data.step}:${data.email ?? ''}:${data.maskedPhone ?? ''}`} data={data} handlers={handlers} /></SignInFrame>;
}
