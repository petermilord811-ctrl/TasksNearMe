'use client';

import { use } from 'react';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { useTranslations } from 'next-intl';
import type { ShellViewer } from '@/contracts';
import { routes } from '@/contracts/routes';
import { CircleUserRound, Plus } from 'lucide-react';
import { buttonVariants } from '@/ui/primitives/button';
import { cn } from '@/ui/lib/utils';

/** Only these links depend on the viewer; the public page never waits for them. */
export function PublicAccountLinks({ viewer, placement }: {
  viewer: ShellViewer | Promise<ShellViewer>;
  placement: 'header' | 'menu';
}) {
  const t = useTranslations('shell');
  const resolved = 'kind' in viewer ? viewer : use(viewer);
  const account = resolved.kind === 'public'
    ? { href: routes.signIn(), label: t('signIn') }
    : resolved.kind === 'staff'
      ? { href: routes.admin.home(), label: t('staffArea') }
      : { href: routes.app.home(), label: t('goToApp') };

  // Signed out: creating an account has its own page too (completion plan 9.6).
  const signUp = resolved.kind === 'public' ? { href: routes.signUp(), label: t('signUp') } : null;

  if (placement === 'menu') {
    return <div className="grid gap-2">
      {signUp && <Link href={signUp.href} className={cn(buttonVariants({ variant: 'outline' }), 'w-full rounded-full')}>{signUp.label}</Link>}
      <Link href={account.href} className={cn(buttonVariants({ variant: signUp ? 'ghost' : 'outline' }), 'w-full rounded-full')}>{account.label}</Link>
    </div>;
  }

  return <>
    {/* Signed out, "Sign in" shows on phones too (audit M46): coming back is one tap, not a trip through the menu. Below
        640 px it and the main button are round icons (the app bar's look), so the two-line logo, the theme switch and the
        menu fit 360 px in both languages (owner, 2026-11-24); their names stay the whole words. Up to 1024 px the main
        button says its short form (Spanish "Publicar"; English is the same words): Spanish overflowed the bar at 430. */}
    <Link href={account.href} title={signUp ? account.label : undefined} className={cn(buttonVariants({ variant: 'ghost' }), signUp ? 'rounded-full max-sm:size-11 max-sm:px-0 sm:px-3 lg:px-4' : 'hidden rounded-full lg:inline-flex')}>
      {signUp && <CircleUserRound aria-hidden="true" className="size-5 sm:hidden" />}
      <span className={signUp ? 'max-sm:sr-only' : undefined}>{account.label}</span>
    </Link>
    {signUp && <Link href={signUp.href} className={cn(buttonVariants({ variant: 'outline' }), 'hidden rounded-full lg:inline-flex')}>{signUp.label}</Link>}
    <Link href={resolved.kind === 'public' ? routes.postTask() : routes.app.newTask()} className={cn(buttonVariants(), 'rounded-full shadow-[0_8px_20px_-8px_var(--primary-glow)] transition-[transform,box-shadow,background-color] hover:-translate-y-px hover:bg-primary-hover hover:shadow-[0_12px_26px_-8px_var(--primary-glow)] active:translate-y-0 active:scale-[0.97] max-sm:size-11 max-sm:px-0 sm:px-4')} aria-label={t('postTask')}>
      <Plus aria-hidden="true" className="size-5 sm:hidden" />
      <span className="hidden sm:inline lg:hidden">{t('postTaskShort')}</span><span className="hidden lg:inline">{t('postTask')}</span>
    </Link>
  </>;
}
