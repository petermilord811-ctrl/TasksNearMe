'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { routes, type SeriesHandlers, type SeriesVisitView } from '@/contracts';
import { useFormat } from '@/ui/lib/format';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/ui/primitives/alert-dialog';
import { Button, buttonVariants } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';
import { SeriesFeedback } from './series-actions';
import { useSeriesMutation } from './use-series-mutation';

/**
 * One visit's actions, in the server's order: "Pay now" and "View booking" lead to the visit's booking page; "Skip"
 * asks first (the client: nothing is charged; the helper: the client is told).
 */
export function VisitActions({ visit, role, otherName, onSkipVisit }: { visit: SeriesVisitView; role: 'poster' | 'helper'; otherName: string; onSkipVisit: SeriesHandlers['onSkipVisit'] }) {
  const t = useTranslations('series');
  const { formatDate } = useFormat();
  const mutation = useSeriesMutation();
  const [confirming, setConfirming] = useState(false);
  if (visit.actions.length === 0) return null;
  const date = formatDate(visit.start);

  return <div className="space-y-2">
    <div role="group" aria-label={t('visitActionsLabel', { date })} className="flex flex-wrap gap-2">
      {visit.actions.map((id) => {
        if (id === 'skip_visit') {
          return <Button key={id} type="button" variant="outline" size="sm" disabled={mutation.pending !== null} aria-busy={mutation.pending !== null || undefined} onClick={() => { mutation.setResult(undefined); setConfirming(true); }} className="min-h-11 text-destructive hover:text-destructive">
            {mutation.pending && <Spinner aria-hidden="true" />}{t('visitActions.skip_visit')}
          </Button>;
        }
        if (!visit.bookingId) return null;
        return <Link key={id} href={routes.app.booking(visit.bookingId)} className={buttonVariants({ variant: id === 'pay_visit' ? 'default' : 'outline', size: 'sm', className: 'min-h-11' })}>{t(`visitActions.${id}`)}</Link>;
      })}
    </div>
    <SeriesFeedback result={mutation.result} onReload={mutation.refresh} />
    <AlertDialog open={confirming} onOpenChange={setConfirming}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('skip.title', { date })}</AlertDialogTitle>
          <AlertDialogDescription>{role === 'poster' ? t('skip.descriptionPoster') : t('skip.descriptionHelper', { name: otherName })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('keep')}</AlertDialogCancel>
          <AlertDialogAction className={buttonVariants({ variant: 'destructive' })} onClick={() => { setConfirming(false); void mutation.run('skip', () => onSkipVisit({ visitId: visit.id }), t('skip.success')); }}>{t('skip.confirm')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
