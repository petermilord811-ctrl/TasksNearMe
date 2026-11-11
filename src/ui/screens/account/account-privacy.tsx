'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Download, LogOut, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routes, type AccountHandlers, type AccountPageData } from '@/contracts';
import { formatDate } from '@/shared/format';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/ui/primitives/alert-dialog';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';
import { useAccountAction } from './use-account-action';

export function AccountPrivacy({ privacy, handlers }: {
  privacy: AccountPageData['privacy'];
  handlers: Pick<AccountHandlers, 'onRequestExport' | 'onRequestDeletion'>;
}) {
  const t = useTranslations('account');
  const exportAction = useAccountAction({ refresh: true });
  const deletionAction = useAccountAction({ refresh: true });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const privacyRegion = useRef<HTMLDivElement>(null);
  const deletionSucceeded = useRef(false);
  const exportRequested = Boolean(privacy.exportRequestedAt || exportAction.result?.ok);
  const deletionRequested = Boolean(privacy.deletionRequestedAt || deletionAction.result?.ok);
  const deletionError = deletionAction.result && !deletionAction.result.ok && deletionAction.result.code === 'not_allowed' ? t('privacy.deletionBlocked') : undefined;

  return <div ref={privacyRegion} role="group" aria-label={t('privacy.title')} tabIndex={-1} className="space-y-6 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t('privacy.exportDescription')}</p>
      {privacy.exportRequestedAt ? <p className="text-sm tabular-nums">{t('privacy.exportRequested', { date: formatDate(privacy.exportRequestedAt) })}</p> : <>
        <Button type="button" variant="outline" disabled={exportRequested || exportAction.pending} aria-busy={exportAction.pending} className="h-auto min-h-11 w-full whitespace-normal sm:w-auto" onClick={() => { void exportAction.run(handlers.onRequestExport, undefined); }}>{exportAction.pending ? <Spinner aria-hidden="true" /> : <Download aria-hidden="true" />}{t(exportAction.pending ? 'privacy.requestingExport' : 'privacy.requestExport')}</Button>
        <FormFeedback result={exportAction.result} successMessage={t('privacy.exportSubmitted')} />
      </>}
    </div>
    <div className="space-y-3 border-t pt-6">
      <p className="text-sm text-muted-foreground">{t('privacy.deletionDescription')}</p>
      {privacy.deletionRequestedAt ? <p className="text-sm tabular-nums">{t('privacy.deletionRequested', { date: formatDate(privacy.deletionRequestedAt) })}</p> : <>
        <AlertDialog open={confirmOpen} onOpenChange={(open) => { if (!deletionAction.pending) setConfirmOpen(open); }}>
          <AlertDialogTrigger asChild><Button type="button" variant="outline" disabled={deletionRequested} className="h-auto min-h-11 w-full whitespace-normal text-destructive hover:text-destructive sm:w-auto"><Trash2 aria-hidden="true" />{t('privacy.delete')}</Button></AlertDialogTrigger>
          <AlertDialogContent aria-busy={deletionAction.pending} onCloseAutoFocus={(event) => {
            if (deletionSucceeded.current) {
              event.preventDefault();
              privacyRegion.current?.focus();
            }
          }}>
            <AlertDialogHeader><AlertDialogTitle>{t('privacy.confirmTitle')}</AlertDialogTitle><AlertDialogDescription>{t('privacy.confirmDescription')}</AlertDialogDescription></AlertDialogHeader>
            <FormFeedback result={deletionAction.result} successMessage={t('privacy.deletionSubmitted')} errorMessage={deletionError} />
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
        {!confirmOpen && <FormFeedback result={deletionAction.result} successMessage={t('privacy.deletionSubmitted')} errorMessage={deletionError} />}
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
