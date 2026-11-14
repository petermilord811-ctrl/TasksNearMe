'use client';

import { useTranslations } from 'next-intl';
import { Toaster } from 'sonner';
import { ToastTabGuard } from '@/ui/primitives/sonner';

/** Mounted by the app; previews mount their own instance without changing the root layout. No keyboard trap at the toasts: ToastTabGuard (5.19). */
export function AppToaster() {
  const t = useTranslations('feedback');
  return <ToastTabGuard><Toaster theme="system" position="top-right" containerAriaLabel={t('notifications')} toastOptions={{ classNames: { toast: '!border-border !bg-popover !text-popover-foreground !font-sans', description: '!text-muted-foreground' } }} /></ToastTabGuard>;
}
