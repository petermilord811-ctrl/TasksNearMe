'use client';

import { AlertCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/ui/primitives/button';

export interface ErrorStateProps { title?: string; body?: string; onRetry?: () => void }

export function ErrorState({ title, body, onRetry }: ErrorStateProps) {
  const t = useTranslations('feedback');
  return (
    <div className="rounded-xl border border-badge-danger/60 bg-card p-6">
      <div role="alert" className="flex items-start gap-3">
        <AlertCircle aria-hidden="true" className="mt-1 size-5 shrink-0 text-destructive" />
        <div>
          <h2 className="text-lg font-semibold">{title ?? t('errorTitle')}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{body ?? t('errorBody')}</p>
        </div>
      </div>
      {onRetry && <Button variant="outline" onClick={onRetry} className="mt-5">{t('retry')}</Button>}
    </div>
  );
}
