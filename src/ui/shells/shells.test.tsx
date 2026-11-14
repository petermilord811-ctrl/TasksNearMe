/** @vitest-environment jsdom */
import type { ReactNode } from 'react';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CATEGORY_SLUGS, LEGAL_DOCS, routes, type AppShellHandlers, type Breadcrumb, type ShellViewer, type StaffViewer } from '@/contracts';
import { alexStaff, fakeHandler, jordanShell, mayaShell, morganStaff, priyaShell, publicViewer, rileyStaff } from '@/fixtures';
import uiMessages from '../../../messages/en/ui';
import { AdminShell } from './admin-shell';
import { AppShell } from './app-shell';
import { DetailPageShell } from './detail-page-shell';
import { PublicShell } from './public-shell';

const { pathname, push } = vi.hoisted(() => ({ pathname: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: pathname, useRouter: () => ({ push }) }));

const handlers: AppShellHandlers = {
  onModeChange: fakeHandler({ ok: true, code: 'updated' }, 0),
  onSignOut: fakeHandler({ ok: true, code: 'updated' }, 0),
};

function show(shell: ReactNode) {
  return render(<NextIntlClientProvider locale="en" messages={uiMessages}>{shell}</NextIntlClientProvider>);
}

beforeEach(() => pathname.mockReturnValue(routes.app.home()));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('shell landmarks', () => {
  const shells: [string, () => ReactNode][] = [
    ['public', () => <PublicShell viewer={publicViewer}><h1>Page content</h1></PublicShell>],
    ['app', () => <AppShell viewer={mayaShell} handlers={handlers}><h1>Page content</h1></AppShell>],
    ['admin', () => <AdminShell viewer={alexStaff} handlers={handlers}><h1>Page content</h1></AdminShell>],
    ['detail', () => <DetailPageShell title="Booking details" backHref={routes.app.bookings()}><p>Page content</p></DetailPageShell>],
  ];

  it.each(shells)('%s has a skip link targeting its focusable main landmark', (_, createShell) => {
    show(createShell());
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute('href', '#main');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
    expect(screen.getByRole('main')).toHaveAttribute('tabindex', '-1');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});

describe('PublicShell', () => {
  it('renders page content and signed-out account fallbacks while the viewer never resolves', async () => {
    const viewer = new Promise<ShellViewer>(() => {});
    show(<PublicShell viewer={viewer}><h1>Local help</h1></PublicShell>);
    expect(within(screen.getByRole('main')).getByRole('heading', { name: 'Local help' })).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', routes.signIn());
    expect(screen.getByRole('link', { name: 'Post a task' })).toHaveAttribute('href', routes.signIn(routes.app.newTask()));
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const menu = within(screen.getByRole('dialog', { name: 'Explore TasksNearMe' }));
    expect(menu.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', routes.signIn());
    expect(menu.getByRole('link', { name: 'Become a helper' })).toBeInTheDocument();
  });

  it('updates only the account links when the viewer resolves', async () => {
    let resolveViewer!: (viewer: ShellViewer) => void;
    const viewer = new Promise<ShellViewer>((resolve) => { resolveViewer = resolve; });
    show(<PublicShell viewer={viewer}><h1>Local help</h1></PublicShell>);
    const content = screen.getByRole('heading', { name: 'Local help' });
    await act(async () => { resolveViewer(mayaShell); await viewer; });
    expect(screen.getByRole('heading', { name: 'Local help' })).toBe(content);
    expect(screen.getByRole('link', { name: 'Go to the app' })).toHaveAttribute('href', routes.app.home());
    expect(screen.getByRole('link', { name: 'Post a task' })).toHaveAttribute('href', routes.app.newTask());
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const menu = within(screen.getByRole('dialog', { name: 'Explore TasksNearMe' }));
    expect(menu.getByRole('link', { name: 'Go to the app' })).toHaveAttribute('href', routes.app.home());
  });

  it.each([
    [publicViewer, 'Sign in', routes.signIn(), routes.signIn(routes.app.newTask())],
    [mayaShell, 'Go to the app', routes.app.home(), routes.app.newTask()],
    [rileyStaff, 'Staff area', routes.admin.home(), routes.app.newTask()],
  ] as const)('uses the correct account destination and posting CTA for $0.kind', (viewer, accountLabel, accountHref, postHref) => {
    show(<PublicShell viewer={viewer}><h1>Local help</h1></PublicShell>);
    expect(screen.getByRole('link', { name: accountLabel })).toHaveAttribute('href', accountHref);
    expect(screen.getByRole('link', { name: 'Post a task' })).toHaveAttribute('href', postHref);
  });

  it('includes every category and legal document with the contract destination', () => {
    show(<PublicShell viewer={publicViewer}><h1>Local help</h1></PublicShell>);
    const footer = within(screen.getByRole('contentinfo'));
    const categories = within(footer.getByRole('navigation', { name: 'Find local help' }));
    expect(categories.getAllByRole('link')).toHaveLength(CATEGORY_SLUGS.length);
    for (const category of CATEGORY_SLUGS) {
      expect(categories.getByRole('link', { name: uiMessages.shell.categories[category] })).toHaveAttribute('href', routes.category(category));
    }
    const legal = within(footer.getByRole('navigation', { name: 'Policies and terms' }));
    expect(legal.getAllByRole('link')).toHaveLength(LEGAL_DOCS.length);
    for (const doc of LEGAL_DOCS) {
      expect(legal.getByRole('link', { name: uiMessages.shell.legal[doc] })).toHaveAttribute('href', routes.legal(doc));
    }
    expect(footer.getByRole('link', { name: 'Austin' })).toHaveAttribute('href', routes.market());
    expect(footer.getByRole('link', { name: 'Trust & safety' })).toHaveAttribute('href', routes.trustAndSafety());
    expect(footer.getByRole('link', { name: 'Help' })).toHaveAttribute('href', routes.help());
  });

  it('uses an explicit current path to highlight the public navigation', () => {
    show(<PublicShell viewer={publicViewer} currentPath={routes.pricing()}><h1>Pricing</h1></PublicShell>);
    const nav = within(screen.getByRole('navigation', { name: 'Main navigation' }));
    expect(nav.getByRole('link', { name: 'Pricing' })).toHaveAttribute('aria-current', 'page');
    expect(nav.getByRole('link', { name: 'How it works' })).not.toHaveAttribute('aria-current');
  });

  it('puts public navigation and the account link in a labelled phone sheet', async () => {
    show(<PublicShell viewer={publicViewer}><h1>Local help</h1></PublicShell>);
    const trigger = screen.getByRole('button', { name: 'Open menu' });
    await userEvent.click(trigger);
    const menu = within(screen.getByRole('dialog', { name: 'Explore TasksNearMe' }));
    expect(menu.getByRole('link', { name: 'Become a helper' })).toHaveAttribute('href', routes.becomeAHelper());
    expect(menu.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', routes.signIn());
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

describe('AppShell', () => {
  it('keeps the flow page clear of mobile tab navigation', () => {
    show(<AppShell viewer={mayaShell} handlers={handlers} layout="flow"><h1>Post a task</h1></AppShell>);
    expect(screen.queryByRole('navigation', { name: 'App navigation' })).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toContainElement(screen.getByRole('heading', { name: 'Post a task' }));
  });

  it('marks Bookings active in both navigation layouts for a nested booking path', () => {
    show(<AppShell viewer={mayaShell} handlers={handlers} currentPath={routes.app.booking('abc')}><h1>Bookings</h1></AppShell>);
    for (const label of ['Main navigation', 'App navigation']) {
      const nav = within(screen.getByRole('navigation', { name: label }));
      expect(nav.getByRole('link', { name: 'Bookings' })).toHaveAttribute('aria-current', 'page');
      expect(nav.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
    }
  });

  it('falls back to usePathname when currentPath is omitted', () => {
    pathname.mockReturnValue(routes.app.findWork());
    show(<AppShell viewer={jordanShell} handlers={handlers}><h1>Find work</h1></AppShell>);
    const nav = within(screen.getByRole('navigation', { name: 'App navigation' }));
    expect(nav.getByRole('link', { name: 'Find work' })).toHaveAttribute('aria-current', 'page');
    expect(nav.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });

  it('announces the unread message and notification counts', () => {
    show(<AppShell viewer={mayaShell} handlers={handlers}><h1>Home</h1></AppShell>);
    expect(screen.getByRole('link', { name: 'Notifications, 3 unread notifications' })).toHaveAttribute('href', routes.app.notifications());
    for (const label of ['Main navigation', 'App navigation']) {
      const nav = within(screen.getByRole('navigation', { name: label }));
      expect(nav.getByRole('link', { name: 'Messages 2 unread messages' })).toHaveAttribute('href', routes.app.messages());
    }
  });

  it('shows helper setup only for an unfinished helper and omits zero-count badges from names', () => {
    show(<AppShell viewer={priyaShell} handlers={handlers}><h1>Home</h1></AppShell>);
    expect(screen.getByRole('link', { name: 'Finish setting up to start helping' })).toHaveAttribute('href', routes.app.helperOnboarding());
    expect(screen.getByRole('link', { name: 'Notifications' })).toHaveAttribute('href', routes.app.notifications());
    expect(within(screen.getByRole('navigation', { name: 'App navigation' })).getByRole('link', { name: 'Messages' })).toBeInTheDocument();
  });

  it.each([mayaShell, jordanShell])('omits helper setup for $displayName', (viewer) => {
    show(<AppShell viewer={viewer} handlers={handlers}><h1>Home</h1></AppShell>);
    expect(screen.queryByRole('link', { name: 'Finish setting up to start helping' })).not.toBeInTheDocument();
  });

  it('says bookings are paused while the outage switch is on, above the page content', () => {
    show(<AppShell viewer={mayaShell} handlers={handlers} notices={['bookings_paused']}><h1>Home</h1></AppShell>);
    const notice = screen.getByRole('region', { name: 'New bookings are paused for now' });
    expect(notice).toHaveTextContent('Bookings you already have go ahead as planned');
    expect(notice.compareDocumentPosition(screen.getByRole('heading', { name: 'Home' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows no notice when there is none', () => {
    show(<AppShell viewer={mayaShell} handlers={handlers}><h1>Home</h1></AppShell>);
    expect(screen.queryByRole('region', { name: 'New bookings are paused for now' })).not.toBeInTheDocument();
  });
});

describe('AdminShell', () => {
  it.each([
    [alexStaff, false],
    [morganStaff, false],
    [rileyStaff, true],
  ] as const)('renders role-specific navigation for $0.displayName', (viewer, isAdmin) => {
    show(<AdminShell viewer={viewer} handlers={handlers} currentPath={routes.admin.case('case-1')}><h1>Cases</h1></AdminShell>);
    const nav = within(screen.getByRole('navigation', { name: 'Staff navigation' }));
    expect(nav.getByRole('link', { name: 'Cases' })).toHaveAttribute('aria-current', 'page');
    expect(nav.getByRole('link', { name: 'Queues' })).not.toHaveAttribute('aria-current');
    if (isAdmin) {
      expect(nav.getByRole('link', { name: 'Config' })).toHaveAttribute('href', routes.admin.config());
      expect(nav.getByRole('link', { name: 'Staff' })).toHaveAttribute('href', routes.admin.staff());
    } else {
      expect(nav.queryByRole('link', { name: 'Config' })).not.toBeInTheDocument();
      expect(nav.queryByRole('link', { name: 'Staff' })).not.toBeInTheDocument();
    }
  });

  it('shows all supplied role badges and preserves breadcrumb destinations', () => {
    const viewer: StaffViewer = { ...morganStaff, roles: ['support_lead', 'finance'] };
    const breadcrumbs: Breadcrumb[] = [
      { label: 'Queues', href: routes.admin.home() },
      { label: 'Cases', href: routes.admin.cases() },
      { label: 'Desk assembly' },
    ];
    show(<AdminShell viewer={viewer} handlers={handlers} breadcrumbs={breadcrumbs}><h1>Case details</h1></AdminShell>);
    expect(screen.getByText('Staff area')).toBeInTheDocument();
    const roles = within(screen.getByRole('list', { name: 'Staff roles' }));
    expect(roles.getByText('Support lead')).toBeInTheDocument();
    expect(roles.getByText('Finance')).toBeInTheDocument();
    const crumbs = within(screen.getByRole('navigation', { name: 'Breadcrumbs' }));
    expect(crumbs.getByRole('link', { name: 'Queues' })).toHaveAttribute('href', routes.admin.home());
    expect(crumbs.getByRole('link', { name: 'Cases' })).toHaveAttribute('href', routes.admin.cases());
    expect(crumbs.getByText('Desk assembly')).toHaveAttribute('aria-current', 'page');
  });

  it('uses a labelled native GET search form with the query field name', async () => {
    show(<AdminShell viewer={alexStaff} handlers={handlers}><h1>Queues</h1></AdminShell>);
    const form = screen.getByRole('search', { name: 'Search users and bookings' });
    expect(form).toHaveAttribute('method', 'get');
    expect(form).toHaveAttribute('action', routes.admin.search(''));
    const input = within(form).getByRole('searchbox', { name: 'Search users and bookings' });
    expect(input).toHaveAccessibleDescription('Search by name or reference.');
    expect(input).toHaveAttribute('name', 'q');
    await userEvent.type(input, 'Maya R.');
    expect(new FormData(form as HTMLFormElement).get('q')).toBe('Maya R.');
    expect(within(form).getByRole('button', { name: 'Search' })).toHaveAttribute('type', 'submit');
  });

  it('makes staff navigation available in the phone sheet', async () => {
    show(<AdminShell viewer={rileyStaff} handlers={handlers}><h1>Queues</h1></AdminShell>);
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const sheet = within(screen.getByRole('dialog', { name: 'Staff navigation' }));
    expect(sheet.getByRole('link', { name: 'Config' })).toHaveAttribute('href', routes.admin.config());
    expect(sheet.getByRole('link', { name: 'Audit' })).toHaveAttribute('href', routes.admin.audit());
  });
});

describe('DetailPageShell', () => {
  it('provides a labelled back link, title, and action slot without app navigation', () => {
    show(<DetailPageShell title="Booking details" backHref={routes.app.bookings()} actions={<button type="button">Continue</button>}><p>Booking content</p></DetailPageShell>);
    expect(screen.getByRole('heading', { level: 1, name: 'Booking details' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go back' })).toHaveAttribute('href', routes.app.bookings());
    expect(within(screen.getByRole('main')).getByText('Booking content')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Page actions' })).getByRole('button', { name: 'Continue' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'App navigation' })).not.toBeInTheDocument();
  });

  it('omits an empty action region when no actions are supplied', () => {
    show(<DetailPageShell title="Booking details" backHref={routes.app.bookings()}><p>Booking content</p></DetailPageShell>);
    expect(screen.queryByRole('region', { name: 'Page actions' })).not.toBeInTheDocument();
  });
});
