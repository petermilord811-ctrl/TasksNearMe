/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routes, type AppShellHandlers } from '@/contracts';
import { deskBeforeNoShowPosterActions, fakeHandler, mayaShell } from '@/fixtures';
import { ActionBar } from '@/ui/components/actions/action-bar';
import messages from '../../../messages/en/ui';
import { AppShell } from './app-shell';

vi.mock('next/navigation', () => ({ usePathname: () => routes.app.bookings(), useRouter: () => ({ push: vi.fn() }), useSelectedLayoutSegment: () => '(main)' }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const handlers: AppShellHandlers = {
  onModeChange: fakeHandler({ ok: true, code: 'updated' }, 0),
  onSignOut: fakeHandler({ ok: true, code: 'updated' }, 0),
};
let navigationHeight = 96;
let notifyResize = () => {};
const observe = vi.fn();
const disconnect = vi.fn();
/** Which observer watches which element (the shell has others: the top bar, the nav pills). */
const watchers = new Map<Element, { disconnected: boolean }>();

beforeEach(() => {
  navigationHeight = 96;
  watchers.clear();
  vi.stubGlobal('ResizeObserver', class {
    private state = { disconnected: false };
    constructor(callback: () => void) { notifyResize = callback; }
    observe = (target: Element, options?: ResizeObserverOptions) => {
      watchers.set(target, this.state);
      observe(target, options);
    };
    disconnect = () => {
      this.state.disconnected = true;
      disconnect();
    };
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return { height: this.hasAttribute('data-mobile-bottom-nav') ? navigationHeight : 0 } as DOMRect;
  });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function example(layout: 'tabs' | 'flow' = 'tabs', position: 'mobileFixed' | 'sticky' = 'mobileFixed') {
  return <NextIntlClientProvider locale="en" messages={messages}>
    <AppShell viewer={mayaShell} handlers={handlers} layout={layout}>
      <h1>Booking</h1>
      <ActionBar actions={deskBeforeNoShowPosterActions} onAction={fakeHandler({ ok: true, code: 'sent' }, 0)} mobileFixed={position === 'mobileFixed'} sticky={position === 'sticky'} />
    </AppShell>
  </NextIntlClientProvider>;
}

describe('mobile navigation clearance', () => {
  it.each(['mobileFixed', 'sticky'] as const)('connects the %s action offset and page clearance to the measured tab bar', (position) => {
    const { container } = render(example('tabs', position));
    const shell = container.querySelector<HTMLElement>('[data-app-shell]')!;
    const nav = container.querySelector<HTMLElement>('[data-mobile-bottom-nav]')!;
    const bar = screen.getByRole('group', { name: messages.feedback.actionBar }).parentElement!;

    expect(observe).toHaveBeenCalledWith(nav, { box: 'border-box' });
    expect(shell.style.getPropertyValue('--app-bottom-nav-height')).toBe('96px');
    expect(shell).toHaveClass('max-lg:[--app-bottom-offset:var(--app-bottom-nav-height)]', 'pb-[var(--app-bottom-offset)]');
    expect(bar).toHaveClass(position === 'mobileFixed' ? 'max-lg:bottom-app-navigation' : 'bottom-app-navigation');

    // A taller border box includes wrapped labels and safe-area padding.
    navigationHeight = 130;
    act(notifyResize);
    expect(shell.style.getPropertyValue('--app-bottom-nav-height')).toBe('130px');
    expect(document.documentElement.style.getPropertyValue('--app-bottom-nav-height')).toBe('');
  });

  it('updates on viewport resizing and releases the measurement when tabs disappear', () => {
    const { container, rerender } = render(example());
    const shell = container.querySelector<HTMLElement>('[data-app-shell]')!;
    const nav = container.querySelector<HTMLElement>('[data-mobile-bottom-nav]')!;
    navigationHeight = 116;
    fireEvent(window, new Event('resize'));
    expect(shell.style.getPropertyValue('--app-bottom-nav-height')).toBe('116px');

    rerender(example('flow'));
    expect(screen.queryByRole('navigation', { name: messages.shell.mobileNavigation })).not.toBeInTheDocument();
    expect(shell.style.getPropertyValue('--app-bottom-nav-height')).toBe('');
    expect(shell).toHaveClass('[--app-bottom-offset:0px]');
    expect(shell).not.toHaveClass('max-lg:[--app-bottom-offset:var(--app-bottom-nav-height)]');
    expect(watchers.get(nav)?.disconnected).toBe(true);
  });

  it('keeps More sheets outside the shell offset and restores focus on close', async () => {
    const { container } = render(example());
    const shell = container.querySelector<HTMLElement>('[data-app-shell]')!;
    const more = screen.getByRole('button', { name: messages.feedback.more });
    await userEvent.click(more);
    const sheet = screen.getByRole('dialog', { name: messages.feedback.moreTitle });
    expect(shell).not.toContainElement(sheet);
    expect(sheet.closest('[data-app-shell]')).toBeNull();
    expect(shell.style.getPropertyValue('--app-bottom-nav-height')).toBe('96px');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(more).toHaveFocus();
  });
});
