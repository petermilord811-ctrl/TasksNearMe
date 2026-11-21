'use client';

import { use } from 'react';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { useTranslations } from 'next-intl';
import type { ShellViewer } from '@/contracts';
import { routes } from '@/contracts/routes';
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
    {/* Signed out, "Sign in" shows on phones too (audit M46): coming back is one tap, not a trip through the menu. Under
        430 px the main button says its short form (Spanish "Publicar"; English is the same words), so Sign in, the button
        and the menu fit the bar in both languages (Spanish pass, 2026-11-21: the menu used to slip past the edge at 360).
        Its name stays the whole phrase, which starts with the words on it. */}
    <Link href={account.href} className={cn(buttonVariants({ variant: 'ghost' }), signUp ? 'rounded-full px-3 lg:px-4' : 'hidden rounded-full lg:inline-flex')}>{account.label}</Link>
    {signUp && <Link href={signUp.href} className={cn(buttonVariants({ variant: 'outline' }), 'hidden rounded-full lg:inline-flex')}>{signUp.label}</Link>}
    <Link href={resolved.kind === 'public' ? routes.postTask() : routes.app.newTask()} className={cn(buttonVariants(), 'rounded-full px-4 shadow-[0_8px_20px_-8px_var(--primary-glow)] transition-[transform,box-shadow,background-color] hover:-translate-y-px hover:bg-primary-hover hover:shadow-[0_12px_26px_-8px_var(--primary-glow)] active:translate-y-0 active:scale-[0.97]')} aria-label={t('postTask')}><span className="min-[430px]:hidden">{t('postTaskShort')}</span><span className="hidden min-[430px]:inline">{t('postTask')}</span></Link>
  </>;
}
