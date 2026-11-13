import { useTranslations } from 'next-intl';
import { BadgeCheck, BookOpen, CalendarDays, CalendarCheck, CircleDollarSign, ClipboardList, FileClock, Flag, Gift, Heart, HelpCircle, Home, Inbox, ListChecks, MessageCircle, Search, Settings, ShieldCheck, UserRound, UserSearch, Users, Wallet, type LucideIcon } from 'lucide-react';
import { cn } from '@/ui/lib/utils';
import { NavIndicator } from './nav-indicator';
import { NavLink } from './nav-link';
import type { NavId, NavItem } from './nav';

const icons: Record<NavId, LucideIcon> = {
  home: Home, tasks: ClipboardList, bookings: CalendarCheck, messages: MessageCircle,
  account: UserRound, findWork: Search, earnings: Wallet, helpers: UserSearch, saved: Heart, payments: CircleDollarSign,
  support: HelpCircle, offers: Inbox, availability: CalendarDays, clients: Users, rewards: Gift,
  queues: ListChecks, cases: BookOpen, reports: Flag, users: Users, verifications: BadgeCheck, config: Settings,
  audit: FileClock, staff: ShieldCheck, howItWorks: HelpCircle, becomeAHelper: Users, pricing: CircleDollarSign,
};

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
 * `bottom`: the phone dock's five tabs, icon over label, with the same gliding pill. Unread messages show a count
 * (in the link's name too).
 */
export function Navigation({ items, label, currentPath, unreadMessages = 0, variant = 'sidebar' }: {
  items: NavItem[];
  label: string;
  currentPath?: string;
  unreadMessages?: number;
  variant?: 'sidebar' | 'bottom';
}) {
  const t = useTranslations('shell');
  const bottom = variant === 'bottom';
  return <nav aria-label={label}>
    <div className="group/navbox relative">
      <NavIndicator className={SLIDING_PILL[variant]} />
      <ul className={cn('relative', bottom ? 'grid grid-cols-5 gap-1' : 'space-y-0.5')}>
        {items.map((item) => {
          const Icon = icons[item.id];
          const count = item.id === 'messages' ? unreadMessages : 0;
          return <li key={item.id} className="min-w-0">
            <NavLink item={item} currentPath={currentPath} aria-label={count > 0 ? `${t(`nav.${item.id}`)} ${t('unreadMessages', { count })}` : undefined}
              className={cn(
                'group/item relative z-[1] flex min-w-0 font-medium transition-[color,background-color,box-shadow] duration-300 ease-[var(--ease-out)] aria-[current=page]:text-foreground',
                bottom
                  ? 'min-h-14 flex-col items-center justify-center gap-1 rounded-[1.375rem] px-0.5 py-1.5 text-[0.6875rem] leading-tight font-semibold text-foreground/75 hover:text-foreground'
                  : 'min-h-11 items-center gap-3 rounded-2xl px-3 py-2.5 text-[0.9375rem] text-foreground/70 hover:bg-foreground/[0.045] hover:text-foreground dark:text-foreground/75 dark:hover:bg-white/[0.05] group-data-[indicator]/navbox:aria-[current=page]:hover:bg-transparent',
                STATIC_PILL[variant],
                PILL_STEPS_ASIDE,
              )}>
              <Icon aria-hidden="true" className={cn('shrink-0 text-muted-foreground transition-[color,translate] duration-300 ease-[var(--ease-out)] group-hover/item:text-foreground group-aria-[current=page]/item:text-primary', bottom ? 'size-[1.375rem] group-aria-[current=page]/item:-translate-y-px' : 'size-5')} />
              <span className={cn('break-words', bottom && 'max-w-full text-center')}>{t(`nav.${item.id}`)}</span>
              {count > 0 && <>{' '}<span aria-hidden="true" className={cn('rounded-full bg-primary text-center font-semibold text-primary-foreground tabular-nums', bottom ? 'absolute top-1 left-[calc(50%+0.3rem)] min-w-4 px-1 text-[10px] leading-4 ring-2 ring-background' : 'ml-auto min-w-6 px-1.5 text-xs leading-5')}>{count}</span></>}
            </NavLink>
          </li>;
        })}
      </ul>
    </div>
  </nav>;
}
