import { useTranslations } from 'next-intl';
import { cn } from '@/ui/lib/utils';
import { NavIndicator } from './nav-indicator';
import { NavLink } from './nav-link';
import { NeighborsDot } from './neighbors-dot';
import { NAV_ICONS } from './nav-icons';
import type { NavItem } from './nav';

/** The current link's own pill, shown until the sliding one (NavIndicator) has measured and takes over. */
const STATIC_PILL = {
  sidebar: 'aria-[current=page]:bg-card aria-[current=page]:shadow-[0_1px_2px_rgb(23_18_14/0.06),0_8px_18px_-12px_rgb(60_30_10/0.32)] dark:aria-[current=page]:bg-white/[0.08] dark:aria-[current=page]:shadow-none',
  bottom: 'aria-[current=page]:bg-card aria-[current=page]:shadow-[0_1px_2px_rgb(23_18_14/0.08),0_6px_14px_-8px_rgb(60_30_10/0.35)] dark:aria-[current=page]:bg-white/[0.1] dark:aria-[current=page]:shadow-none',
};
const PILL_STEPS_ASIDE = 'group-data-[indicator]/navbox:aria-[current=page]:bg-transparent group-data-[indicator]/navbox:aria-[current=page]:shadow-none dark:group-data-[indicator]/navbox:aria-[current=page]:bg-transparent';
const SLIDING_PILL = {
  sidebar: 'rounded-2xl bg-card shadow-[0_1px_2px_rgb(23_18_14/0.06),0_8px_18px_-12px_rgb(60_30_10/0.32)] dark:bg-white/[0.08] dark:shadow-none',
  bottom: 'rounded-[1.375rem] bg-card shadow-[0_1px_2px_rgb(23_18_14/0.08),0_6px_14px_-8px_rgb(60_30_10/0.35)] dark:bg-white/[0.1] dark:shadow-none',
};

/**
 * A list of app links. `sidebar`: rows with an icon, the current one raised on a pill that glides between pages.
 * `bottom`: the phone dock's tabs (one column each), icon over label, with the same gliding pill. Messages isn't one of
 * them since 2026-11-22: the chat button carries its unread count (src/ui/components/messaging/chat-launcher.tsx).
 */
export function Navigation({ items, label, currentPath, variant = 'sidebar', neighborsNews }: {
  items: NavItem[];
  label: string;
  currentPath?: string;
  variant?: 'sidebar' | 'bottom';
  /** The newest neighbor post (plan 10.19): a dot on Neighbors when it's newer than this device's last look. */
  neighborsNews?: { latestAt: string; visitKey: string };
}) {
  const t = useTranslations('shell');
  const bottom = variant === 'bottom';
  return <nav aria-label={label}>
    <div className="group/navbox relative">
      <NavIndicator className={SLIDING_PILL[variant]} />
      <ul className={cn('relative', bottom ? 'grid gap-1' : 'space-y-0.5')} style={bottom ? { gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` } : undefined}>
        {items.map((item) => {
          const Icon = NAV_ICONS[item.id];
          const name = t(`nav.${item.id}`);
          return <li key={item.id} className="min-w-0">
            <NavLink item={item} currentPath={currentPath}
              className={cn(
                'group/item relative z-[1] flex min-w-0 font-medium transition-[color,background-color,box-shadow] duration-300 ease-[var(--ease-out)] aria-[current=page]:text-foreground',
                bottom
                  ? 'min-h-14 flex-col items-center justify-center gap-1 rounded-[1.375rem] px-0.5 py-1.5 text-[0.6875rem] leading-tight font-semibold text-foreground/75 hover:text-foreground'
                  : 'min-h-11 items-center gap-3 rounded-2xl px-3 py-2.5 text-[0.9375rem] text-foreground/70 hover:bg-foreground/[0.045] hover:text-foreground dark:text-foreground/75 dark:hover:bg-white/[0.05] group-data-[indicator]/navbox:aria-[current=page]:hover:bg-transparent',
                STATIC_PILL[variant],
                PILL_STEPS_ASIDE,
              )}>
              <Icon aria-hidden="true" className={cn('shrink-0 text-muted-foreground transition-[color,translate] duration-300 ease-[var(--ease-out)] group-hover/item:text-foreground group-aria-[current=page]/item:text-primary', bottom ? 'size-[1.375rem] group-aria-[current=page]/item:-translate-y-px' : 'size-5')} />
              <span className={cn('break-words', bottom && 'max-w-full text-center')}>{name}</span>
              {item.id === 'community' && neighborsNews && <NeighborsDot latestAt={neighborsNews.latestAt} visitKey={neighborsNews.visitKey} bottom={bottom} />}
            </NavLink>
          </li>;
        })}
      </ul>
    </div>
  </nav>;
}
