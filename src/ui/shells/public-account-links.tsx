'use client';

import { use } from 'react';
import Link from 'next/link';
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
    return <Link href={account.href} className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}>{account.label}</Link>;
  }

  return <>
    <Link href={resolved.kind === 'public' ? routes.signIn(routes.app.newTask()) : routes.app.newTask()} className={cn(buttonVariants(), 'ml-auto lg:ml-0')}>{t('postTask')}</Link>
    <Link href={account.href} className={cn(buttonVariants({ variant: 'ghost' }), 'hidden lg:inline-flex')}>{account.label}</Link>
  </>;
}
