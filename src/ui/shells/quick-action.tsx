'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Plus, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Mode } from '@/contracts';
import { routes } from '@/contracts/routes';
import { splitLocalePath } from '@/shared/locale';

/**
 * The signed-in bar's next step for the mode: "Post a task" for someone who needs help, "Find work" for a helper.
 * An icon on phones, a pill with its label from `md` up; hidden on the page it leads to.
 */
export function QuickAction({ mode }: { mode: Mode }) {
  const t = useTranslations('shell');
  const pathname = usePathname();
  const path = splitLocalePath(pathname)?.path ?? pathname;
  const helper = mode === 'helper';
  const href = helper ? routes.app.findWork() : routes.app.newTask();
  if (path.startsWith(href.split('?')[0]!)) return null;
  const Icon = helper ? Search : Plus;
  const label = helper ? t('quickAction.findWork') : t('quickAction.postTask');
  return (
    <Link
      href={href}
      aria-label={label}
      className="inline-flex size-11 items-center justify-center gap-1.5 rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-[0_8px_20px_-10px_var(--primary-glow)] transition-[translate,box-shadow] duration-300 ease-[var(--ease-out)] hover:-translate-y-px hover:shadow-[0_12px_26px_-10px_var(--primary-glow)] active:translate-y-0 md:size-auto md:min-h-10 md:pr-4 md:pl-3"
    >
      <Icon aria-hidden="true" className="size-[1.125rem] md:size-4" />
      <span aria-hidden="true" className="hidden md:inline">{label}</span>
    </Link>
  );
}
