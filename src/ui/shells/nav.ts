import type { Mode, StaffRole } from '@/contracts';
import { routes } from '@/contracts/routes';

export type NavId =
  | 'home'
  | 'tasks'
  | 'bookings'
  | 'messages'
  | 'account'
  | 'findWork'
  | 'earnings'
  | 'helpers'
  | 'saved'
  | 'payments'
  | 'support'
  | 'offers'
  | 'availability'
  | 'clients'
  | 'rewards'
  | 'queues'
  | 'cases'
  | 'reports'
  | 'users'
  | 'verifications'
  | 'responseTimes'
  | 'savedReplies'
  | 'metrics'
  | 'webhooks'
  | 'beta'
  | 'config'
  | 'audit'
  | 'staff'
  | 'howItWorks'
  | 'becomeAHelper'
  | 'pricing';

export interface NavItem {
  id: NavId;
  href: string;
  exact?: boolean;
}

export function getPublicNav(): NavItem[] {
  return [
    { id: 'howItWorks', href: routes.howItWorks() },
    { id: 'becomeAHelper', href: routes.becomeAHelper() },
    { id: 'pricing', href: routes.pricing() },
  ];
}

/** Navigation is presentation of the supplied mode, not an access check. */
export function getAppNav(mode: Mode): { primary: NavItem[]; secondary: NavItem[] } {
  return {
    primary: [
      { id: 'home', href: routes.app.home(), exact: true },
      mode === 'poster'
        ? { id: 'tasks', href: routes.app.tasks() }
        : { id: 'findWork', href: routes.app.findWork() },
      { id: 'bookings', href: routes.app.bookings() },
      { id: 'messages', href: routes.app.messages() },
      mode === 'poster'
        ? { id: 'account', href: routes.app.account() }
        : { id: 'earnings', href: routes.app.earnings() },
    ],
    secondary: mode === 'poster'
      ? [
          { id: 'helpers', href: routes.app.helpers() },
          { id: 'saved', href: routes.app.saved() },
          { id: 'payments', href: routes.app.payments() },
          { id: 'support', href: routes.app.support() },
        ]
      : [
          { id: 'offers', href: routes.app.offers() },
          { id: 'availability', href: routes.app.availability() },
          { id: 'clients', href: routes.app.clients() },
          { id: 'rewards', href: routes.app.rewards() },
          { id: 'support', href: routes.app.support() },
        ],
  };
}

/** The app still owns route authorization; these are the ticket's role-specific links. */
export function getAdminNav(roles: readonly StaffRole[]): NavItem[] {
  const isAdmin = roles.includes('admin');
  // The audit log is for admins and support leads (the route says not found to others).
  const readsAudit = isAdmin || roles.includes('support_lead');
  // The webhook inbox's failures are for admins and finance (completion plan 5.11).
  const readsWebhooks = isAdmin || roles.includes('finance');
  return [
    { id: 'queues', href: routes.admin.home(), exact: true },
    { id: 'cases', href: routes.admin.cases() },
    { id: 'reports', href: routes.admin.reports() },
    { id: 'users', href: routes.admin.users() },
    // Address proofs, name checks, ID and background reviews: every staff role works this queue.
    { id: 'verifications', href: routes.admin.verifications() },
    // Every staff role sees how the queues stand; leads keep the saved replies (others read them).
    { id: 'responseTimes', href: routes.admin.responseTimes() },
    { id: 'savedReplies', href: routes.admin.savedReplies() },
    { id: 'bookings', href: routes.admin.bookings() },
    { id: 'payments', href: routes.admin.payments() },
    { id: 'rewards', href: routes.admin.rewards() },
    // Every staff role reads the market metrics; money figures only reach finance and admins.
    { id: 'metrics', href: routes.admin.metrics() },
    // Every staff role sees the private beta; leads and admins manage it (others read).
    { id: 'beta', href: routes.admin.beta() },
    ...(readsWebhooks ? [{ id: 'webhooks' as const, href: routes.admin.webhooks() }] : []),
    ...(isAdmin ? [{ id: 'config' as const, href: routes.admin.config() }] : []),
    ...(readsAudit ? [{ id: 'audit' as const, href: routes.admin.audit() }] : []),
    ...(isAdmin ? [{ id: 'staff' as const, href: routes.admin.staff() }] : []),
  ];
}

function pathname(href: string): string {
  return href.split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/';
}

/** Match descendants on a path boundary, so /app/bookings-old is not Bookings. */
export function isNavItemActive(item: NavItem, currentPath: string): boolean {
  if (!currentPath) return false;
  const current = pathname(currentPath);
  const target = pathname(item.href);
  return current === target || (!item.exact && target !== '/' && current.startsWith(`${target}/`));
}
