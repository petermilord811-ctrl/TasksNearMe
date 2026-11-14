/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionResult } from '@/contracts';
import uiMessages from '../../../messages/en/ui';
import { LanguageSwitch } from './language-switch';

const { refresh, replace, push, pathname } = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn(), pathname: { current: '/pricing' } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, replace, push }), usePathname: () => pathname.current }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  pathname.current = '/pricing';
  document.documentElement.removeAttribute('data-language-switch');
});

function show(props: Partial<Parameters<typeof LanguageSwitch>[0]> = {}) {
  return render(<NextIntlClientProvider locale="en" messages={uiMessages}><LanguageSwitch label="Language" {...props} /></NextIntlClientProvider>);
}

describe('LanguageSwitch', () => {
  it("links to this page in each language, the current one marked, each named with its code and in itself", () => {
    show();
    const nav = within(screen.getByRole('navigation', { name: 'Language' }));
    const english = nav.getByRole('link', { name: 'EN, English' });
    const spanish = nav.getByRole('link', { name: 'ES, Español' });
    expect(english).toHaveAttribute('href', '/en/pricing');
    expect(english).toHaveAttribute('aria-current', 'true');
    expect(spanish).toHaveAttribute('href', '/es/pricing');
    expect(spanish).toHaveAttribute('lang', 'es');
    expect(spanish).not.toHaveAttribute('aria-current');
  });

  it('switches in place: saves the choice, veils the page, and refreshes it without a reload', async () => {
    let finish: (result: ActionResult) => void = () => {};
    const onSwitch = vi.fn(() => new Promise<ActionResult>((resolve) => { finish = resolve; }));
    show({ onSwitch });
    fireEvent.click(screen.getByRole('link', { name: 'ES, Español' }));
    expect(onSwitch).toHaveBeenCalledExactlyOnceWith({ locale: 'es' });
    expect(document.documentElement).toHaveAttribute('data-language-switch');
    // The knob moves to the pick at once, before the page comes back.
    expect(screen.getByRole('link', { name: 'ES, Español' })).toHaveAttribute('aria-current', 'true');
    await act(async () => finish({ ok: true, code: 'updated' }));
    expect(refresh).toHaveBeenCalledOnce();
    expect(replace).not.toHaveBeenCalled();
    expect(document.documentElement).not.toHaveAttribute('data-language-switch');
  });

  it('leaves an explicit /es address for the plain one, which now carries the choice', async () => {
    pathname.current = '/es/pricing';
    const onSwitch = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated' }));
    render(<NextIntlClientProvider locale="es" messages={uiMessages}><LanguageSwitch label="Language" onSwitch={onSwitch} /></NextIntlClientProvider>);
    await act(async () => fireEvent.click(screen.getByRole('link', { name: 'EN, English' })));
    expect(onSwitch).toHaveBeenCalledExactlyOnceWith({ locale: 'en' });
    expect(replace).toHaveBeenCalledExactlyOnceWith('/pricing', { scroll: false });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('goes by the explicit address when the choice could not be saved', async () => {
    const onSwitch = vi.fn(async (): Promise<ActionResult> => ({ ok: false, code: 'unknown' }));
    show({ onSwitch });
    await act(async () => fireEvent.click(screen.getByRole('link', { name: 'ES, Español' })));
    expect(replace).toHaveBeenCalledExactlyOnceWith('/es/pricing', { scroll: false });
  });

  it('does nothing for the current language, and leaves new-tab clicks to the browser', () => {
    const onSwitch = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated' }));
    show({ onSwitch });
    fireEvent.click(screen.getByRole('link', { name: 'EN, English' }));
    fireEvent.click(screen.getByRole('link', { name: 'ES, Español' }), { metaKey: true });
    expect(onSwitch).not.toHaveBeenCalled();
  });

  it('reads as "English · Español" in the footer', () => {
    show({ variant: 'inline' });
    const nav = within(screen.getByRole('navigation', { name: 'Language' }));
    expect(nav.getAllByRole('link').map((link) => link.textContent)).toEqual(['English', 'Español']);
  });
});
