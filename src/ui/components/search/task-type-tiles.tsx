import { useTranslations } from 'next-intl';
import type { CategorySlug } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { cn } from '@/ui/lib/utils';

export interface TaskTypeTileItem {
  slug: string;
  count: number;
  /** What its tasks on the board offer: the middle half of their budgets (one price when they agree). */
  budget?: { lowCents: number; highCents: number };
  /** The board with this type (or, for the chosen one, without it). */
  href: string;
  selected: boolean;
}

/**
 * The chosen category's task types as tiles above the list (completion plan 7.5, TaskRabbit's popular projects):
 * the busiest first, each with what its tasks offer and how many are open, linking to that type like the filter
 * does (the chosen one links back to all). The facts are the board's own tasks. On phones the tiles scroll
 * sideways in one row, so the list still starts near the top.
 */
export function TaskTypeTiles({ category, items }: { category: CategorySlug; items: TaskTypeTileItem[] }) {
  const t = useTranslations('taskBoard.typeTiles');
  const card = useTranslations('taskCard');
  return <nav aria-label={t('label')} className="-mx-gutter w-[calc(100%+2*var(--page-gutter))] overflow-x-auto px-gutter py-0.5 [scrollbar-width:none] sm:mx-0 sm:w-auto sm:overflow-visible sm:px-0">
    <ul className="flex gap-2 sm:grid sm:grid-cols-3 xl:grid-cols-4">
      {items.map((item) => <li key={item.slug} className="w-[9.5rem] shrink-0 sm:w-auto">
        <Link
          href={item.href}
          rel="nofollow"
          aria-current={item.selected ? 'true' : undefined}
          className={cn(
            'flex h-full min-h-11 flex-col gap-0.5 rounded-xl border bg-card px-3 py-2 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
            item.selected ? 'border-primary bg-brand-soft' : 'border-foreground/[0.08] hover:border-primary/40 dark:border-white/[0.08]',
          )}
        >
          <span className="text-[13px] font-semibold leading-tight">{card(`types.${category}.${item.slug}`)}</span>
          {item.budget && <span className="text-[12px] font-medium tabular-nums">{item.budget.lowCents === item.budget.highCents ? formatMoney(item.budget.lowCents) : t('range', { low: formatMoney(item.budget.lowCents), high: formatMoney(item.budget.highCents) })}</span>}
          <span className="text-[12px] text-muted-foreground tabular-nums">{t('open', { count: item.count })}</span>
        </Link>
      </li>)}
    </ul>
  </nav>;
}
