import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { buttonVariants } from '@/ui/primitives/button';
import { SkipLink } from './skip-link';

export interface DetailPageShellProps { title: string; backHref: string; actions?: ReactNode; children: ReactNode }

export function DetailPageShell({ title, backHref, actions, children }: DetailPageShellProps) {
  const t = useTranslations('shell');
  return <div className="flex min-h-dvh flex-col bg-background">
    <SkipLink />
    <header className="border-b bg-card"><div className="mx-auto flex max-w-reading items-center gap-3 px-gutter py-4">
      <Link href={backHref} aria-label={t('back')} className={buttonVariants({ variant: 'ghost', size: 'icon' })}><ArrowLeft aria-hidden="true" className="size-5" /></Link>
      <h1 className="min-w-0 font-heading text-2xl leading-8 font-bold md:text-3xl md:leading-[38px]">{title}</h1>
    </div></header>
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-reading flex-1 px-gutter py-8 outline-none">{children}</main>
    {actions && <div role="region" aria-label={t('pageActions')} className="sticky bottom-app-navigation z-20 border-t bg-card pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]"><div className="mx-auto flex max-w-reading flex-wrap items-center justify-end gap-3 px-gutter">{actions}</div></div>}
  </div>;
}
