'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ActionResult, AdminWebhooksHandlers, WebhookActionInput } from '@/contracts';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';
import { Textarea } from '@/ui/primitives/textarea';

/** Replay and Dismiss for one failing webhook event, with the outcome announced. */
export function AdminWebhookActions({ eventRowId, label, canReplay, handlers }: { eventRowId: string; label: string; canReplay: boolean; handlers: AdminWebhooksHandlers }) {
  const t = useTranslations('adminWebhooks');
  const router = useRouter();
  const [pending, setPending] = useState<WebhookActionInput['action'] | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  // Dismissing asks why first (it goes in the audit log).
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const reasonId = useId();
  const hintId = useId();
  const run = async (action: WebhookActionInput['action']) => {
    setPending(action);
    setResult(null);
    try {
      const outcome = await handlers.onAction(action === 'dismiss' ? { eventRowId, action, reason } : { eventRowId, action });
      setResult(outcome);
      if (outcome.ok) router.refresh();
    } catch {
      setResult({ ok: false, code: 'unknown' });
    } finally {
      setPending(null);
    }
  };
  const reasonMissing = result && !result.ok && result.code === 'validation_failed';
  const message = !result ? null : result.ok ? t('result.done') : reasonMissing ? t('reasonRequired') : result.code === 'not_allowed' ? t('result.notAllowed') : t('result.failedAgain');
  return <div className="space-y-2">
    <div className="flex flex-wrap gap-2">
      {canReplay && <Button type="button" variant="outline" className="min-h-11" disabled={pending !== null} aria-busy={pending === 'replay'} aria-label={t('replayLabel', { event: label })} onClick={() => void run('replay')}>
        {pending === 'replay' && <Spinner aria-hidden="true" />}{t('replay')}
      </Button>}
      {!asking && <Button type="button" variant="ghost" className="min-h-11" disabled={pending !== null} aria-label={t('dismissLabel', { event: label })} onClick={() => setAsking(true)}>
        {t('dismiss')}
      </Button>}
    </div>
    {asking && <div className="space-y-2">
      <label htmlFor={reasonId} className="block text-sm font-medium">{t('dismissReason')}</label>
      <Textarea id={reasonId} value={reason} onChange={(event) => setReason(event.target.value)} aria-describedby={hintId} aria-invalid={reasonMissing || undefined} rows={2} maxLength={500} />
      <p id={hintId} className="text-sm text-muted-foreground">{t('dismissHint')}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="min-h-11" disabled={pending !== null} aria-busy={pending === 'dismiss'} aria-label={t('dismissLabel', { event: label })} onClick={() => void run('dismiss')}>
          {pending === 'dismiss' && <Spinner aria-hidden="true" />}{t('dismissConfirm')}
        </Button>
        <Button type="button" variant="ghost" className="min-h-11" disabled={pending !== null} onClick={() => { setAsking(false); setReason(''); setResult(null); }}>{t('dismissCancel')}</Button>
      </div>
    </div>}
    <p aria-live="polite" className="text-sm text-muted-foreground">{message}</p>
  </div>;
}
