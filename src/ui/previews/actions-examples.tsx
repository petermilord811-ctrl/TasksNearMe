'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ACTION_ERROR_CODES, ACTION_SUCCESS_CODES, type ActionDescriptor, type ActionResult } from '@/contracts';
import { deskCompletionSubmittedPosterActions, fakeHandler } from '@/fixtures';
import { ActionBar } from '@/ui/components/actions/action-bar';
import { AppToaster } from '@/ui/components/feedback/app-toaster';

export function ActionPreview({ actions, result = { ok: true, code: 'approved' }, controls, outcomeKey }: { actions: ActionDescriptor[]; result?: ActionResult; controls?: ReactNode; outcomeKey?: number }) {
  const t = useTranslations('feedback');
  return <main className="mx-auto flex min-h-96 max-w-5xl flex-col gap-8"><header className="space-y-3"><h1 className="font-heading text-2xl font-bold">{t('previewTitle')}</h1><p className="max-w-xl text-muted-foreground">{t('previewDescription')}</p></header>{controls}<div className="mt-auto"><ActionBar key={outcomeKey} actions={actions} onAction={fakeHandler<string>(result)} sticky /></div><AppToaster /></main>;
}

export function ResultPreview() {
  const t = useTranslations('feedback');
  const results: ActionResult[] = [...ACTION_SUCCESS_CODES.map((code) => ({ ok: true as const, code })), ...ACTION_ERROR_CODES.map((code) => ({ ok: false as const, code }))];
  const [selected, setSelected] = useState(0);
  return <ActionPreview outcomeKey={selected} actions={deskCompletionSubmittedPosterActions} result={results[selected]} controls={<label className="block space-y-2"><span className="block font-medium">{t('resultLabel')}</span><select className="min-h-11 w-full rounded-lg border border-input bg-background p-3" value={selected} onChange={(event) => setSelected(Number(event.target.value))}>{results.map((result, index) => <option key={`${result.ok}-${result.code}`} value={index}>{t(`${result.ok ? 'success' : 'error'}.${result.code}`)}</option>)}</select></label>} />;
}
