'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CircleAlert, ExternalLink } from 'lucide-react';
import type { ActionResult, EarningsHandlers } from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { Alert, AlertDescription } from '@/ui/primitives/alert';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';

export function EarningsDashboardAction({ onOpenPayoutDashboard, actionNeeded }: {
  onOpenPayoutDashboard: EarningsHandlers['onOpenPayoutDashboard'];
  actionNeeded: boolean;
}) {
  const t = useTranslations('earnings');
  const feedback = useTranslations('feedback');
  const router = useRouter();
  const locked = useRef(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ActionResult>();

  async function openDashboard() {
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    setResult(undefined);
    let next: ActionResult;
    try {
      next = await onOpenPayoutDashboard();
    } catch {
      next = { ok: false, code: 'unknown' };
    }
    locked.current = false;
    setPending(false);
    setResult(next);
    if (next.ok && next.redirectTo) router.push(next.redirectTo);
  }

  const button = <Button type="button" variant={actionNeeded ? 'default' : 'link'} className="max-w-full whitespace-normal text-left" disabled={pending} aria-busy={pending} onClick={() => void openDashboard()}>
    {pending ? <Spinner /> : <ExternalLink aria-hidden="true" />}
    {pending ? t('openingDashboard') : t(actionNeeded ? 'updateBank' : 'dashboard')}
  </Button>;

  // There are no editable fields here, so even a field validation response needs a visible summary.
  const feedbackResult = result && !result.ok ? { ok: false as const, code: result.code, retryAt: result.retryAt } : result;

  return <div className="space-y-3">
    {actionNeeded ? <Alert className="border-destructive/30">
      <CircleAlert aria-hidden="true" className="text-destructive" />
      <AlertDescription className="gap-3 text-foreground"><p className="font-medium">{t('actionNeeded')}</p>{button}</AlertDescription>
    </Alert> : button}
    <FormFeedback result={feedbackResult} successMessage={t('dashboardReady')} errorMessage={result && !result.ok ? result.code === 'not_allowed' ? t('dashboardNotAllowed') : feedback(`error.${result.code}`) : undefined} />
  </div>;
}
