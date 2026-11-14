/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { routes, STAFF_ROLES, type StaffRole } from '@/contracts';
import { alexStaff, jordanShell, mayaShell, morganStaff, rileyStaff } from '@/fixtures';
import { getAdminNav, getAppNav, getPublicNav, isNavItemActive, type NavItem } from './nav';

const ids = (items: NavItem[]) => items.map((item) => item.id);

describe('app navigation', () => {
  it('keeps the poster tabs and secondary links in the specified order', () => {
    const nav = getAppNav(mayaShell.mode);
    expect(ids(nav.primary)).toEqual(['home', 'tasks', 'bookings', 'messages', 'account']);
    expect(ids(nav.secondary)).toEqual(['community', 'savedSearches', 'helpers', 'saved', 'payments', 'support']);
    expect(nav.primary.map((item) => item.href)).toEqual([
      routes.app.home(), routes.app.tasks(), routes.app.bookings(), routes.app.messages(), routes.app.account(),
    ]);
    expect(nav.secondary.map((item) => item.href)).toEqual([
      routes.app.community(), routes.app.savedSearches(), routes.app.helpers(), routes.app.saved(), routes.app.payments(), routes.app.support(),
    ]);
  });

  it('keeps the helper tabs and secondary links in the specified order', () => {
    const nav = getAppNav(jordanShell.mode);
    expect(ids(nav.primary)).toEqual(['home', 'findWork', 'bookings', 'messages', 'earnings']);
    expect(ids(nav.secondary)).toEqual(['community', 'savedSearches', 'offers', 'availability', 'clients', 'rewards', 'support']);
    expect(nav.primary.map((item) => item.href)).toEqual([
      routes.app.home(), routes.app.findWork(), routes.app.bookings(), routes.app.messages(), routes.app.earnings(),
    ]);
    expect(nav.secondary.map((item) => item.href)).toEqual([
      routes.app.community(), routes.app.savedSearches(), routes.app.offers(), routes.app.availability(), routes.app.clients(), routes.app.rewards(), routes.app.support(),
    ]);
  });
});

describe('admin navigation', () => {
  const standard = ['queues', 'cases', 'reports', 'users', 'verifications', 'responseTimes', 'savedReplies', 'bookings', 'payments', 'rewards', 'metrics', 'beta'];
  // The audit log is for admins and support leads (UI-033).
  const withAudit = [...standard, 'audit'];

  it('shows the staff navigation for Alex P. (an agent) and Morgan L. (a lead, with the audit log)', () => {
    expect(ids(getAdminNav(alexStaff.roles))).toEqual(standard);
    expect(ids(getAdminNav(morganStaff.roles))).toEqual(withAudit);
  });

  it.each(STAFF_ROLES.filter((role) => role !== 'admin'))('omits Config and Staff for %s', (role) => {
    expect(ids(getAdminNav([role]))).toEqual(role === 'support_lead' ? withAudit : role === 'finance' ? [...standard, 'webhooks'] : standard);
  });

  it('shows Config and Staff in their specified positions for an admin', () => {
    expect(ids(getAdminNav(rileyStaff.roles))).toEqual([
      'queues', 'cases', 'reports', 'users', 'verifications', 'responseTimes', 'savedReplies', 'bookings', 'payments', 'rewards', 'metrics', 'beta', 'webhooks', 'config', 'audit', 'staff',
    ]);
    expect(getAdminNav(rileyStaff.roles).map((item) => item.href)).toEqual([
      routes.admin.home(), routes.admin.cases(), routes.admin.reports(), routes.admin.users(), routes.admin.verifications(),
      routes.admin.responseTimes(), routes.admin.savedReplies(), routes.admin.bookings(), routes.admin.payments(), routes.admin.rewards(), routes.admin.metrics(), routes.admin.beta(), routes.admin.webhooks(), routes.admin.config(),
      routes.admin.audit(), routes.admin.staff(),
    ]);
  });

  it('supports multiple roles without duplicating navigation', () => {
    const roles: StaffRole[] = ['support_lead', 'admin', 'finance'];
    expect(getAdminNav(roles)).toEqual(getAdminNav(['admin']));
    expect(ids(getAdminNav(['support_agent', 'finance']))).toEqual([...standard, 'webhooks']);
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
