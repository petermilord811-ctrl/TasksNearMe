'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ActionResult, NeighborhoodDayHandlers, NeighborhoodDayManageView } from '@/contracts';
import { NeighborhoodDayCard } from '@/ui/components/availability/neighborhood-day-card';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/ui/primitives/alert-dialog';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';

/** The helper's own day (2026-11-24): the card as neighbors see it, and "Cancel open visits" while one is left. */
export function NeighborhoodDayManageCard({ day, onCancelDay, initialConfirm = false, initialResult }: {
  day: NeighborhoodDayManageView;
  onCancelDay?: NeighborhoodDayHandlers['onCancelDay'];
  initialConfirm?: boolean;
  initialResult?: ActionResult;
}) {
  const t = useTranslations('neighborhoodDays.manage');
  const router = useRouter();
  const [open, setOpen] = useState(initialConfirm);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState(initialResult);
  const locked = useRef(false);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const disabled = pending || Boolean(result?.ok);

  async function cancel() {
    if (locked.current || !onCancelDay) return;
    locked.current = true; setPending(true); setResult(undefined);
    let next: ActionResult;
    try { next = await onCancelDay({ dayId: day.id }); } catch { next = { ok: false, code: 'unknown' }; }
    locked.current = next.ok; setPending(false); setResult(next);
    if (next.ok) { setOpen(false); router.refresh(); }
  }

  const feedback = <FormFeedback result={result && !result.ok ? { ...result, fieldErrors: undefined } : result}
    successMessage={result?.ok ? t('canceled') : undefined}
    errorMessage={result && !result.ok && result.code === 'not_allowed' ? t('cancelNotAllowed') : undefined} />;
  return <NeighborhoodDayCard day={{ ...day, own: true }} linkVisits={false} footer={<>
    <div ref={feedbackRef} tabIndex={-1} className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{!open && feedback}</div>
    {onCancelDay && day.actions.includes('cancel_day') && <AlertDialog open={open} onOpenChange={(next) => { if (!pending) setOpen(next); }}>
      <AlertDialogTrigger asChild><Button type="button" variant="outline" disabled={disabled} className="w-full sm:w-auto">{t('cancel')}</Button></AlertDialogTrigger>
      <AlertDialogContent onCloseAutoFocus={(event) => { if (result?.ok) { event.preventDefault(); feedbackRef.current?.focus(); } }}>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('cancelTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('cancelBody')}</AlertDialogDescription>
        </AlertDialogHeader>
        {feedback}
        <AlertDialogFooter><AlertDialogCancel disabled={pending}>{t('keep')}</AlertDialogCancel><Button type="button" variant="destructive" disabled={disabled} aria-busy={pending} onClick={() => { void cancel(); }}>{pending && <Spinner aria-hidden="true" />}{t(pending ? 'canceling' : 'cancelConfirm')}</Button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>}
  </>} />;
}
