'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CreditCard } from 'lucide-react';
import type { ActionResult, PaymentMethodHandlers, PaymentsPageData, SavedPaymentMethod } from '@/contracts';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { PaymentMethodLabel } from '@/ui/components/payments';
import { Badge } from '@/ui/primitives/badge';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/ui/primitives/alert-dialog';
import { AddCardForm } from './add-card-form';

export interface PaymentCardsPreviewState {
  addResult?: ActionResult;
  adding?: boolean;
  removeMethodId?: string;
  removeResult?: ActionResult;
}

function SavedCard({ method, handlers, onRemoved, onRemovalFocus, initialOpen = false, initialResult }: {
  method: SavedPaymentMethod;
  handlers: PaymentMethodHandlers;
  onRemoved: (result: Extract<ActionResult, { ok: true }>) => void;
  onRemovalFocus: () => void;
  initialOpen?: boolean;
  initialResult?: ActionResult;
}) {
  const t = useTranslations('paymentsPage');
  const payments = useTranslations('payments');
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(initialOpen);
  const [result, setResult] = useState(initialResult);
  const [operation, setOperation] = useState<'remove' | 'default'>('remove');
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  const removed = useRef(false);
  const item = useRef<HTMLLIElement>(null);

  async function run(nextOperation: 'remove' | 'default') {
    if (locked.current) return;
    locked.current = true;
    setPending(true); setResult(undefined); setOperation(nextOperation);
    let next: ActionResult;
    try { next = await (nextOperation === 'remove' ? handlers.onRemoveCard : handlers.onMakeDefault)({ methodId: method.id }); }
    catch { next = { ok: false, code: 'unknown' }; }
    setPending(false); locked.current = false;
    if (next.ok && nextOperation === 'remove') {
      removed.current = true;
      setResult(undefined);
      onRemoved(next);
    } else setResult(next);
    // The default card has no "Make default": the button goes away, so focus moves to the card (now marked Default).
    if (next.ok && nextOperation === 'default') item.current?.focus();
    if (next.ok) {
      setOpen(false);
      if (next.redirectTo) router.push(next.redirectTo);
      router.refresh();
    }
  }

  const feedback = <FormFeedback result={result && !result.ok ? { ...result, fieldErrors: undefined } : result} successMessage={t(operation === 'remove' ? 'removed' : 'defaultUpdated')} errorMessage={result && !result.ok && result.code === 'not_allowed' && operation === 'remove' ? t('removeNotAllowed') : undefined} />;
  return <li ref={item} tabIndex={-1} aria-labelledby={`${id}-label`} className="space-y-3 rounded-xl py-4 outline-offset-4 first:pt-0 last:pb-0 focus-visible:outline-2 focus-visible:outline-ring">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground"><CreditCard className="size-5" /></span>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2"><p id={`${id}-label`} className="font-medium"><PaymentMethodLabel method={method} /></p>{method.isDefault && <Badge variant="secondary">{payments('picker.default')}</Badge>}</div>
          <p className="text-sm tabular-nums text-muted-foreground">{payments('picker.expires', { month: String(method.expMonth).padStart(2, '0'), year: String(method.expYear).slice(-2) })}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 pl-13 sm:pl-0">
        {!method.isDefault && <Button type="button" variant="outline" disabled={pending} aria-describedby={`${id}-label`} aria-busy={pending && operation === 'default'} onClick={() => void run('default')}>{pending && operation === 'default' && <Spinner aria-hidden="true" />}{t(pending && operation === 'default' ? 'makingDefault' : 'makeDefault')}</Button>}
        <AlertDialog open={open} onOpenChange={(value) => { if (!pending) setOpen(value); }}>
          <AlertDialogTrigger asChild><Button type="button" variant="ghost" disabled={pending} aria-describedby={`${id}-label`} onClick={() => setResult(undefined)}>{t('remove')}</Button></AlertDialogTrigger>
          <AlertDialogContent onCloseAutoFocus={(event) => {
            if (removed.current) {
              event.preventDefault();
              onRemovalFocus();
            }
          }}>
            <AlertDialogHeader><AlertDialogTitle>{t('removeTitle')}</AlertDialogTitle><AlertDialogDescription>{t('removeDescription')}</AlertDialogDescription></AlertDialogHeader>
            <p className="font-medium"><PaymentMethodLabel method={method} /></p>
            {open && feedback}
            <AlertDialogFooter><AlertDialogCancel disabled={pending}>{t('keepCard')}</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={pending} aria-busy={pending} onClick={(event) => { event.preventDefault(); void run('remove'); }}>{pending && <Spinner aria-hidden="true" />}{t(pending ? 'removing' : 'confirmRemove')}</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
    {!open && feedback}
  </li>;
}

export function PaymentCards({ methods, newCard, handlers, preview }: Pick<PaymentsPageData, 'methods' | 'newCard'> & { handlers: PaymentMethodHandlers; preview?: PaymentCardsPreviewState }) {
  const t = useTranslations('paymentsPage');
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  // This confirmation survives when refreshed data removes the saved-card row.
  const [removalResult, setRemovalResult] = useState<ActionResult>();
  return <section aria-labelledby={`${id}-cards`} className="space-y-4">
    <div><h2 ref={heading} tabIndex={-1} id={`${id}-cards`} className="font-display text-xl font-semibold tracking-[-0.015em] lg:text-[22px]">{t('cards')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('cardsHint')}</p></div>
    <FormFeedback result={removalResult} successMessage={t('removed')} />
    <div className="space-y-6 rounded-[1.375rem] border border-foreground/[0.07] bg-card shadow-card dark:border-white/[0.06] p-4 sm:p-6">
      {methods.length ? <ul className="divide-y divide-foreground/[0.07] dark:divide-white/[0.06]">{methods.map((method) => <SavedCard key={method.id} method={method} handlers={handlers} onRemoved={setRemovalResult} onRemovalFocus={() => heading.current?.focus()} initialOpen={preview?.removeMethodId === method.id} initialResult={preview?.removeMethodId === method.id ? preview.removeResult : undefined} />)}</ul> : <p className="text-sm text-muted-foreground">{t('noCards')}</p>}
      <div className="space-y-4 border-t border-foreground/[0.07] pt-6 dark:border-white/[0.06]"><h3 className="font-display text-lg font-semibold tracking-[-0.01em]">{t('addTitle')}</h3><AddCardForm collection={newCard} onAddCard={handlers.onAddCard} initialResult={preview?.addResult} initialPending={preview?.adding} /></div>
    </div>
  </section>;
}
