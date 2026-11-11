'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ActionResult, HelperRewardActionId, RewardsHandlers } from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';

export function RewardGrantActions({ grantId, actions, deliveryUrl, onRedeem }: {
  grantId: string;
  actions: HelperRewardActionId[];
  deliveryUrl?: string;
  onRedeem: RewardsHandlers['onRedeem'];
}) {
  const t = useTranslations('rewards');
  const feedback = useTranslations('feedback');
  const router = useRouter();
  const locked = useRef(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ActionResult>();

  async function redeem() {
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    setResult(undefined);
    let next: ActionResult;
    try {
      next = await onRedeem({ grantId });
    } catch {
      next = { ok: false, code: 'unknown' };
    }
    locked.current = false;
    setPending(false);
    setResult(next);
    if (next.ok) {
      if (next.redirectTo) router.push(next.redirectTo);
      else if (next.code === 'submitted') router.refresh();
    }
  }

  // A card has no editable fields: always surface the error summary.
  const feedbackResult = result && !result.ok ? { ok: false as const, code: result.code, retryAt: result.retryAt } : result;
  const errorMessage = result && !result.ok
    ? result.code === 'not_allowed' || result.code === 'rate_limited' || result.code === 'unknown'
      ? t(`redeem.${result.code}`)
      : feedback(`error.${result.code}`)
    : undefined;
  const missingLinkId = `reward-link-unavailable-${grantId}`;

  return <div className="space-y-3">
    {actions.length > 0 && <div className="flex flex-wrap gap-3">
      {actions.map((action) => action === 'redeem'
        ? <Button key={action} type="button" disabled={pending} aria-busy={pending} onClick={() => void redeem()}>
          {pending && <Spinner aria-hidden="true" className="motion-reduce:animate-none" />}
          {pending ? t('redeem.pending') : t(`actions.${action}`)}
        </Button>
        : deliveryUrl
          ? <Button key={action} asChild variant="outline"><a href={deliveryUrl} target="_blank" rel="noopener noreferrer" aria-label={`${t(`actions.${action}`)} (${t('card.opensInNewTab')})`}>
            <ExternalLink aria-hidden="true" />{t(`actions.${action}`)}
          </a></Button>
          : <div key={action} className="space-y-2">
            <Button type="button" variant="outline" disabled aria-describedby={missingLinkId}>{t(`actions.${action}`)}</Button>
            <p id={missingLinkId} className="text-sm text-muted-foreground">{t('card.deliveryUnavailable')}</p>
          </div>)}
    </div>}
    <FormFeedback result={feedbackResult} successMessage={result?.ok && result.code === 'submitted' ? t('redeem.submitted') : undefined} errorMessage={errorMessage} />
  </div>;
}
