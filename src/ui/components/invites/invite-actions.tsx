'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { needsBankVerification, type ActionResult, type InviteActionId, type InviteHandlers, type InviteView, type PaymentAttemptResult, type PaymentVerification } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { BankVerificationDialog } from '@/ui/components/payments';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/ui/primitives/alert-dialog';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';
import { CounterInviteForm } from './counter-invite-form';

type ConfirmAction = Exclude<InviteActionId, 'counter_invite'>;

export function InviteActions({ invite, handlers, headingLevel, initialCounterOpen = false, initialResult, initialPending = false }: {
  invite: InviteView;
  handlers: InviteHandlers;
  headingLevel: 3 | 4;
  initialCounterOpen?: boolean;
  initialResult?: PaymentAttemptResult;
  initialPending?: boolean;
}) {
  const t = useTranslations('inviteCard');
  const router = useRouter();
  const locked = useRef(initialPending);
  const opener = useRef<HTMLButtonElement | null>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState(initialPending);
  const [active, setActive] = useState<InviteActionId | undefined>(initialPending ? invite.actions[0] : undefined);
  const [result, setResult] = useState<ActionResult | undefined>(initialResult && !needsBankVerification(initialResult) ? initialResult : undefined);
  const [verification, setVerification] = useState<PaymentVerification | undefined>(initialResult && needsBankVerification(initialResult) ? initialResult.verification : undefined);
  const [confirm, setConfirm] = useState<ConfirmAction>();
  const [counterOpen, setCounterOpen] = useState(initialCounterOpen);
  const disabled = pending || Boolean(verification) || Boolean(result?.ok);

  useEffect(() => {
    if (!result || pending || (!result.ok && result.fieldErrors && Object.keys(result.fieldErrors).length > 0 && counterOpen)) return;
    const timer = setTimeout(() => feedbackRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [result, pending, counterOpen]);

  async function run(action: () => Promise<PaymentAttemptResult>) {
    if (locked.current) return;
    locked.current = true;
    setPending(true); setResult(undefined); setConfirm(undefined);
    let next: PaymentAttemptResult;
    try { next = await action(); } catch { next = { ok: false, code: 'unknown' }; }
    locked.current = false; setPending(false);
    if (needsBankVerification(next)) { setVerification(next.verification); return; }
    setVerification(undefined); setResult(next);
    if (next.ok) {
      locked.current = true; setCounterOpen(false);
      if (next.redirectTo) router.push(next.redirectTo);
      else router.refresh();
    }
  }

  function submit(action: ConfirmAction) {
    setActive(action);
    const input = { inviteId: invite.id };
    const handler = { accept_invite: handlers.onAccept, decline_invite: handlers.onDecline, cancel_invite: handlers.onCancel, accept_counter: handlers.onAcceptCounter, decline_counter: handlers.onDeclineCounter }[action];
    void run(() => handler(input));
  }

  function confirmation(action: ConfirmAction) {
    return t(`confirm.${action}`, {
      name: action === 'accept_invite' ? invite.client.displayName : invite.helper.displayName,
      amount: formatMoney(action === 'accept_invite' ? invite.breakdown.helperEarningsCents : (invite.counter?.breakdown ?? invite.breakdown).posterTotalCents),
    });
  }

  return <>
    <div ref={feedbackRef} tabIndex={-1} className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><FormFeedback result={result && !result.ok ? { ...result, fieldErrors: undefined } : result} /></div>
    {invite.actions.length > 0 && <div role="group" aria-label={t('actionsLabel')} className="flex flex-wrap gap-3">
      {invite.actions.map((action) => <Button key={action} type="button" variant={action === 'accept_invite' || action === 'accept_counter' ? 'default' : 'outline'} disabled={disabled} aria-busy={pending && active === action} onClick={(event) => {
        opener.current = event.currentTarget;
        if (action === 'counter_invite') { setActive(action); setCounterOpen(true); setResult(undefined); }
        else setConfirm(action);
      }}>{pending && active === action && <Spinner aria-hidden="true" />}{t(`actions.${action}`)}</Button>)}
    </div>}
    {counterOpen && invite.actions.includes('counter_invite') && <CounterInviteForm invite={invite} headingLevel={headingLevel} pending={pending} result={result} onSubmit={async (counter) => { setActive('counter_invite'); await run(() => handlers.onCounter({ inviteId: invite.id, counter })); }} onClose={() => { setCounterOpen(false); opener.current?.focus(); }} />}
    <AlertDialog open={Boolean(confirm)} onOpenChange={(open) => { if (!open) setConfirm(undefined); }}>
      <AlertDialogContent onCloseAutoFocus={(event) => { event.preventDefault(); if (opener.current?.isConnected && !opener.current.disabled) opener.current.focus(); }}>
        <AlertDialogHeader><AlertDialogTitle>{confirm ? t(`actions.${confirm}`) : t('actionsLabel')}</AlertDialogTitle><AlertDialogDescription>{confirm ? confirmation(confirm) : ''}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>{t('back')}</AlertDialogCancel><Button type="button" disabled={disabled} onClick={() => { if (confirm) submit(confirm); }}>{confirm ? t(`actions.${confirm}`) : t('actionsLabel')}</Button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    {verification && <BankVerificationDialog verification={verification} pending={pending} onDone={(outcome) => { void run(() => handlers.onFinishVerification({ inviteId: invite.id, paymentId: verification.paymentId, outcome })); }} />}
  </>;
}
