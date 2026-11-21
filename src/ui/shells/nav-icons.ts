import { Activity, BadgeCheck, BookOpen, ChartColumn, Webhook, CalendarDays, CalendarCheck, CircleDollarSign, ClipboardList, FileClock, Flag, Gift, Heart, HelpCircle, Home, Inbox, ListChecks, MessageCircle, MessageSquareText, BellRing, Search, Settings, Ticket, ShieldCheck, Timer, UserRound, UserSearch, Users, UsersRound, Wallet, type LucideIcon } from 'lucide-react';
import type { NavId } from './nav';

/** One icon per destination, on the rail, the dock and in the avatar menu. The Neighborhood (plan 9.10) is its people. */
export const NAV_ICONS: Record<NavId, LucideIcon> = {
  home: Home, tasks: ClipboardList, bookings: CalendarCheck, messages: MessageCircle, community: UsersRound, savedSearches: BellRing,
  account: UserRound, findWork: Search, earnings: Wallet, helpers: UserSearch, saved: Heart, payments: CircleDollarSign,
  support: HelpCircle, offers: Inbox, availability: CalendarDays, clients: Users, rewards: Gift,
  queues: ListChecks, cases: BookOpen, reports: Flag, users: Users, verifications: BadgeCheck, responseTimes: Timer, savedReplies: MessageSquareText, metrics: ChartColumn, webhooks: Webhook, jobs: Activity, beta: Ticket, config: Settings,
  audit: FileClock, staff: ShieldCheck, howItWorks: HelpCircle, becomeAHelper: Users, pricing: CircleDollarSign,
};
