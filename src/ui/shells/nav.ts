import type { Mode, StaffRole } from '@/contracts';
import { routes } from '@/contracts/routes';

export type NavId =
  | 'home'
  | 'tasks'
  | 'bookings'
  | 'messages'
  | 'community'
  | 'savedSearches'
  | 'account'
  | 'plan'
  | 'sparks'
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
  | 'jobs'
  | 'beta'
  | 'config'
  | 'audit'
  | 'staff'
  | 'helpChat'
  | 'liveChat'
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

/**
 * The signed-in navigation (completion plan 9.14; before and after in docs/ui/dashboard-9.9.md §7). Presentation of
 * the supplied mode, not an access check.
 * - `primary`: four places for every day, on the rail and the phone dock. A client's: Home, Neighbors (plan 9.10's
 *   portal, where neighbors' asks and open tasks meet; one name everywhere, audit L15), Tasks, Bookings. A helper's:
 *   Home, Find work, Neighbors, Bookings (docs/ui/portal-9.10.md §10). Messages left them on 2026-11-22: it's the
 *   round chat button at the bottom right of every page (the owner: "Reddit similar chat"), its one place on screen.
 * - `dock`: the phone's tab dock (owner, 2026-11-24): five, Home raised in the middle as a circle, two on each side.
 *   A client's: Neighbors, Tasks, Home, Bookings, Find helpers. A helper's: Find work, Neighbors, Home, Bookings,
 *   Offers. Messages is in the phone's top bar, with its unread count.
 * - `secondary`: the mode's tools, on the rail under the line (wide screens) and in the avatar menu below that width,
 *   but for what the dock already holds.
 * - `account`: the account's pages, in the avatar menu at every width.
 * Each destination has one place on a screen.
 */
export function getAppNav(mode: Mode): { primary: NavItem[]; dock: NavItem[]; secondary: NavItem[]; account: NavItem[] } {
  const home: NavItem = { id: 'home', href: routes.app.home(), exact: true };
  const neighbors: NavItem = { id: 'community', href: routes.app.community() };
  const last: NavItem[] = [{ id: 'bookings', href: routes.app.bookings() }];
  // The plans and Sparks sit with the account's pages (2026-11-21: "make plan subscription feature asap").
  const account: NavItem[] = [
    { id: 'account', href: routes.app.account() },
    { id: 'plan', href: routes.app.plan() },
    { id: 'sparks', href: routes.app.sparks() },
    { id: 'payments', href: routes.app.payments() },
    // TasksNearMe Help (2026-11-22): the assistant and a person, also findable here, beside the support cases.
    { id: 'helpChat', href: routes.app.helpChat() },
    { id: 'support', href: routes.app.support() },
  ];
  const tasks: NavItem = { id: 'tasks', href: routes.app.tasks() };
  const helpers: NavItem = { id: 'helpers', href: routes.app.helpers() };
  const findWork: NavItem = { id: 'findWork', href: routes.app.findWork() };
  const offers: NavItem = { id: 'offers', href: routes.app.offers() };
  return mode === 'poster'
    ? {
        primary: [home, neighbors, tasks, ...last],
        dock: [neighbors, tasks, home, ...last, helpers],
        secondary: [
          helpers,
          { id: 'saved', href: routes.app.saved() },
          { id: 'savedSearches', href: routes.app.savedSearches() },
        ],
        account,
      }
    : {
        primary: [home, findWork, neighbors, ...last],
        dock: [findWork, neighbors, home, ...last, offers],
        secondary: [
          offers,
          { id: 'availability', href: routes.app.availability() },
          { id: 'earnings', href: routes.app.earnings() },
          { id: 'clients', href: routes.app.clients() },
          { id: 'rewards', href: routes.app.rewards() },
          { id: 'savedSearches', href: routes.app.savedSearches() },
        ],
        account,
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
    // Live chat (2026-11-22): for the roles that work cases.
    ...(roles.some((role) => role === 'support_agent' || role === 'support_lead' || role === 'trust_safety' || role === 'admin') ? [{ id: 'liveChat' as const, href: routes.admin.liveChat() }] : []),
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
    // What the job runner did on this server, for the same staff (when things break, 2026-11-21).
    ...(readsWebhooks ? [{ id: 'jobs' as const, href: routes.admin.jobs() }] : []),
    // Every staff role reads where we're open (the config page's Markets section, plan 8.2); the rest of it is admins'.
    { id: 'config', href: routes.admin.config() },
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
