'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Zap } from 'lucide-react';
import type { ActionResult, EarningsHandlers, InstantPayoutOffer } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { FormFeedback } from '@/ui/components/forms/form-feedback';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/ui/primitives/alert-dialog';
import { Button } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';

/** "Cash out now": what can go to the helper's debit card in minutes, the fee, and a confirmation first. */
export function InstantPayoutCard({ offer, onInstantPayout }: { offer: InstantPayoutOffer; onInstantPayout: NonNullable<EarningsHandlers['onInstantPayout']> }) {
  const t = useTranslations('earnings.instant');
  const router = useRouter();
  const locked = useRef(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ActionResult>();
  const amounts = { amount: formatMoney(offer.availableCents), fee: formatMoney(offer.feeCents), net: formatMoney(offer.netCents) };

  async function cashOut() {
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    setResult(undefined);
    let next: ActionResult;
    try {
      next = await onInstantPayout();
    } catch {
      next = { ok: false, code: 'unknown' };
    }
    locked.current = false;
    setPending(false);
    setResult(next);
    if (next.ok) router.refresh();
  }

  return <section aria-labelledby="earnings-instant" className="space-y-3 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 shadow-card dark:border-white/[0.06] md:p-6">
    <h2 id="earnings-instant" className="flex items-center gap-2 font-display text-xl/7 font-semibold tracking-[-0.015em] md:text-[22px]/7.5"><Zap aria-hidden="true" className="size-5 text-primary" />{t('title')}</h2>
    <p>{t('body', amounts)}</p>
    <p className="text-sm text-muted-foreground tabular-nums">{t('fee', amounts)}</p>
    <AlertDialog>
      <AlertDialogTrigger asChild><Button type="button" disabled={pending} aria-busy={pending} className="w-full sm:w-auto">{pending && <Spinner aria-hidden="true" />}{t('action', amounts)}</Button></AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>{t('confirmTitle', amounts)}</AlertDialogTitle><AlertDialogDescription>{t('confirmBody', amounts)}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>{t('cancel')}</AlertDialogCancel><AlertDialogAction onClick={() => void cashOut()}>{t('confirm')}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <FormFeedback result={result} successMessage={t('sent')} />
  </section>;
}
