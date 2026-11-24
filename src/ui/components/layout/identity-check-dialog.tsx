'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ExternalLink, IdCard, RotateCcw } from 'lucide-react';
import type { PosterIdReason } from '@/contracts';
import { buttonVariants } from '@/ui/primitives/button';
import { Spinner } from '@/ui/primitives/spinner';
import { RouteDialogBody, RouteDialogHeader } from './route-dialog';

export interface IdentityCheckDialogProps {
  /** What asks for the check (the risk rules' reason). */
  reason: PosterIdReason;
  /** The ID check's page, coming back to the dialog's own address once it's done (`routes.app.verifyIdentity(next)`). */
  verifyHref: string;
}

/**
 * An ID check a dialog needs first, said in the dialog (2026-11-23, owner: "I hate redirect … some buttons need new window
 * instead of direct"): why, then the check in a new tab (its partner's pages come back there), and "I've finished" to look
 * again here. Before, the dialog sent the whole page to the ID check; the request or booking waits here now.
 */
export function IdentityCheckDialog({ reason, verifyHref }: IdentityCheckDialogProps) {
  const t = useTranslations('peek.idCheck');
  const identity = useTranslations('posterIdentity');
  const router = useRouter();
  const [checking, startChecking] = useTransition();
  const [asked, setAsked] = useState(false);
  return <>
    <RouteDialogHeader title={t('title')} description={identity(`reasons.${reason}`)} />
    <RouteDialogBody>
      <div className="space-y-4">
        <p className="flex items-start gap-3 rounded-2xl bg-secondary/70 px-4 py-3 text-sm leading-6 text-secondary-foreground"><IdCard aria-hidden="true" className="mt-0.5 size-5 shrink-0" /><span>{identity('explanation')} {t('body')}</span></p>
        <p className="text-sm text-muted-foreground">{identity('privacy')}</p>
        <div className="flex flex-wrap gap-2">
          <a href={verifyHref} target="_blank" rel="noopener" className={buttonVariants({ className: 'min-h-11 rounded-full' })}><ExternalLink aria-hidden="true" />{t('start')}</a>
          <button type="button" disabled={checking} aria-busy={checking} onClick={() => {
            setAsked(true);
            // The dialog's page looks again: verified, it shows the request; not yet, this says so.
            startChecking(() => router.refresh());
          }} className={buttonVariants({ variant: 'outline', className: 'min-h-11 rounded-full' })}>
            {checking ? <Spinner aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}{checking ? t('checking') : t('done')}
          </button>
        </div>
        {asked && !checking && <p role="status" className="text-sm text-muted-foreground">{t('stillNeeded')}</p>}
      </div>
    </RouteDialogBody>
  </>;
}
