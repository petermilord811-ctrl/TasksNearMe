'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type { PhoneVerifyHandlers } from '@/contracts';
import { routes } from '@/contracts/routes';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { PhoneVerifyDialog } from '@/ui/screens/account/account-contact';

const linkClass = 'font-semibold text-primary underline underline-offset-4';

/**
 * "Verify your phone" where Neighbors waits for it (posting, replying): the account page's phone steps in a dialog over
 * the page (2026-11-23, owner: "I hate to redirect to new pages continually … if possible, use dialog"), so the post or
 * reply being written stays. Once the code is right, the page underneath refreshes and can post. Without the handlers
 * (a preview), the account page as before.
 */
export function VerifyPhoneButton({ handlers }: { handlers?: Partial<PhoneVerifyHandlers> }) {
  const t = useTranslations('community');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const { onStartPhoneChange, onConfirmPhoneChange } = handlers ?? {};
  if (!onStartPhoneChange || !onConfirmPhoneChange) return <Link href={routes.app.account()} className={linkClass}>{t('verifyPhone')}</Link>;
  return <>
    <button ref={button} type="button" onClick={() => setOpen(true)} className={`${linkClass} inline cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-ring`}>{t('verifyPhone')}</button>
    <PhoneVerifyDialog
      open={open}
      onOpenChange={setOpen}
      title={t('verifyPhoneTitle')}
      handlers={{ onStartPhoneChange, onConfirmPhoneChange }}
      returnFocusTo={button}
      onVerified={() => {
        setOpen(false);
        toast.success(t('phoneVerified'));
        router.refresh();
      }}
    />
  </>;
}
