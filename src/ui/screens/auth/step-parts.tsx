import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { ActionResult, SignInHandlers, SignInPageData } from '@/contracts';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';

export interface SignInStepProps {
  data: SignInPageData;
  handlers: SignInHandlers;
  initialResult?: ActionResult;
  onResult?: (result: ActionResult) => void;
}

export function StepHeading({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="space-y-3">
    <h1 className="font-display text-2xl font-semibold leading-8 tracking-[-0.025em] md:text-3xl md:leading-[38px]">{title}</h1>
    {children && <div className="space-y-2 text-muted-foreground">{children}</div>}
  </div>;
}

export function ContinueButton({ pending }: { pending: boolean }) {
  const t = useTranslations('forms');
  return <Button type="submit" disabled={pending} aria-busy={pending} className="w-full">
    {pending && <Spinner aria-hidden="true" />}{t('continue')}
  </Button>;
}
