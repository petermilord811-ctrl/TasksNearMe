'use client';

import { useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { LockKeyhole } from 'lucide-react';
import { routes, type ActionResult, type AdminBookingActionId, type AdminBookingHandlers, type AdminBookingPageData, type AdminConversationView, type ExactAddress, type ISODateTime, type RestrictedAccessInput } from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { ExactAddressPanel } from '@/ui/components/location/exact-address-panel';
import { Button } from '@/ui/primitives/button';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/ui/primitives/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/ui/primitives/dialog';
import { AdminBookingRefundForm, type AdminRefundState } from './admin-booking-refund-form';
import { AdminConversationReader, AdminReasonForm, type AdminReasonState } from './admin-conversation-gate';

export interface AdminBookingPreviewState {
  initialDialog?: AdminBookingActionId;
  /** Previews: a refund request decision that starts open. */
  initialDecision?: { requestId: string; decision: 'approve' | 'decline' };
  initialAddress?: ExactAddress;
  initialConversation?: AdminConversationView;
  refundState?: AdminRefundState;
  reasonState?: AdminReasonState;
}

export function AdminBookingTools({ data, handlers, now, children, initialDialog, initialAddress, initialConversation, refundState, reasonState }: {
  data: AdminBookingPageData; handlers: AdminBookingHandlers; now: ISODateTime; children: ReactNode;
} & AdminBookingPreviewState) {
  const t = useTranslations('adminBooking');
  const [dialog, setDialog] = useState<AdminBookingActionId | undefined>(initialDialog);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult>();
  const [address, setAddress] = useState(initialAddress);
  const [conversation, setConversation] = useState(initialConversation);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const addressReader = useRef<HTMLDivElement>(null);
  const conversationReader = useRef<HTMLElement>(null);
  const revealedReader = useRef<'address' | 'conversation' | undefined>(undefined);
  const allowed = dialog !== undefined && data.actions.includes(dialog);
  const pending = busy || (dialog === 'refund' ? refundState?.initialPending : reasonState?.initialPending);

  async function reveal(input: RestrictedAccessInput): Promise<ActionResult> {
    if (dialog === 'reveal_address') {
      const next = await handlers.onRevealAddress(input);
      if (!next.ok) return next;
      setAddress(next.address); revealedReader.current = 'address';
    } else {
      const next = await handlers.onRevealConversation(input);
      if (!next.ok) return next;
      setConversation(next.conversation); revealedReader.current = 'conversation';
    }
    setDialog(undefined);
    return { ok: true, code: 'updated' };
  }

  // The evidence pack is a download with its own section on the page, not a dialog.
  const dialogActions = data.actions.filter((actionId) => actionId !== 'download_evidence_pack');
  return <div className="space-y-6">
    <div className="space-y-3">
      {dialogActions.length > 0 ? <div role="group" aria-label={t('actionsLabel')} className="flex flex-wrap gap-2">
        {dialogActions.map((actionId) => <Button key={actionId} variant={actionId === 'refund' ? 'default' : 'outline'} disabled={Boolean(pending)} className="h-auto min-h-11 whitespace-normal" onClick={(event) => { trigger.current = event.currentTarget; revealedReader.current = undefined; setResult(undefined); setDialog(actionId); }}>
          {actionId !== 'refund' && <LockKeyhole aria-hidden="true" className="size-4 shrink-0" />}{t(`actions.${actionId}`)}
        </Button>)}
      </div> : <p className="text-sm text-muted-foreground">{t('readOnly')}</p>}
      <FormFeedback result={result} successMessage={result?.ok && result.code === 'sent' ? t('refund.sent') : t('refund.submitted')} />
    </div>
    {children}
    {(data.actions.includes('reveal_address') || data.actions.includes('reveal_conversation')) && <section className="space-y-3 rounded-2xl border border-foreground/[0.07] bg-card p-4 shadow-card sm:p-5 dark:border-white/[0.07]">
      <h2 className="flex items-center gap-2 text-xl font-semibold"><LockKeyhole aria-hidden="true" className="size-5 text-primary" />{t('restricted')}</h2>
      <p className="max-w-2xl text-sm text-muted-foreground">{t('restrictedHint')}</p>
    </section>}
    {address && <div ref={addressReader} tabIndex={-1} className="space-y-3 rounded-lg outline-offset-4">
      <p role="status" className="text-sm font-medium text-success">{t('accessLogged')}</p>
      <ExactAddressPanel address={address} mapsHref={routes.external.googleMapsSearch(address)} />
    </div>}
    {conversation && <section ref={conversationReader} tabIndex={-1} className="space-y-4 rounded-2xl border border-foreground/[0.07] bg-card p-4 shadow-card outline-offset-4 sm:p-5 dark:border-white/[0.07]">
      <h2 className="text-xl font-semibold">{t('conversation')}</h2><AdminConversationReader conversation={conversation} now={now} />
    </section>}
    <AlertDialog open={allowed && dialog === 'refund'} onOpenChange={(open) => { if (!open && !pending) setDialog(undefined); }}>
      <AlertDialogContent className="max-h-[90dvh] overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))] max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none" onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }} onCloseAutoFocus={(event) => { event.preventDefault(); trigger.current?.focus(); }}>
        <AlertDialogHeader><AlertDialogTitle>{t('refund.title')}</AlertDialogTitle><AlertDialogDescription>{t('refund.description')}</AlertDialogDescription></AlertDialogHeader>
        {data.refund ? <AdminBookingRefundForm refund={data.refund} onRefund={handlers.onRefund} onCancel={() => setDialog(undefined)} onBusy={setBusy} onSuccess={(next) => { setResult(next); setDialog(undefined); }} {...refundState} /> : <><p role="status">{t('refund.unavailable')}</p><AlertDialogCancel onClick={() => setDialog(undefined)}>{t('refund.cancel')}</AlertDialogCancel></>}
      </AlertDialogContent>
    </AlertDialog>
    <Dialog open={allowed && dialog !== 'refund'} onOpenChange={(open) => { if (!open && !pending) setDialog(undefined); }}>
      <DialogContent showCloseButton={!pending} className="max-h-[90dvh] overflow-y-auto max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none" onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }} onInteractOutside={(event) => { if (pending) event.preventDefault(); }} onCloseAutoFocus={(event) => {
        event.preventDefault();
        if (revealedReader.current === 'address') addressReader.current?.focus();
        else if (revealedReader.current === 'conversation') conversationReader.current?.focus();
        else trigger.current?.focus();
      }}>
        <DialogHeader><DialogTitle>{t(`actions.${dialog === 'reveal_address' ? 'reveal_address' : 'reveal_conversation'}`)}</DialogTitle><DialogDescription>{t('loggedHint')}</DialogDescription></DialogHeader>
        <AdminReasonForm title={t(`actions.${dialog === 'reveal_address' ? 'reveal_address' : 'reveal_conversation'}`)} hint={t('reasonHint')} onSubmit={reveal} onCancel={() => setDialog(undefined)} onBusy={setBusy} {...reasonState} />
      </DialogContent>
    </Dialog>
  </div>;
}
