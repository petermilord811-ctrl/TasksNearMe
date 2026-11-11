'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Ban, Flag, MoreHorizontal, ShieldCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import type { ReportHandlers, ReportSubject } from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { useFormAction } from '@/ui/lib/use-form-action';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/ui/primitives/alert-dialog';
import { Button } from '@/ui/primitives/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/primitives/dropdown-menu';
import { Spinner } from '@/ui/primitives/spinner';
import { ReportDialog } from './report-dialog';

export interface ReportBlockMenuProps {
  subject: ReportSubject;
  handlers: ReportHandlers;
}

export function ReportBlockMenu({ subject, handlers }: ReportBlockMenuProps) {
  const t = useTranslations('safety');
  const router = useRouter();
  const trigger = useRef<HTMLButtonElement>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockedResult, setBlockedResult] = useState(subject.blocked);
  const form = useForm<{ blocked: boolean }>({ defaultValues: { blocked: subject.blocked } });
  const action = useFormAction(form, { onResult: (result) => {
    if (result.ok && result.code === 'updated') { setBlockOpen(false); router.refresh(); }
  } });

  async function updateBlocked(blocked: boolean) {
    const result = await action.run(handlers.onBlock, { blocked });
    if (result?.ok && result.code === 'updated') setBlockedResult(blocked);
  }

  return <div className="contents">
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button ref={trigger} variant="ghost" size="icon" aria-label={t('menu', { name: subject.displayName })} disabled={action.pending} aria-busy={action.pending}>{action.pending ? <Spinner aria-hidden="true" /> : <MoreHorizontal aria-hidden="true" />}</Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" onCloseAutoFocus={(event) => { if (reportOpen || blockOpen) event.preventDefault(); }}>
        <DropdownMenuItem onSelect={() => setReportOpen(true)}><Flag aria-hidden="true" />{t('report')}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => subject.blocked ? void updateBlocked(false) : setBlockOpen(true)}>{subject.blocked ? <ShieldCheck aria-hidden="true" /> : <Ban aria-hidden="true" />}{t(subject.blocked ? 'unblock' : 'block')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    {!blockOpen && action.result && <div className="order-last basis-full"><FormFeedback result={action.result} successMessage={t(blockedResult ? 'blocked' : 'unblocked', { name: subject.displayName })} /></div>}
    <ReportDialog subject={subject} onReport={handlers.onReport} open={reportOpen} onOpenChange={setReportOpen} returnFocusRef={trigger} />
    <AlertDialog open={blockOpen} onOpenChange={(open) => { if (!action.pending) setBlockOpen(open); }}>
      <AlertDialogContent onCloseAutoFocus={(event) => { event.preventDefault(); trigger.current?.focus(); }}>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('blockTitle', { name: subject.displayName })}</AlertDialogTitle>
          <AlertDialogDescription>{t('blockDescription')}</AlertDialogDescription>
        </AlertDialogHeader>
        <FormFeedback result={action.result?.ok ? undefined : action.result} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={action.pending}>{t('cancel')}</AlertDialogCancel>
          <Button variant="destructive" disabled={action.pending} aria-busy={action.pending} onClick={() => void updateBlocked(true)}>{action.pending && <Spinner aria-hidden="true" />}{t(action.pending ? 'blocking' : 'block')}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
