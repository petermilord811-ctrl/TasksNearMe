'use client';

import { AlertCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/ui/primitives/button';

export interface ErrorStateProps { title?: string; body?: string; onRetry?: () => void }

export function ErrorState({ title, body, onRetry }: ErrorStateProps) {
  const t = useTranslations('feedback');
  return (
    <div className="rounded-[1.375rem] border border-badge-danger/70 bg-card p-6 shadow-card">
      <div role="alert" className="flex items-start gap-4">
        <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-2xl bg-badge-danger text-destructive">
          <AlertCircle className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-lg leading-tight font-semibold tracking-[-0.015em]">{title ?? t('errorTitle')}</h2>
          <p className="mt-2 text-sm leading-6 text-pretty text-muted-foreground">{body ?? t('errorBody')}</p>
        </div>
      </div>
      {onRetry && <Button variant="outline" onClick={onRetry} className="mt-5">{t('retry')}</Button>}
    </div>
  );
}
