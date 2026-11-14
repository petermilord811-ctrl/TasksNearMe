'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ActionResult, AdminWebhooksHandlers, WebhookActionInput } from '@/contracts';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';

/** Replay and Dismiss for one failing webhook event, with the outcome announced. */
export function AdminWebhookActions({ eventRowId, label, canReplay, handlers }: { eventRowId: string; label: string; canReplay: boolean; handlers: AdminWebhooksHandlers }) {
  const t = useTranslations('adminWebhooks');
  const router = useRouter();
  const [pending, setPending] = useState<WebhookActionInput['action'] | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = async (action: WebhookActionInput['action']) => {
    setPending(action);
    setResult(null);
    try {
      const outcome = await handlers.onAction({ eventRowId, action });
      setResult(outcome);
      if (outcome.ok) router.refresh();
    } catch {
      setResult({ ok: false, code: 'unknown' });
    } finally {
      setPending(null);
    }
  };
  const message = !result ? null : result.ok ? t('result.done') : result.code === 'not_allowed' ? t('result.notAllowed') : t('result.failedAgain');
  return <div className="space-y-2">
    <div className="flex flex-wrap gap-2">
      {canReplay && <Button type="button" variant="outline" className="min-h-11" disabled={pending !== null} aria-busy={pending === 'replay'} aria-label={t('replayLabel', { event: label })} onClick={() => void run('replay')}>
        {pending === 'replay' && <Spinner aria-hidden="true" />}{t('replay')}
      </Button>}
      <Button type="button" variant="ghost" className="min-h-11" disabled={pending !== null} aria-busy={pending === 'dismiss'} aria-label={t('dismissLabel', { event: label })} onClick={() => void run('dismiss')}>
        {pending === 'dismiss' && <Spinner aria-hidden="true" />}{t('dismiss')}
      </Button>
    </div>
    <p aria-live="polite" className="text-sm text-muted-foreground">{message}</p>
  </div>;
}
