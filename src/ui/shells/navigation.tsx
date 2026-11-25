import { useTranslations } from 'next-intl';
import { cn } from '@/ui/lib/utils';
import { NavIndicator } from './nav-indicator';
import { NavLink } from './nav-link';
import { NeighborsDot } from './neighbors-dot';
import { NAV_ICONS } from './nav-icons';
import type { NavItem } from './nav';

/** The current link's own pill, shown until the sliding one (NavIndicator) has measured and takes over (the rail). */
const STATIC_PILL = 'aria-[current=page]:bg-card aria-[current=page]:shadow-[0_1px_2px_rgb(23_18_14/0.06),0_8px_18px_-12px_rgb(60_30_10/0.32)] dark:aria-[current=page]:bg-white/[0.08] dark:aria-[current=page]:shadow-none';
const PILL_STEPS_ASIDE = 'group-data-[indicator]/navbox:aria-[current=page]:bg-transparent group-data-[indicator]/navbox:aria-[current=page]:shadow-none dark:group-data-[indicator]/navbox:aria-[current=page]:bg-transparent';
const SLIDING_PILL = 'rounded-2xl bg-card shadow-[0_1px_2px_rgb(23_18_14/0.06),0_8px_18px_-12px_rgb(60_30_10/0.32)] dark:bg-white/[0.08] dark:shadow-none';
/** A dock tab: icon over its one-line name, 64 px tall, the same baseline for every name (Home's included). */
const DOCK_TAB = 'group/item relative flex h-16 min-w-0 flex-col items-center px-0.5 text-[0.6875rem] leading-[0.875rem] font-medium text-muted-foreground transition-colors duration-200 ease-[var(--ease-out)] hover:text-foreground aria-[current=page]:font-semibold aria-[current=page]:text-foreground';

/**
 * A list of app links. `sidebar`: rows with an icon, the current one raised on a pill that glides between pages.
 * `bottom`: the phone dock's tabs (one column each), the icon over a one-line name; the current tab's icon sits on a
 * soft pill that grows in (2026-11-25). Home, in the middle, is a raised circle (owner, 2026-11-24) sitting in the
 * dock's cradle (MobileBottomNav). Messages isn't one of them: the phone's top bar carries it, with its unread count.
 */
export function Navigation({ items, label, currentPath, variant = 'sidebar', neighborsNews, counts }: {
  items: NavItem[];
  label: string;
  currentPath?: string;
  variant?: 'sidebar' | 'bottom';
  /** The newest neighbor post (plan 10.19): a dot on Neighbors when it's newer than this device's last look. */
  neighborsNews?: { latestAt: string; visitKey: string };
  /** A count beside a destination, in its name too: the live chats waiting, in the staff menu (2026-11-22). */
  counts?: Partial<Record<NavItem['id'], number>>;
}) {
  const t = useTranslations('shell');
  const bottom = variant === 'bottom';
  return <nav aria-label={label}>
    <div className="group/navbox relative">
      {!bottom && <NavIndicator className={SLIDING_PILL} />}
      <ul className={cn('relative', bottom ? 'grid' : 'space-y-0.5')} style={bottom ? { gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` } : undefined}>
        {items.map((item) => {
          const Icon = NAV_ICONS[item.id];
          const name = t(`nav.${item.id}`);
          const count = counts?.[item.id] ?? 0;
          if (bottom) {
            // The dock's short name where the full one doesn't fit a column ("Helpers" for "Find helpers").
            const dockName = t.has(`navShort.${item.id}`) ? t(`navShort.${item.id}`) : name;
            if (item.id === 'home') {
              return <li key={item.id} className="min-w-0">
                {/* The circle's centre is 10 px below the bar's top edge, in the middle of the cradle cut around it. */}
                <NavLink item={item} currentPath={currentPath} data-nav-circle="" className={cn(DOCK_TAB, 'justify-end pb-2')}>
                  <span aria-hidden="true" className="absolute top-[-1.0625rem] left-1/2 grid size-[3.375rem] -translate-x-1/2 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_10px_22px_-10px_var(--primary-glow),0_2px_5px_rgb(23_18_14/0.16)] transition-[translate,scale,box-shadow] duration-300 ease-[var(--ease-out)] group-hover/item:-translate-y-0.5 group-active/item:scale-95 group-aria-[current=page]/item:shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_22%,transparent),0_10px_22px_-10px_var(--primary-glow)] motion-reduce:transition-none">
                    <Icon className="size-6" />
                  </span>
                  <span className="max-w-full truncate">{dockName}</span>
                </NavLink>
              </li>;
            }
            return <li key={item.id} className="min-w-0">
              <NavLink item={item} currentPath={currentPath} className={cn(DOCK_TAB, 'gap-1 pt-2')}>
                <span aria-hidden="true" className="relative grid h-[1.875rem] w-14 max-w-full place-items-center">
                  <span className="absolute inset-0 scale-x-[0.4] rounded-full bg-secondary opacity-0 transition-[scale,opacity] duration-300 ease-[var(--ease-out)] group-aria-[current=page]/item:scale-x-100 group-aria-[current=page]/item:opacity-100 motion-reduce:transition-none dark:bg-primary/20" />
                  <Icon className="relative size-[1.375rem] transition-colors duration-200 group-hover/item:text-foreground group-aria-[current=page]/item:text-primary" />
                  {item.id === 'community' && neighborsNews && <NeighborsDot latestAt={neighborsNews.latestAt} visitKey={neighborsNews.visitKey} bottom />}
                  {count > 0 && <span className="absolute -top-0.5 left-[calc(50%+0.35rem)] min-w-4 rounded-full bg-primary px-1 text-center text-[10px] leading-4 font-semibold text-primary-foreground tabular-nums ring-2 ring-card">{count}</span>}
                </span>
                <span className="max-w-full truncate">{dockName}</span>
                {count > 0 && <span className="sr-only">{t('navCount', { count })}</span>}
              </NavLink>
            </li>;
          }
          return <li key={item.id} className="min-w-0">
            <NavLink item={item} currentPath={currentPath}
              className={cn(
                'group/item relative z-[1] flex min-h-11 min-w-0 items-center gap-3 rounded-2xl px-3 py-2.5 text-[0.9375rem] font-medium text-foreground/70 transition-[color,background-color,box-shadow] duration-300 ease-[var(--ease-out)] hover:bg-foreground/[0.045] hover:text-foreground aria-[current=page]:text-foreground dark:text-foreground/75 dark:hover:bg-white/[0.05] group-data-[indicator]/navbox:aria-[current=page]:hover:bg-transparent',
                STATIC_PILL,
                PILL_STEPS_ASIDE,
              )}>
              <Icon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground transition-[color,translate] duration-300 ease-[var(--ease-out)] group-hover/item:text-foreground group-aria-[current=page]/item:text-primary" />
              <span className="break-words">{name}</span>
              {item.id === 'community' && neighborsNews && <NeighborsDot latestAt={neighborsNews.latestAt} visitKey={neighborsNews.visitKey} bottom={false} />}
              {count > 0 && <span aria-hidden="true" className="ml-auto min-w-6 rounded-full bg-primary px-1.5 text-center text-xs leading-5 font-semibold text-primary-foreground tabular-nums">{count}</span>}
              {/* The count as words for screen readers ("Live chat, 2 waiting"), part of the link's own text. */}
              {count > 0 && <span className="sr-only">{t('navCount', { count })}</span>}
            </NavLink>
          </li>;
        })}
      </ul>
    </div>
  </nav>;
}
