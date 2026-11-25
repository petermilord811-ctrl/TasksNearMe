'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Plus, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Mode } from '@/contracts';
import { routes } from '@/contracts/routes';
import { splitLocalePath } from '@/shared/locale';
import { cn } from '@/ui/lib/utils';

/**
 * The signed-in bar's next step for the mode: "Post a task" for someone who needs help, "Find work" for a helper.
 * On phones a soft round button in the brand's color, as light as the bar's other buttons (2026-11-25, owner: "header
 * tasksnearme title and other buttons look uncomfortable": the filled circle outweighed the logo); a filled pill with
 * its label from `md` up. A helper's is left to the dock's own Find work below `lg` (one place on a screen). Hidden on
 * the page it leads to.
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
      className={cn(
        'inline-flex size-10 shrink-0 items-center justify-center gap-1.5 rounded-full bg-primary/10 text-sm font-semibold text-primary transition-[translate,box-shadow,background-color] duration-300 ease-[var(--ease-out)] hover:bg-primary/15 active:scale-95 dark:bg-primary/20 dark:hover:bg-primary/25',
        'md:size-auto md:min-h-10 md:bg-primary md:pr-4 md:pl-3 md:text-primary-foreground md:shadow-[0_8px_20px_-10px_var(--primary-glow)] md:hover:-translate-y-px md:hover:bg-primary md:hover:shadow-[0_12px_26px_-10px_var(--primary-glow)] md:active:translate-y-0 md:active:scale-100 md:dark:bg-primary',
        helper && 'max-lg:hidden',
      )}
    >
      <Icon aria-hidden="true" className="size-5 md:size-4" />
      <span aria-hidden="true" className="hidden md:inline">{label}</span>
    </Link>
  );
}
