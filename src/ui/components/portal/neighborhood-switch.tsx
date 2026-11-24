import { ClipboardList, MessagesSquare } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { cn } from '@/ui/lib/utils';

const itemClass = 'inline-flex min-h-9 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/**
 * Neighbors | Open tasks (owner, 2026-11-23: "how to show both effectively together? … I still can't find /tasks
 * redirect button"): one neighborhood, two tabs, the same control in the same place at the top of Neighbors
 * (`/app/community`) and of the public board (`/[market]/tasks`), with the open tasks counted beside their name. The
 * tab in view is marked, not a link (following it would only drop the filters); the other is a link that keeps the
 * place. On phones it takes the row's width, its two halves equal.
 */
export function NeighborhoodSwitch({ current, neighborsHref, tasksHref, taskCount, className }: {
  current: 'neighbors' | 'tasks';
  neighborsHref: string;
  tasksHref: string;
  /** The open tasks the other tab lists (the place's, or the market's on the board). */
  taskCount: number;
  className?: string;
}) {
  const t = useTranslations('portal.switch');
  const tab = (key: 'neighbors' | 'tasks', href: string) => {
    const Icon = key === 'neighbors' ? MessagesSquare : ClipboardList;
    const selected = current === key;
    const content = <>
      <Icon aria-hidden="true" className="size-4 shrink-0" />{t(key)}
      {key === 'tasks' && <span className={cn('min-w-5 rounded-full px-1.5 text-center text-[11px] leading-[1.125rem] font-semibold tabular-nums', selected ? 'bg-background/20 text-background' : 'bg-brand-soft text-primary')}>{taskCount}</span>}
    </>;
    return <li className="flex min-w-0 flex-1 sm:flex-none">
      {selected
        ? <span aria-current="page" className={cn(itemClass, 'bg-foreground text-background shadow-sm')}>{content}</span>
        : <Link href={href} className={cn(itemClass, 'text-foreground/80 hover:bg-accent hover:text-foreground')}>{content}</Link>}
    </li>;
  };
  return <nav aria-label={t('label')} className={cn('flex w-full sm:inline-flex sm:w-auto', className)}>
    <ul className="flex w-full gap-0.5 rounded-full border border-foreground/[0.08] bg-card/80 p-1 shadow-[0_1px_2px_rgb(23_18_14/0.04)] sm:w-auto dark:border-white/[0.08]">
      {tab('neighbors', neighborsHref)}
      {tab('tasks', tasksHref)}
    </ul>
  </nav>;
}
