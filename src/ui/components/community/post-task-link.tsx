import { ArrowRight, ClipboardList } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { CommunityPostTask } from '@/contracts';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { cn } from '@/ui/lib/utils';

const stateTone: Record<CommunityPostTask['state'], string> = {
  open: 'bg-badge-success text-badge-success-foreground',
  booked: 'bg-badge-info text-badge-info-foreground',
  done: 'bg-badge-neutral text-badge-neutral-foreground',
  closed: 'bg-badge-neutral text-badge-neutral-foreground',
};

/**
 * The task a post became ("Ask for help", completion plan 9.10): its title and where it stands now (taking offers,
 * booked, done, or closed), opening the task. The link stays once the task closes, so the thread keeps its ending.
 */
export function PostTaskLink({ task }: { task: CommunityPostTask }) {
  const t = useTranslations('community.postTask');
  return <Link href={task.href} className="group/task flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-background/60 p-3 transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-ring">
    <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground"><ClipboardList className="size-4.5" /></span>
    {/* The title gets the line's whole width; where the task stands sits under it. */}
    <span className="min-w-0 flex-1 leading-tight">
      <span className="block text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{t('label')}</span>
      <span className="mt-0.5 block truncate text-sm font-semibold group-hover/task:text-primary">{task.title}</span>
      <span className={cn('mt-1.5 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums', stateTone[task.state])}>{t('state', { state: task.state, count: task.offerCount })}</span>
    </span>
    <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover/task:translate-x-0.5" />
  </Link>;
}
