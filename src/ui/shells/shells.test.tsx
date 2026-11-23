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

const { pathname, push, layoutSegment } = vi.hoisted(() => ({ pathname: vi.fn(), push: vi.fn(), layoutSegment: vi.fn(() => '(main)') }));
vi.mock('next/navigation', () => ({ usePathname: pathname, useRouter: () => ({ push }), useSelectedLayoutSegment: () => layoutSegment() }));

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

  it.each(shells.slice(0, 2))('%s has one banner landmark, its top bar', (_, createShell) => {
    show(createShell());
    expect(screen.getAllByRole('banner')).toHaveLength(1);
  });
});

describe('PublicShell', () => {
  it('renders page content and signed-out account fallbacks while the viewer never resolves', async () => {
    const viewer = new Promise<ShellViewer>(() => {});
    show(<PublicShell viewer={viewer}><h1>Local help</h1></PublicShell>);
    expect(within(screen.getByRole('main')).getByRole('heading', { name: 'Local help' })).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', routes.signIn());
    // Creating an account has its own page (completion plan 9.6).
    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', routes.signUp());
    expect(screen.getByRole('link', { name: 'Post a task' })).toHaveAttribute('href', routes.postTask());
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const menu = within(screen.getByRole('dialog', { name: 'Explore TasksNearMe' }));
    expect(menu.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', routes.signIn());
    expect(menu.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', routes.signUp());
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
    expect(screen.queryByRole('link', { name: 'Sign up' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Post a task' })).toHaveAttribute('href', routes.app.newTask());
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const menu = within(screen.getByRole('dialog', { name: 'Explore TasksNearMe' }));
    expect(menu.getByRole('link', { name: 'Go to the app' })).toHaveAttribute('href', routes.app.home());
  });

  it.each([
    [publicViewer, 'Sign in', routes.signIn(), routes.postTask()],
    [mayaShell, 'Go to the app', routes.app.home(), routes.app.newTask()],
    [rileyStaff, 'Staff area', routes.admin.home(), routes.app.newTask()],
  ] as const)('uses the correct account destination and posting CTA for $0.kind', (viewer, accountLabel, accountHref, postHref) => {
    show(<PublicShell viewer={viewer}><h1>Local help</h1></PublicShell>);
    expect(screen.getByRole('link', { name: accountLabel })).toHaveAttribute('href', accountHref);
    expect(screen.getByRole('link', { name: 'Post a task' })).toHaveAttribute('href', postHref);
  });

  it('gives sign-in and sign-up a minimal footer: the legal links and the language only (audit M45)', () => {
    show(<PublicShell viewer={publicViewer} variant="minimal"><h1>Sign in</h1></PublicShell>);
    const footer = within(screen.getByRole('contentinfo'));
    expect(footer.getAllByRole('link').filter((link) => LEGAL_DOCS.some((doc) => link.getAttribute('href') === routes.legal(doc)))).toHaveLength(LEGAL_DOCS.length);
    expect(footer.queryByRole('navigation', { name: 'Find local help' })).toBeNull();
    expect(footer.queryByRole('link', { name: /^Gainesville, FL/ })).toBeNull();
  });

  it('keeps Spanish pages on Spanish addresses (search engines follow them to Spanish pages)', () => {
    render(<NextIntlClientProvider locale="es" messages={uiMessages}><PublicShell viewer={publicViewer}><h1>Ayuda local</h1></PublicShell></NextIntlClientProvider>);
    const footer = within(screen.getByRole('contentinfo'));
    // The desktop column and the phone row carry the same links (CSS shows one of them).
    for (const nav of footer.getAllByRole('navigation', { name: 'Find local help' })) {
      expect(within(nav).getByRole('link', { name: uiMessages.shell.categories['yard-cleanup'] })).toHaveAttribute('href', `/es${routes.category('yard-cleanup')}`);
    }
    expect(footer.getByRole('link', { name: uiMessages.shell.footer.cityNext })).toHaveAttribute('href', `/es${routes.waitlist()}`);
    expect(screen.getAllByRole('link', { name: uiMessages.shell.homeLink })[0]).toHaveAttribute('href', '/es');
  });

  it('includes every category and legal document with the contract destination', () => {
    show(<PublicShell viewer={publicViewer}><h1>Local help</h1></PublicShell>);
    const footer = within(screen.getByRole('contentinfo'));
    // Columns from the tablet width up, rows that open in place on phones (audit M45): CSS shows one of the two.
    const groups = footer.getAllByRole('navigation', { name: 'Find local help' });
    expect(groups).toHaveLength(2);
    for (const group of groups) {
      const categories = within(group);
      expect(categories.getAllByRole('link')).toHaveLength(CATEGORY_SLUGS.length);
      for (const category of CATEGORY_SLUGS) {
        expect(categories.getByRole('link', { name: uiMessages.shell.categories[category] })).toHaveAttribute('href', routes.category(category));
      }
    }
    const legal = within(footer.getByRole('navigation', { name: 'Policies and terms' }));
    expect(legal.getAllByRole('link')).toHaveLength(LEGAL_DOCS.length);
    for (const doc of LEGAL_DOCS) {
      expect(legal.getByRole('link', { name: uiMessages.shell.legal[doc] })).toHaveAttribute('href', routes.legal(doc));
    }
    // The first city (Gainesville since 2026-11-17).
    expect(footer.getByRole('link', { name: /^Gainesville, FL/ })).toHaveAttribute('href', routes.market());
    // Opening city by city: somewhere else, the city list.
    expect(footer.getByRole('link', { name: uiMessages.shell.footer.cityNext })).toHaveAttribute('href', routes.waitlist());
    for (const link of footer.getAllByRole('link', { name: 'Trust & safety' })) expect(link).toHaveAttribute('href', routes.trustAndSafety());
    for (const link of footer.getAllByRole('link', { name: 'Help' })) expect(link).toHaveAttribute('href', routes.help());
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
  it('takes its layout from the route group: (flow) without the phone dock, (main) with it', () => {
    layoutSegment.mockReturnValue('(flow)');
    const { container, unmount } = show(<AppShell viewer={mayaShell} handlers={handlers}><h1>A conversation</h1></AppShell>);
    expect(container.querySelector('[data-app-shell]')?.getAttribute('data-app-shell')).toBe('flow');
    expect(screen.queryByRole('navigation', { name: 'App navigation' })).not.toBeInTheDocument();
    unmount();
    layoutSegment.mockReturnValue('(main)');
    const main = show(<AppShell viewer={mayaShell} handlers={handlers}><h1>Messages</h1></AppShell>);
    expect(main.container.querySelector('[data-app-shell]')?.getAttribute('data-app-shell')).toBe('tabs');
    expect(screen.getByRole('navigation', { name: 'App navigation' })).toBeInTheDocument();
    // A screen that fixes its layout (previews) keeps it, whatever the group.
    main.unmount();
    layoutSegment.mockReturnValue('(flow)');
    show(<AppShell viewer={mayaShell} handlers={handlers} layout="tabs"><h1>Preview</h1></AppShell>);
    expect(screen.getByRole('navigation', { name: 'App navigation' })).toBeInTheDocument();
    layoutSegment.mockReturnValue('(main)');
  });

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

  it('announces the notification count; Messages is the chat button, not a tab (2026-11-22)', () => {
    show(<AppShell viewer={mayaShell} handlers={handlers} chat={<button type="button">Messages, 2 unread</button>}><h1>Home</h1></AppShell>);
    expect(screen.getByRole('link', { name: 'Notifications, 3 unread notifications' })).toHaveAttribute('href', routes.app.notifications());
    for (const label of ['Main navigation', 'App navigation']) {
      const nav = within(screen.getByRole('navigation', { name: label }));
      expect(nav.queryByRole('link', { name: /^Messages/ })).toBeNull();
    }
    expect(screen.getByRole('button', { name: 'Messages, 2 unread' })).toBeInTheDocument();
  });

  it('puts the search bar and, for a helper not verified yet, the reminder where the setup bar was (owner, 2026-11-23)', async () => {
    pathname.mockReturnValue(routes.app.findWork());
    show(<AppShell viewer={priyaShell} handlers={handlers}><h1>Find work</h1></AppShell>);
    expect(screen.getByRole('search', { name: 'Search TasksNearMe' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Search TasksNearMe' })).toBeInTheDocument();
    // A reminder, not a full-width link: it opens the checks, each one a link, in any order.
    expect(screen.queryByRole('link', { name: 'Finish setting up to start helping' })).not.toBeInTheDocument();
    const reminder = screen.getByRole('button', { name: 'Become a verified helper 1 of 5 checks' });
    await userEvent.click(reminder);
    expect(await screen.findByRole('link', { name: /Home address/ })).toHaveAttribute('href', routes.app.helperOnboarding('address'));
    expect(screen.getByRole('link', { name: /Background check/ })).toHaveAttribute('href', routes.app.helperOnboarding('background'));
    expect(screen.getByRole('link', { name: 'Continue' })).toHaveAttribute('href', routes.app.helperOnboarding('address'));
    expect(screen.getByRole('link', { name: 'Notifications' })).toHaveAttribute('href', routes.app.notifications());
  });

  it('keeps flow pages focused: no search bar or reminder (posting, a booking, helper setup)', () => {
    layoutSegment.mockReturnValue('(flow)');
    pathname.mockReturnValue(routes.app.helperOnboarding('phone'));
    show(<AppShell viewer={priyaShell} handlers={handlers}><h1>Phone</h1></AppShell>);
    expect(screen.queryByRole('search')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Become a verified helper/ })).not.toBeInTheDocument();
    layoutSegment.mockReturnValue('(main)');
  });

  it('leaves both out on Home, whose own search and "Needs your attention" lead with them (plan 9.9)', () => {
    show(<AppShell viewer={priyaShell} handlers={handlers}><h1>Home</h1></AppShell>);
    expect(screen.queryByRole('search')).not.toBeInTheDocument();
    cleanup();
    pathname.mockReturnValue(`/es${routes.app.home()}`);
    show(<AppShell viewer={priyaShell} handlers={handlers}><h1>Inicio</h1></AppShell>);
    expect(screen.queryByRole('search')).not.toBeInTheDocument();
  });

  it.each([mayaShell, jordanShell])('gives $displayName the search bar without a reminder', (viewer) => {
    pathname.mockReturnValue(routes.app.bookings());
    show(<AppShell viewer={viewer} handlers={handlers}><h1>Bookings</h1></AppShell>);
    expect(screen.getByRole('search', { name: 'Search TasksNearMe' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Become a verified helper/ })).not.toBeInTheDocument();
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
    // Every staff role reads the markets on the config page (plan 8.2); Staff is for admins.
    expect(nav.getByRole('link', { name: 'Config' })).toHaveAttribute('href', routes.admin.config());
    if (isAdmin) expect(nav.getByRole('link', { name: 'Staff' })).toHaveAttribute('href', routes.admin.staff());
    else expect(nav.queryByRole('link', { name: 'Staff' })).not.toBeInTheDocument();
  });

  it('lists Live chat for the roles that answer it, with how many wait said in its name (2026-11-22)', () => {
    show(<AdminShell viewer={{ ...alexStaff, liveWaiting: 2 }} handlers={handlers} currentPath={routes.admin.liveChat()}><h1>Live chat</h1></AdminShell>);
    const nav = within(screen.getByRole('navigation', { name: 'Staff navigation' }));
    const live = nav.getByRole('link', { name: 'Live chat, 2 waiting' });
    expect(live).toHaveAttribute('href', routes.admin.liveChat());
    expect(live).toHaveAttribute('aria-current', 'page');
    // No label that says something other than what shows (axe: label-content-name-mismatch).
    expect(live).not.toHaveAttribute('aria-label');
    cleanup();
    show(<AdminShell viewer={{ ...alexStaff, roles: ['finance'] }} handlers={handlers}><h1>Queues</h1></AdminShell>);
    expect(within(screen.getByRole('navigation', { name: 'Staff navigation' })).queryByRole('link', { name: /^Live chat/ })).not.toBeInTheDocument();
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
    const form = screen.getByRole('search', { name: 'Search people' });
    expect(form).toHaveAttribute('method', 'get');
    expect(form).toHaveAttribute('action', routes.admin.search(''));
    // The People page's search, which exists (the old /admin/search had no page).
    expect(routes.admin.search('')).toBe('/admin/users');
    const input = within(form).getByRole('searchbox', { name: 'Search people' });
    expect(input).toHaveAccessibleDescription('Search by name or email.');
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
