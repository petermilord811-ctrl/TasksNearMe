import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { buttonVariants } from '@/ui/primitives/button';
import { AppBar } from './app-bar';
import { ScrollbarActivity } from '@/ui/motion';
import { SkipLink } from './skip-link';

export interface DetailPageShellProps { title: string; backHref: string; actions?: ReactNode; children: ReactNode }

/** A focused page with no app navigation: a pinned glass bar (back and the title) and a glass action bar. */
export function DetailPageShell({ title, backHref, actions, children }: DetailPageShellProps) {
  const t = useTranslations('shell');
  return <div data-app-surface="" className="paper flex min-h-dvh flex-col">
    <SkipLink />
    <ScrollbarActivity />
    <AppBar><div className="mx-auto flex max-w-reading items-center gap-2 px-gutter py-2.5">
      <Link href={backHref} aria-label={t('back')} className={buttonVariants({ variant: 'ghost', size: 'icon', className: 'group -ml-2 rounded-full' })}><ArrowLeft aria-hidden="true" className="size-5 transition-transform duration-300 ease-[var(--ease-out)] group-hover:-translate-x-0.5" /></Link>
      <h1 className="min-w-0 font-display text-xl leading-7 font-semibold tracking-[-0.025em] md:text-2xl md:leading-8">{title}</h1>
    </div></AppBar>
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-reading flex-1 px-gutter py-8 outline-none">{children}</main>
    {actions && <div role="region" aria-label={t('pageActions')} className="app-glass sticky bottom-app-navigation z-20 border-t border-foreground/[0.07] pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-12px_32px_-26px_rgb(40_20_5/0.5)] dark:border-white/[0.07]"><div className="mx-auto flex max-w-reading flex-wrap items-center justify-end gap-3 px-gutter">{actions}</div></div>}
  </div>;
}
