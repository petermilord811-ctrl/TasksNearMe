'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Download, LogOut, RotateCcw, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { DELETION_GRACE_DAYS, routes, type AccountHandlers, type AccountPageData } from '@/contracts';
import { formatDate, formatDateTime } from '@/shared/format';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { cn } from '@/ui/lib/utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/ui/primitives/alert-dialog';
import { Button, buttonVariants } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';
import { useAccountAction } from './use-account-action';

/**
 * A copy of their data (prepared in the background, then a download for a week) and deleting the account
 * (in `DELETION_GRACE_DAYS`, with "Keep my account" until then; it waits while anything is still open).
 */
export function AccountPrivacy({ privacy, handlers }: {
  privacy: AccountPageData['privacy'];
  handlers: Pick<AccountHandlers, 'onRequestExport' | 'onRequestDeletion' | 'onCancelDeletion'>;
}) {
  const t = useTranslations('account');
  const exportAction = useAccountAction({ refresh: true });
  const deletionAction = useAccountAction({ refresh: true });
  const keepAction = useAccountAction({ refresh: true });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const privacyRegion = useRef<HTMLDivElement>(null);
  const deletionSucceeded = useRef(false);
  const exportRequested = Boolean(privacy.export || exportAction.result?.ok);
  const deletion = privacy.deletion;
  // Asked for in this visit and not taken back: the button stays off until the page has the date.
  const deletionAsked = Boolean(deletionAction.result?.ok && !keepAction.result?.ok);
  const deletionError = deletionAction.result && !deletionAction.result.ok && deletionAction.result.code === 'not_allowed' ? t('privacy.deletionBlocked') : undefined;
  const wideButton = 'h-auto min-h-11 w-full whitespace-normal sm:w-auto';

  return <div ref={privacyRegion} role="group" aria-label={t('privacy.title')} tabIndex={-1} className="space-y-6 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t('privacy.exportDescription')}</p>
      {privacy.export?.status === 'ready' ? <div className="space-y-2">
        <a href={routes.api.dataExport()} download className={cn(buttonVariants({ variant: 'outline' }), wideButton)}><Download aria-hidden="true" />{t('privacy.download')}</a>
        <p className="text-sm tabular-nums text-muted-foreground">{t('privacy.exportReady', { date: formatDateTime(privacy.export.expiresAt) })}</p>
      </div> : privacy.export?.status === 'preparing' ? <p className="text-sm tabular-nums">{t('privacy.exportPreparing', { date: formatDate(privacy.export.requestedAt) })}</p> : <>
        <Button type="button" variant="outline" disabled={exportRequested || exportAction.pending} aria-busy={exportAction.pending} className={wideButton} onClick={() => { void exportAction.run(handlers.onRequestExport, undefined); }}>{exportAction.pending ? <Spinner aria-hidden="true" /> : <Download aria-hidden="true" />}{t(exportAction.pending ? 'privacy.requestingExport' : 'privacy.requestExport')}</Button>
        <FormFeedback result={exportAction.result} successMessage={t('privacy.exportSubmitted')} />
      </>}
    </div>
    <div className="space-y-3 border-t pt-6">
      <p className="text-sm text-muted-foreground">{t('privacy.deletionDescription')}</p>
      {deletion ? <div className="space-y-3">
        <p className="text-sm font-medium tabular-nums">{t('privacy.deletionScheduled', { date: formatDate(deletion.scheduledFor) })}</p>
        {deletion.waitingFor && <p className="text-sm text-muted-foreground">{t('privacy.deletionWaiting', { reason: deletion.waitingFor })}</p>}
        {deletionAction.result?.ok && <FormFeedback result={deletionAction.result} successMessage={t('privacy.deletionSubmitted', { days: DELETION_GRACE_DAYS })} />}
        <Button type="button" variant="outline" disabled={keepAction.pending} aria-busy={keepAction.pending} className={wideButton} onClick={() => { void keepAction.run(handlers.onCancelDeletion, undefined); }}>
          {keepAction.pending ? <Spinner aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}{t(keepAction.pending ? 'privacy.keepingAccount' : 'privacy.keepAccount')}
        </Button>
      </div> : <>
        <AlertDialog open={confirmOpen} onOpenChange={(open) => { if (!deletionAction.pending) setConfirmOpen(open); }}>
          <AlertDialogTrigger asChild><Button type="button" variant="outline" disabled={deletionAsked} className={cn(wideButton, 'text-destructive hover:text-destructive')}><Trash2 aria-hidden="true" />{t('privacy.delete')}</Button></AlertDialogTrigger>
          <AlertDialogContent aria-busy={deletionAction.pending} onCloseAutoFocus={(event) => {
            if (deletionSucceeded.current) {
              event.preventDefault();
              privacyRegion.current?.focus();
            }
          }}>
            <AlertDialogHeader><AlertDialogTitle>{t('privacy.confirmTitle')}</AlertDialogTitle><AlertDialogDescription>{t('privacy.confirmDescription', { days: DELETION_GRACE_DAYS })}</AlertDialogDescription></AlertDialogHeader>
            <FormFeedback result={deletionAction.result} successMessage={t('privacy.deletionSubmitted', { days: DELETION_GRACE_DAYS })} errorMessage={deletionError} />
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deletionAction.pending}>{t('privacy.cancelDelete')}</AlertDialogCancel>
              <AlertDialogAction variant="destructive" disabled={deletionAction.pending} aria-busy={deletionAction.pending} className="h-auto min-h-11 whitespace-normal" onClick={async (event) => {
                event.preventDefault();
                const result = await deletionAction.run(handlers.onRequestDeletion, undefined);
                if (result?.ok) {
                  deletionSucceeded.current = true;
                  setConfirmOpen(false);
                }
              }}>{deletionAction.pending && <Spinner aria-hidden="true" />}{t(deletionAction.pending ? 'privacy.requestingDeletion' : 'privacy.confirmDelete')}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {!confirmOpen && !keepAction.result && <FormFeedback result={deletionAction.result} successMessage={t('privacy.deletionSubmitted', { days: DELETION_GRACE_DAYS })} errorMessage={deletionError} />}
        {keepAction.result && <FormFeedback result={keepAction.result} successMessage={t('privacy.deletionCanceled')} />}
      </>}
    </div>
    <Link href={routes.legal('privacy')} className="inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4">{t('privacy.policy')}</Link>
  </div>;
}

export function AccountSignOut({ onSignOut }: Pick<AccountHandlers, 'onSignOut'>) {
  const t = useTranslations('account');
  const action = useAccountAction();
  return <div className="space-y-3">
    <Button type="button" variant="outline" disabled={action.pending || Boolean(action.result?.ok)} aria-busy={action.pending} className="w-full sm:w-auto" onClick={() => { void action.run(onSignOut, undefined); }}>{action.pending ? <Spinner aria-hidden="true" /> : <LogOut aria-hidden="true" />}{t(action.pending ? 'signingOut' : 'signOut')}</Button>
    <FormFeedback result={action.result} successMessage={t('signedOut')} />
  </div>;
}
