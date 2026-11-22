'use client';

import { HeartHandshake } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ActionResult } from '@/contracts';
import { Button } from '@/ui/primitives/button';

/** Whether a result is the kindness reminder (plan 10.20): `unkind` on the title or the words. */
export function isKindnessReminder(result: ActionResult | undefined): boolean {
  if (!result || result.ok || !result.fieldErrors) return false;
  return Object.values(result.fieldErrors).some((codes) => codes?.includes('unkind'));
}

/**
 * Nextdoor's kindness reminder (plan 10.20): some words may land harder than meant. Not a refusal: the author edits,
 * or sends it as it is.
 */
export function KindnessReminder({ onEdit, onSendAnyway, busy, kind = 'post' }: { onEdit: () => void; onSendAnyway: () => void; busy?: boolean; kind?: 'post' | 'reply' }) {
  const t = useTranslations('community.kindness');
  return <div role="alert" className="space-y-3 rounded-2xl border border-warning/40 bg-warning/10 p-3.5 text-sm">
    <p className="flex items-start gap-2.5">
      <HeartHandshake aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-badge-warning-foreground" />
      <span><span className="font-semibold">{t('title')}</span> {t('body')}</span>
    </p>
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" variant="outline" onClick={onEdit} disabled={busy}>{t('edit')}</Button>
      <Button type="button" size="sm" variant="ghost" onClick={onSendAnyway} disabled={busy}>{t(kind === 'reply' ? 'replyAnyway' : 'postAnyway')}</Button>
    </div>
  </div>;
}
