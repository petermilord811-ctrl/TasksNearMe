/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { routes, STAFF_ROLES, type StaffRole } from '@/contracts';
import { alexStaff, jordanShell, mayaShell, morganStaff, rileyStaff } from '@/fixtures';
import { getAdminNav, getAppNav, getPublicNav, isNavItemActive, type NavItem } from './nav';

const ids = (items: NavItem[]) => items.map((item) => item.id);

describe('app navigation (completion plan 9.14)', () => {
  it('keeps four everyday places, the Neighborhood among them (docs/ui/portal-9.10.md §10); Messages is the chat button (2026-11-22)', () => {
    const poster = getAppNav(mayaShell.mode);
    const helper = getAppNav(jordanShell.mode);
    expect(ids(poster.primary)).toEqual(['home', 'community', 'tasks', 'bookings']);
    expect(ids(helper.primary)).toEqual(['home', 'findWork', 'community', 'bookings']);
    expect(poster.primary.map((item) => item.href)).toEqual([routes.app.home(), routes.app.community(), routes.app.tasks(), routes.app.bookings()]);
    for (const mode of ['poster', 'helper'] as const) {
      const { primary, secondary, account } = getAppNav(mode);
      expect([...primary, ...secondary, ...account].some((item) => item.id === 'messages')).toBe(false);
    }
    expect(helper.primary[1]!.href).toBe(routes.app.findWork());
  });

  it("gives each mode its own tools, and both the account's pages", () => {
    expect(ids(getAppNav('poster').secondary)).toEqual(['helpers', 'saved', 'savedSearches']);
    expect(ids(getAppNav('helper').secondary)).toEqual(['offers', 'availability', 'earnings', 'clients', 'rewards', 'savedSearches']);
    expect(getAppNav('helper').secondary.map((item) => item.href)).toEqual([
      routes.app.offers(), routes.app.availability(), routes.app.earnings(), routes.app.clients(), routes.app.rewards(), routes.app.savedSearches(),
    ]);
    for (const mode of ['poster', 'helper'] as const) {
      // TasksNearMe Help sits beside the support cases (2026-11-22, owner: "I can't find the help page in other tabs or settings").
      expect(getAppNav(mode).account.map((item) => item.href)).toEqual([routes.app.account(), routes.app.plan(), routes.app.sparks(), routes.app.payments(), routes.app.helpChat(), routes.app.support()]);
    }
  });

  it('puts every destination in one place only', () => {
    for (const mode of ['poster', 'helper'] as const) {
      const nav = getAppNav(mode);
      const all = [...nav.primary, ...nav.secondary, ...nav.account].map((item) => item.id);
      expect(new Set(all).size).toBe(all.length);
    }
  });
});

describe('admin navigation', () => {
  const shared = ['cases', 'reports', 'users', 'verifications', 'responseTimes', 'savedReplies', 'bookings', 'payments', 'rewards', 'metrics', 'beta'];
  // Live chat is for the roles that work cases (2026-11-22); finance doesn't.
  const base = ['queues', 'liveChat', ...shared];
  const financeBase = ['queues', ...shared];
  // Every staff role reads the markets on the config page (plan 8.2).
  const standard = [...base, 'config'];
  // The audit log is for admins and support leads (UI-033).
  const withAudit = [...standard, 'audit'];

  it('shows the staff navigation for Alex P. (an agent) and Morgan L. (a lead, with the audit log)', () => {
    expect(ids(getAdminNav(alexStaff.roles))).toEqual(standard);
    expect(ids(getAdminNav(morganStaff.roles))).toEqual(withAudit);
  });

  it.each(STAFF_ROLES.filter((role) => role !== 'admin'))('omits Staff for %s, and shows Config (read-only markets)', (role) => {
    expect(ids(getAdminNav([role]))).toEqual(role === 'support_lead' ? withAudit : role === 'finance' ? [...financeBase, 'webhooks', 'jobs', 'config'] : standard);
  });

  it('shows Config and Staff in their specified positions for an admin', () => {
    expect(ids(getAdminNav(rileyStaff.roles))).toEqual([
      'queues', 'liveChat', 'cases', 'reports', 'users', 'verifications', 'responseTimes', 'savedReplies', 'bookings', 'payments', 'rewards', 'metrics', 'beta', 'webhooks', 'jobs', 'config', 'audit', 'staff',
    ]);
    expect(getAdminNav(rileyStaff.roles).map((item) => item.href)).toEqual([
      routes.admin.home(), routes.admin.liveChat(), routes.admin.cases(), routes.admin.reports(), routes.admin.users(), routes.admin.verifications(),
      routes.admin.responseTimes(), routes.admin.savedReplies(), routes.admin.bookings(), routes.admin.payments(), routes.admin.rewards(), routes.admin.metrics(), routes.admin.beta(), routes.admin.webhooks(), routes.admin.jobs(), routes.admin.config(),
      routes.admin.audit(), routes.admin.staff(),
    ]);
  });

  it('supports multiple roles without duplicating navigation', () => {
    const roles: StaffRole[] = ['support_lead', 'admin', 'finance'];
    expect(getAdminNav(roles)).toEqual(getAdminNav(['admin']));
    expect(ids(getAdminNav(['support_agent', 'finance']))).toEqual([...base, 'webhooks', 'jobs', 'config']);
  });
});

describe('public navigation', () => {
  it('uses the public route builders in header order', () => {
    expect(getPublicNav()).toEqual([
      { id: 'howItWorks', href: routes.howItWorks() },
      { id: 'becomeAHelper', href: routes.becomeAHelper() },
      { id: 'pricing', href: routes.pricing() },
    ]);
  });
});

describe('active navigation', () => {
  const helperItems = getAppNav('helper').primary;

  it.each([
    ['/app', ['home']],
    ['/app/', ['home']],
    ['/app?from=notification#main', ['home']],
    ['/app/bookings/abc', ['bookings']],
    ['/app/bookings/abc/?tab=details#main', ['bookings']],
    ['/app/find-work', ['findWork']],
    ['/app/find-work/', ['findWork']],
    ['/app/bookings-old', []],
    ['/app/find-worker', []],
    ['/app/unlisted', []],
    ['', []],
  ])('selects the expected item for %s', (path, expected) => {
    expect(ids(helperItems.filter((item) => isNavItemActive(item, path)))).toEqual(expected);
  });

  it('matches Queues exactly and admin details by prefix', () => {
    const items = getAdminNav(['admin']);
    expect(ids(items.filter((item) => isNavItemActive(item, '/admin')))).toEqual(['queues']);
    expect(ids(items.filter((item) => isNavItemActive(item, '/admin/cases/case-1')))).toEqual(['cases']);
  });

  it('normalizes trailing slashes and query strings in link targets', () => {
    expect(isNavItemActive({ id: 'offers', href: `${routes.app.offers()}/?invite=abc#main` }, '/app/offers/abc')).toBe(true);
  });

  it('does not treat the public root as a prefix of every page', () => {
    const home: NavItem = { id: 'home', href: routes.home(), exact: true };
    expect(isNavItemActive(home, routes.home())).toBe(true);
    expect(isNavItemActive(home, routes.pricing())).toBe(false);
  });
});
