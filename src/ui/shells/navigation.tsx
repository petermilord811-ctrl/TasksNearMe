import { useTranslations } from 'next-intl';
import { BookOpen, CalendarDays, CalendarCheck, CircleDollarSign, ClipboardList, FileClock, Flag, Gift, Heart, HelpCircle, Home, Inbox, ListChecks, MessageCircle, Search, Settings, ShieldCheck, UserRound, Users, Wallet, type LucideIcon } from 'lucide-react';
import { cn } from '@/ui/lib/utils';
import { NavLink } from './nav-link';
import type { NavId, NavItem } from './nav';

const icons: Record<NavId, LucideIcon> = {
  home: Home, tasks: ClipboardList, bookings: CalendarCheck, messages: MessageCircle,
  account: UserRound, findWork: Search, earnings: Wallet, saved: Heart, payments: CircleDollarSign,
  support: HelpCircle, offers: Inbox, availability: CalendarDays, clients: Users, rewards: Gift,
  queues: ListChecks, cases: BookOpen, reports: Flag, users: Users, config: Settings,
  audit: FileClock, staff: ShieldCheck, howItWorks: HelpCircle, becomeAHelper: Users, pricing: CircleDollarSign,
};

export function Navigation({ items, label, currentPath, unreadMessages = 0, variant = 'sidebar' }: {
  items: NavItem[];
  label: string;
  currentPath?: string;
  unreadMessages?: number;
  variant?: 'sidebar' | 'bottom';
}) {
  const t = useTranslations('shell');
  return <nav aria-label={label}>
    <ul className={cn(variant === 'bottom' ? 'grid grid-cols-5 gap-1' : 'space-y-1')}>
      {items.map((item) => {
        const Icon = icons[item.id];
        const count = item.id === 'messages' ? unreadMessages : 0;
        return <li key={item.id} className="min-w-0">
          <NavLink item={item} currentPath={currentPath} aria-label={count > 0 ? `${t(`nav.${item.id}`)} ${t('unreadMessages', { count })}` : undefined}
            className={cn('relative flex min-h-11 min-w-0 gap-2 rounded-md border-transparent text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground', variant === 'bottom' ? 'flex-col items-center border-t-2 px-0.5 py-2' : 'items-center border-l-2 px-3 py-3')}
            activeClassName="border-primary bg-secondary text-secondary-foreground">
            <Icon aria-hidden="true" className="size-5 shrink-0" />
            <span className="break-words">{t(`nav.${item.id}`)}</span>
            {count > 0 && <>{' '}<span aria-hidden="true" className={cn('rounded-full bg-primary text-center text-primary-foreground tabular-nums', variant === 'bottom' ? 'absolute top-0 left-[calc(50%+.25rem)] min-w-4 px-1 text-[10px] leading-4' : 'ml-auto px-2 text-xs leading-5')}>{count}</span></>}
          </NavLink>
        </li>;
      })}
    </ul>
  </nav>;
}
