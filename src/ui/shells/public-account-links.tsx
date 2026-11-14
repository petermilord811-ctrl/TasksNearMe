'use client';

import { use } from 'react';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { useTranslations } from 'next-intl';
import { routes, type ShellViewer } from '@/contracts';
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

  if (placement === 'menu') {
    return <Link href={account.href} className={cn(buttonVariants({ variant: 'outline' }), 'w-full rounded-full')}>{account.label}</Link>;
  }

  return <>
    <Link href={account.href} className={cn(buttonVariants({ variant: 'ghost' }), 'hidden rounded-full lg:inline-flex')}>{account.label}</Link>
    <Link href={resolved.kind === 'public' ? routes.signIn(routes.app.newTask()) : routes.app.newTask()} className={cn(buttonVariants(), 'rounded-full px-4 shadow-[0_8px_20px_-8px_var(--primary-glow)] transition-[transform,box-shadow,background-color] hover:-translate-y-px hover:bg-primary-hover hover:shadow-[0_12px_26px_-8px_var(--primary-glow)] active:translate-y-0 active:scale-[0.97]')}>{t('postTask')}</Link>
  </>;
}
