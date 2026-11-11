'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import type { PaymentVerification } from '@/contracts';
import { Button } from '@/ui/primitives/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/ui/primitives/dialog';
import { Spinner } from '@/ui/primitives/spinner';

export function BankVerificationDialog({ verification, onDone, pending }: {
  verification: PaymentVerification;
  onDone: (outcome: 'approved' | 'failed') => void;
  pending: boolean;
}) {
  const t = useTranslations('payments.verification');
  const opener = useRef<HTMLElement | null>(null);
  return <Dialog open>
    <DialogContent
      showCloseButton={false}
      aria-busy={pending}
      data-verification-kind={verification.kind}
      onOpenAutoFocus={() => { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        const active = document.activeElement;
        // The checkout may already have moved focus to its payment error or result.
        const dialog = event.target;
        if (active && active !== document.body && active !== document.documentElement && !(dialog instanceof Node && dialog.contains(active))) return;
        const target = opener.current;
        if (target?.isConnected && !target.matches(':disabled, [aria-disabled="true"]')) target.focus();
      }}
      onEscapeKeyDown={(event) => { event.preventDefault(); if (!pending) onDone('failed'); }}
      onInteractOutside={(event) => event.preventDefault()}
    >
      <DialogHeader className="pr-0 text-left">
        <DialogTitle className="leading-7">{t('title')}</DialogTitle>
        <DialogDescription className="leading-6">{t('description')}</DialogDescription>
      </DialogHeader>
      <p aria-live="polite" className="flex min-h-6 items-center gap-2 text-sm text-muted-foreground">{pending && <><Spinner aria-hidden="true" />{t('pending')}</>}</p>
      <DialogFooter className="flex-col sm:flex-row">
        <Button type="button" disabled={pending} aria-busy={pending} onClick={() => onDone('approved')}>{t('approve')}</Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => onDone('failed')}>{t('fail')}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
