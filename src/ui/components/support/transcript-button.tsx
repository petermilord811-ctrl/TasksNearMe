'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MailCheck, Mail } from 'lucide-react';
import type { ActionResult, SupportTranscriptView } from '@/contracts';
import { useFormat } from '@/ui/lib/format';
import { cn } from '@/ui/lib/utils';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';

/**
 * "Email me this conversation" (2026-11-23, owner: "get a transcript by email"): the case's conversation to the
 * person's own address (shown partly hidden), at most 3 a day. Says where it went, or why it didn't.
 */
export function EmailTranscriptButton({ transcript, onEmail, compact = false, initialResult }: {
  transcript: SupportTranscriptView;
  onEmail(): Promise<ActionResult>;
  /** In the Help conversation: a small link-like button. */
  compact?: boolean;
  /** Seed for the preview gallery. */
  initialResult?: ActionResult;
}) {
  const t = useTranslations('supportCase.feedback.transcript');
  const { formatDateTime, zoneName } = useFormat();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ActionResult | undefined>(initialResult);
  const locked = useRef(false);

  async function send() {
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    setResult(undefined);
    let next: ActionResult;
    try {
      next = await onEmail();
    } catch {
      next = { ok: false, code: 'unknown' };
    }
    locked.current = false;
    setPending(false);
    setResult(next);
  }

  const message = result
    ? result.ok
      ? t('sent', { email: transcript.to })
      : result.code === 'rate_limited' && result.retryAt ? t('errors.rate_limited', { time: `${formatDateTime(result.retryAt)} ${zoneName}` })
        : result.code === 'unavailable' ? t('errors.unavailable')
          : result.code === 'not_allowed' ? t('errors.not_allowed')
            : t('errors.unknown')
    : undefined;
  return <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1', compact ? 'text-xs' : 'text-sm')}>
    <Button type="button" variant={compact ? 'ghost' : 'outline'} size="sm" disabled={pending} aria-busy={pending} onClick={() => void send()} className={cn('rounded-full', compact && '-ml-2 h-8 text-xs text-primary')}>
      {pending ? <Spinner aria-hidden="true" /> : result?.ok ? <MailCheck aria-hidden="true" /> : <Mail aria-hidden="true" />}{pending ? t('sending') : t('action')}
    </Button>
    {message
      ? <span role={result?.ok ? 'status' : 'alert'} className={cn(result?.ok ? 'text-muted-foreground' : 'text-destructive')}>{message}</span>
      : !compact && <span className="text-muted-foreground">{t('hint', { email: transcript.to })}</span>}
  </div>;
}
