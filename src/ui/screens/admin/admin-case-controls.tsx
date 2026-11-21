'use client';

import { useId, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import Link from 'next/link';
import type { ActionResult, AdminCaseActionId, AdminCaseHandlers, AdminCasePageData, SavedReplyOption } from '@/contracts';
import { routes } from '@/contracts';
import { useFormAction } from '@/ui/lib/use-form-action';
import { Button } from '@/ui/primitives/button';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/ui/primitives/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/ui/primitives/dialog';
import { Spinner } from '@/ui/primitives/spinner';
import { AdminCaseFeedback, AdminEmailContactForm, AdminNoteForm, AdminReplyForm, AdminStatusForm, type AdminReplyState } from './admin-case-forms';
import { AdminResolutionForm, type AdminResolutionState } from './admin-resolution-form';

export interface AdminCaseControlsProps {
  data: AdminCasePageData;
  handlers: AdminCaseHandlers;
  children: ReactNode;
  initialDialog?: 'resolve';
  replyState?: AdminReplyState;
  resolutionState?: AdminResolutionState;
}

/** Starts the reply from a saved reply (it replaces the draft; the names are filled in on sending). */
function SavedReplyPicker({ replies, onPick }: { replies: SavedReplyOption[]; onPick: (body: string) => void }) {
  const t = useTranslations('adminCase.savedReplies');
  const id = useId();
  return <div className="space-y-2 rounded-xl border bg-card p-4 shadow-card sm:p-5">
    <label htmlFor={`${id}-pick`} className="text-sm font-medium">{t('label')}</label>
    <select id={`${id}-pick`} value="" aria-describedby={`${id}-hint`} onChange={(event) => { const picked = replies.find((reply) => reply.id === event.target.value); if (picked) onPick(picked.body); }} className="h-11 w-full rounded-md border bg-background px-3 text-base sm:text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
      <option value="">{t('choose')}</option>
      {replies.map((reply) => <option key={reply.id} value={reply.id}>{reply.title}</option>)}
    </select>
    <p id={`${id}-hint`} className="text-sm text-muted-foreground">{t('hint', { firstName: '{first_name}', staffName: '{staff_name}' })} <Link href={routes.admin.savedReplies()} className="font-medium text-primary underline underline-offset-4">{t('manage')}</Link></p>
  </div>;
}

export function AdminCaseControls({ data, handlers, children, initialDialog, replyState, resolutionState }: AdminCaseControlsProps) {
  const t = useTranslations('adminCase');
  const id = useId();
  const router = useRouter();
  const trigger = useRef<HTMLButtonElement | null>(null);
  const [dialog, setDialog] = useState<'set_status' | 'resolve' | undefined>(initialDialog);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [lastResult, setLastResult] = useState<ActionResult>();
  const [activeAction, setActiveAction] = useState<AdminCaseActionId>();
  /** A saved reply picked to start from: a new draft (the form starts over with its text). */
  const [draft, setDraft] = useState<{ nonce: number; body: string }>();
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
      <AdminCaseFeedback result={lastResult} successMessage={lastResult?.ok && lastResult.code === 'saved' ? t('resolve.saved') : lastResult?.ok && lastResult.code === 'sent' ? t('resolve.sentForApproval') : t('updated')} />
    </div>
    {children}
    {(data.actions.includes('reply') || data.actions.includes('add_note')) && <div className="grid min-w-0 gap-5 xl:grid-cols-2">
      {data.actions.includes('reply') && <div className="min-w-0 space-y-3">
        {data.savedReplies && data.savedReplies.length > 0 && <SavedReplyPicker replies={data.savedReplies} onPick={(body) => setDraft((previous) => ({ nonce: (previous?.nonce ?? 0) + 1, body }))} />}
        {data.contact
          ? <AdminEmailContactForm key={`${data.case.id}-email-${draft?.nonce ?? 0}`} contact={data.contact} handlers={handlers} focusId={`${id}-reply`} {...replyState} {...(draft ? { initialBody: draft.body } : {})} />
          : <AdminReplyForm key={`${data.case.id}-reply-${draft?.nonce ?? 0}`} data={data} handlers={handlers} focusId={`${id}-reply`} {...replyState} {...(draft ? { initialBody: draft.body } : {})} />}
      </div>}
      {data.actions.includes('add_note') && <AdminNoteForm key={`${data.case.id}-note`} handlers={handlers} focusId={`${id}-add_note`} />}
    </div>}
    <Dialog open={dialogAllowed && dialog === 'set_status'} onOpenChange={(open) => { if (!open && !dialogBusy) setDialog(undefined); }}>
      <DialogContent showCloseButton={!dialogBusy} onEscapeKeyDown={(event) => { if (dialogBusy) event.preventDefault(); }} onInteractOutside={(event) => { if (dialogBusy) event.preventDefault(); }} onCloseAutoFocus={(event) => { event.preventDefault(); trigger.current?.focus(); }} className="max-h-[90dvh] overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))] max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none">
        <DialogHeader><DialogTitle>{t('status.title')}</DialogTitle><DialogDescription>{t('status.description')}</DialogDescription></DialogHeader>
        <AdminStatusForm data={data} handlers={handlers} onSuccess={dialogSuccess} onBusy={setDialogBusy} onCancel={() => setDialog(undefined)} />
      </DialogContent>
    </Dialog>
    <AlertDialog open={dialogAllowed && dialog === 'resolve'} onOpenChange={(open) => { if (!open && !dialogBusy) setDialog(undefined); }}>
      <AlertDialogContent onEscapeKeyDown={(event) => { if (dialogBusy) event.preventDefault(); }} onCloseAutoFocus={(event) => { event.preventDefault(); trigger.current?.focus(); }} className="max-h-[90dvh] overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))] max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none">
        <AlertDialogHeader><AlertDialogTitle>{t('resolve.title')}</AlertDialogTitle><AlertDialogDescription>{t(data.contact ? 'resolve.contactDescription' : 'resolve.description')}</AlertDialogDescription></AlertDialogHeader>
        <AdminResolutionForm data={data} handlers={handlers} onSuccess={dialogSuccess} onBusy={setDialogBusy} onCancel={() => setDialog(undefined)} {...resolutionState} />
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
