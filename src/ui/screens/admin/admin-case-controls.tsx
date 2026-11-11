'use client';

import { useId, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import type { ActionResult, AdminCaseActionId, AdminCaseHandlers, AdminCasePageData } from '@/contracts';
import { useFormAction } from '@/ui/lib/use-form-action';
import { Button } from '@/ui/primitives/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/ui/primitives/dialog';
import { Spinner } from '@/ui/primitives/spinner';
import { AdminCaseFeedback, AdminNoteForm, AdminReplyForm, AdminResolutionForm, AdminStatusForm, type AdminReplyState } from './admin-case-forms';

export interface AdminCaseControlsProps {
  data: AdminCasePageData;
  handlers: AdminCaseHandlers;
  children: ReactNode;
  initialDialog?: 'resolve';
  replyState?: AdminReplyState;
}

export function AdminCaseControls({ data, handlers, children, initialDialog, replyState }: AdminCaseControlsProps) {
  const t = useTranslations('adminCase');
  const id = useId();
  const router = useRouter();
  const trigger = useRef<HTMLButtonElement | null>(null);
  const [dialog, setDialog] = useState<'set_status' | 'resolve' | undefined>(initialDialog);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [lastResult, setLastResult] = useState<ActionResult>();
  const [activeAction, setActiveAction] = useState<AdminCaseActionId>();
  const emptyForm = useForm();
  const action = useFormAction(emptyForm, { onResult: (result) => { setLastResult(result); if (result.ok) router.refresh(); } });

  function activate(actionId: AdminCaseActionId, button: HTMLButtonElement) {
    if (action.pending || dialogBusy) return;
    setLastResult(undefined);
    setActiveAction(actionId);
    if (actionId === 'reply' || actionId === 'add_note') {
      document.getElementById(`${id}-${actionId}`)?.focus();
    } else if (actionId === 'set_status' || actionId === 'resolve') {
      trigger.current = button;
      setDialog(actionId);
    } else if (actionId === 'assign_to_me' || actionId === 'unassign') {
      void action.run(handlers.onAssign, { assign: actionId === 'assign_to_me' });
    } else {
      void action.run(actionId === 'close' ? handlers.onClose : handlers.onReopen, undefined);
    }
  }

  function dialogSuccess(result: ActionResult) { setLastResult(result); setDialog(undefined); }
  const dialogAllowed = dialog !== undefined && data.actions.includes(dialog);
  return <div className="space-y-6">
    <div className="space-y-3">
      {data.actions.length > 0 && <div role="group" aria-label={t('actionsLabel')} className="flex flex-wrap gap-2">
        {data.actions.map((actionId) => <Button key={actionId} type="button" variant={actionId === 'resolve' ? 'default' : 'outline'} disabled={action.pending || dialogBusy} aria-busy={action.pending && activeAction === actionId} onClick={(event) => activate(actionId, event.currentTarget)}>
          {action.pending && activeAction === actionId && <Spinner aria-hidden="true" />}{t(`actions.${actionId}`)}
        </Button>)}
      </div>}
      <AdminCaseFeedback result={lastResult} successMessage={lastResult?.ok && lastResult.code === 'saved' ? t('resolve.saved') : t('updated')} />
    </div>
    {children}
    {(data.actions.includes('reply') || data.actions.includes('add_note')) && <div className="grid min-w-0 gap-5 xl:grid-cols-2">
      {data.actions.includes('reply') && <AdminReplyForm key={`${data.case.id}-reply`} data={data} handlers={handlers} focusId={`${id}-reply`} {...replyState} />}
      {data.actions.includes('add_note') && <AdminNoteForm key={`${data.case.id}-note`} handlers={handlers} focusId={`${id}-add_note`} />}
    </div>}
    <Dialog open={dialogAllowed} onOpenChange={(open) => { if (!open && !dialogBusy) setDialog(undefined); }}>
      <DialogContent showCloseButton={!dialogBusy} onEscapeKeyDown={(event) => { if (dialogBusy) event.preventDefault(); }} onInteractOutside={(event) => { if (dialogBusy) event.preventDefault(); }} onCloseAutoFocus={(event) => { event.preventDefault(); trigger.current?.focus(); }} className="max-h-[90dvh] overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))] max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none">
        <DialogHeader><DialogTitle>{t(dialog === 'resolve' ? 'resolve.title' : 'status.title')}</DialogTitle><DialogDescription>{t(dialog === 'resolve' ? 'resolve.description' : 'status.description')}</DialogDescription></DialogHeader>
        {dialog === 'resolve' ? <AdminResolutionForm data={data} handlers={handlers} onSuccess={dialogSuccess} onBusy={setDialogBusy} onCancel={() => setDialog(undefined)} /> : <AdminStatusForm data={data} handlers={handlers} onSuccess={dialogSuccess} onBusy={setDialogBusy} onCancel={() => setDialog(undefined)} />}
      </DialogContent>
    </Dialog>
  </div>;
}
