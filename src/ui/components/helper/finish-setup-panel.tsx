import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type HelperSetupState } from '@/contracts';
import { buttonVariants } from '@/ui/primitives/button';

export interface FinishSetupPanelProps {
  setup: HelperSetupState;
  title?: string;
  body?: string;
}

/** The caller decides when setup is required; this panel shows the supplied next step. */
export function FinishSetupPanel({ setup, title, body }: FinishSetupPanelProps) {
  const t = useTranslations('findWork');
  const heading = title ?? t('setupTitle');
  return <section aria-label={heading} className="flex flex-col gap-4 rounded-xl border border-callout-border bg-callout p-card text-callout-foreground sm:flex-row sm:items-center sm:justify-between">
    <div><h2 className="text-xl font-semibold">{heading}</h2><p className="mt-2 text-sm">{body ?? t('setupBody')}</p></div>
    <Link href={routes.app.helperOnboarding(setup.nextOnboardingStep)} className={buttonVariants({ className: 'shrink-0' })}>{t('finishSetup')}<ArrowRight aria-hidden="true" /></Link>
  </section>;
}
