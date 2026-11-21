/** @vitest-environment jsdom */
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes, type ActionHandler, type ActionResult, type SignedInViewer, type StaffViewer } from '@/contracts';
import { alexStaff, jordanShell, mayaShell } from '@/fixtures';
import uiMessages from '../../../messages/en/ui';
import feedback from '../../../messages/en/ui/feedback.json';
import { AccountMenu } from './account-menu';

const { push, toastSuccess, toastError } = vi.hoisted(() => ({ push: vi.fn(), toastSuccess: vi.fn(), toastError: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }), usePathname: () => '/app' }));
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function show(viewer: SignedInViewer | StaffViewer, onSignOut: ActionHandler = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated' }))) {
  return render(<NextIntlClientProvider locale="en" messages={uiMessages}><AccountMenu viewer={viewer} onSignOut={onSignOut} /></NextIntlClientProvider>);
}

async function openMenu() {
  // Radix keyboard opening also verifies the complete keyboard path.
  await userEvent.tab();
  await userEvent.keyboard('{Enter}');
  return screen.findByRole('menu');
}

describe('AccountMenu', () => {
  it.each([
    { viewer: mayaShell, tools: [['Find helpers', routes.app.helpers()], ['Saved helpers', routes.app.saved()], ['Saved searches', routes.app.savedSearches()]] },
    { viewer: jordanShell, tools: [['Offers', routes.app.offers()], ['Availability', routes.app.availability()], ['Earnings', routes.app.earnings()], ['My clients', routes.app.clients()], ['Rewards', routes.app.rewards()], ['Saved searches', routes.app.savedSearches()]] },
  ])('shows the $viewer.mode tools (below the rail’s width) and the account’s pages, once each', async ({ viewer, tools }) => {
    show(viewer);
    const menu = await openMenu();
    for (const [name, href] of tools) {
      const tool = within(menu).getByRole('menuitem', { name });
      expect(tool).toHaveAttribute('href', href);
      // Wide screens have them on the rail instead.
      expect(tool).toHaveClass('lg:hidden');
    }
    expect(within(menu).getByRole('menuitem', { name: 'Account' })).toHaveAttribute('href', routes.app.account());
    expect(within(menu).getByRole('menuitem', { name: 'Payments' })).toHaveAttribute('href', routes.app.payments());
    expect(within(menu).getByRole('menuitem', { name: 'Support' })).toHaveAttribute('href', routes.app.support());
    expect(within(menu).queryByRole('menuitem', { name: 'Neighborhood' })).not.toBeInTheDocument();
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([...tools.map(([name]) => name), 'Account', 'Payments', 'Support', 'Switch to dark mode', 'Español', 'Sign out']);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: `${viewer.initials}, account menu for ${viewer.displayName}` })).toHaveFocus();
  });

  it('switches the mode from the menu on phones, where the bar has no switch (audit M38)', async () => {
    const onModeChange = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated', redirectTo: routes.app.helperOnboarding() }));
    render(<NextIntlClientProvider locale="en" messages={uiMessages}><AccountMenu viewer={mayaShell} onSignOut={vi.fn()} onModeChange={onModeChange} /></NextIntlClientProvider>);
    const menu = await openMenu();
    const item = within(menu).getByRole('menuitem', { name: 'Switch to “I can help”' });
    // Only below `sm`: wider bars have the switch itself.
    expect(item).toHaveClass('sm:hidden');
    await userEvent.click(item);
    expect(onModeChange).toHaveBeenCalledExactlyOnceWith({ mode: 'helper' });
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith(routes.app.helperOnboarding()));
    expect(toastSuccess).toHaveBeenCalledWith('You’re in helper mode');
  });

  it('switches the theme and the language from the menu (the bar has no room for them on phones)', async () => {
    const onSwitchLanguage = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated' }));
    render(<NextIntlClientProvider locale="en" messages={uiMessages}><AccountMenu viewer={mayaShell} onSignOut={vi.fn()} onSwitchLanguage={onSwitchLanguage} /></NextIntlClientProvider>);
    let menu = await openMenu();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Switch to dark mode' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    await userEvent.click(screen.getByRole('button', { name: `${mayaShell.initials}, account menu for ${mayaShell.displayName}` }));
    menu = await screen.findByRole('menu');
    const spanish = within(menu).getByRole('menuitem', { name: 'Español' });
    expect(spanish).toHaveAttribute('lang', 'es');
    await userEvent.click(spanish);
    expect(onSwitchLanguage).toHaveBeenCalledExactlyOnceWith({ locale: 'es' });
    document.documentElement.removeAttribute('data-theme');
  });

  it('keeps the staff menu limited to sign out', async () => {
    show(alexStaff);
    const menu = await openMenu();
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(1);
    expect(within(menu).getByRole('menuitem', { name: 'Sign out' })).toBeVisible();
  });

  it('waits for sign-out success before going home and prevents duplicate submissions', async () => {
    let finish: (result: ActionResult) => void = () => {};
    const handler = vi.fn(() => new Promise<ActionResult>((resolve) => { finish = resolve; }));
    show(mayaShell, handler);
    const menu = await openMenu();
    await userEvent.dblClick(within(menu).getByRole('menuitem', { name: 'Sign out' }));
    expect(handler).toHaveBeenCalledExactlyOnceWith();
    expect(within(menu).getByRole('menuitem', { name: 'Signing out…' })).toHaveAttribute('aria-disabled', 'true');
    expect(within(menu).getByRole('menuitem', { name: 'Signing out…' })).toHaveAttribute('aria-busy', 'true');
    expect(push).not.toHaveBeenCalled();
    await act(async () => finish({ ok: true, code: 'updated' }));
    expect(push).toHaveBeenCalledExactlyOnceWith(routes.home());
    expect(toastSuccess).toHaveBeenCalledWith(feedback.success.updated);
  });

  it('preserves error feedback outside the closed menu and does not navigate', async () => {
    show(alexStaff, vi.fn(async (): Promise<ActionResult> => ({ ok: false, code: 'unknown' })));
    const menu = await openMenu();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Sign out' }));
    expect(await screen.findByText(feedback.error.unknown)).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(feedback.error.unknown);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(toastError).toHaveBeenCalledWith(feedback.error.unknown);
    expect(push).not.toHaveBeenCalled();
  });

  it('handles a rejected sign-out promise', async () => {
    show(mayaShell, vi.fn(async () => { throw new Error('Offline'); }));
    const menu = await openMenu();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Sign out' }));
    expect(await screen.findByText(feedback.error.unknown)).toBeVisible();
    expect(push).not.toHaveBeenCalled();
  });

  it('takes this device off the account before signing out, so the next person here gets none of this one’s notifications (sweep MN5)', async () => {
    const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/menu', unsubscribe: vi.fn(async () => true) };
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration: async () => ({ pushManager: { getSubscription: async () => subscription } }) } });
    try {
      const order: string[] = [];
      const onForgetPushDevice = vi.fn(async (): Promise<ActionResult> => { order.push('forget'); return { ok: true, code: 'updated' }; });
      const onSignOut = vi.fn(async (): Promise<ActionResult> => { order.push('sign out'); return { ok: true, code: 'updated' }; });
      render(<NextIntlClientProvider locale="en" messages={uiMessages}><AccountMenu viewer={mayaShell} onSignOut={onSignOut} onForgetPushDevice={onForgetPushDevice} /></NextIntlClientProvider>);
      const menu = await openMenu();
      await userEvent.click(within(menu).getByRole('menuitem', { name: 'Sign out' }));
      await waitFor(() => expect(push).toHaveBeenCalledExactlyOnceWith(routes.home()));
      expect(onForgetPushDevice).toHaveBeenCalledExactlyOnceWith({ endpoint: subscription.endpoint });
      expect(subscription.unsubscribe).toHaveBeenCalledOnce();
      expect(order).toEqual(['forget', 'sign out']);
    } finally {
      Reflect.deleteProperty(navigator, 'serviceWorker');
    }
  });

  it('honors an explicit success redirect', async () => {
    show(alexStaff, vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated', redirectTo: routes.signIn() })));
    const menu = await openMenu();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Sign out' }));
    expect(push).toHaveBeenCalledExactlyOnceWith(routes.signIn());
  });
});
