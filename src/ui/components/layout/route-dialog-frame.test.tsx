/** @vitest-environment jsdom */
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { useForm } from 'react-hook-form';
import type { ActionResult } from '@/contracts';
import messages from '../../../../messages/en/ui';
import { useFormAction } from '@/ui/lib/use-form-action';
import { useRouteDialog, type RouteDialogControls } from '@/ui/lib/route-dialog';
import { RouteDialogFrame } from './route-dialog-frame';
import { RouteDialogBody, RouteDialogHeader } from './route-dialog';

const navigation = vi.hoisted(() => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
const toasts = vi.hoisted(() => ({ success: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
vi.mock('sonner', () => ({ toast: toasts }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function Controls({ result }: { result: ActionResult }) {
  const dialog = useRouteDialog();
  return <>
    <button type="button" onClick={() => dialog?.close()}>Cancel</button>
    <button type="button" onClick={() => dialog?.finish(result, 'Review sent.')}>Finish</button>
  </>;
}

/** A form on the shared hook, as the review form is: in a route dialog its redirect closes the dialog instead. */
function HookForm({ result }: { result: ActionResult }) {
  const form = useForm<{ body: string }>({ defaultValues: { body: '' } });
  const action = useFormAction(form, { successToast: 'Saved it.' });
  return <button type="button" onClick={() => void action.run(async () => result, { body: '' })}>Send</button>;
}

function mount(children: React.ReactNode) {
  return render(<NextIntlClientProvider locale="en" messages={messages}>
    <RouteDialogFrame>
      <RouteDialogHeader title="Review Jordan T." description="Assemble a desk" />
      <RouteDialogBody>{children}</RouteDialogBody>
    </RouteDialogFrame>
  </NextIntlClientProvider>);
}

describe('RouteDialogFrame', () => {
  it('is a modal dialog named by its h1 title and described by its subtitle', () => {
    mount(<Controls result={{ ok: true, code: 'submitted' }} />);
    const dialog = screen.getByRole('dialog', { name: 'Review Jordan T.' });
    expect(dialog).toHaveAccessibleDescription('Assemble a desk');
    expect(screen.getByRole('heading', { level: 1, name: 'Review Jordan T.' })).toBeInTheDocument();
    // The dialog takes focus itself, not its first field (a phone's keyboard stays closed).
    expect(dialog).toHaveFocus();
  });

  it('closes by going back: the X, Escape and a Cancel in the page', () => {
    mount(<Controls result={{ ok: true, code: 'submitted' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(navigation.back).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(navigation.back).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(navigation.back).toHaveBeenCalledTimes(3);
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('finishes with a toast, goes back, and refreshes the page underneath once it is back', () => {
    mount(<Controls result={{ ok: true, code: 'submitted', redirectTo: '/app/bookings/bkg_desk' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    expect(toasts.success).toHaveBeenCalledWith('Review sent.');
    expect(navigation.back).toHaveBeenCalledTimes(1);
    expect(navigation.push).not.toHaveBeenCalled();
    expect(navigation.refresh).not.toHaveBeenCalled();
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(navigation.refresh).toHaveBeenCalledTimes(1);
    // Only once: a later Back or Forward is the person's own.
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(navigation.refresh).toHaveBeenCalledTimes(1);
  });

  it('can\'t be closed while busy (a payment on its way), and closes again once it isn\'t', () => {
    function Paying({ busy }: { busy: boolean }) {
      const dialog = useRouteDialog();
      useEffect(() => { dialog?.setBusy(busy); }, [dialog, busy]);
      return null;
    }
    const view = mount(<Paying busy />);
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(navigation.back).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-busy', 'true');
    view.rerender(<NextIntlClientProvider locale="en" messages={messages}>
      <RouteDialogFrame>
        <RouteDialogHeader title="Review Jordan T." description="Assemble a desk" />
        <RouteDialogBody><Paying busy={false} /></RouteDialogBody>
      </RouteDialogFrame>
    </NextIntlClientProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(navigation.back).toHaveBeenCalledTimes(1);
  });

  it('follows a result that is a page of its own (a new booking): back, then that page in place of the dialog', () => {
    const grabbed: RouteDialogControls[] = [];
    function Grab() {
      const dialog = useRouteDialog();
      useEffect(() => { if (dialog) grabbed.push(dialog); }, [dialog]);
      return null;
    }
    mount(<Grab />);
    const controls = grabbed[0];
    expect(controls).toBeDefined();
    act(() => { controls?.finish({ ok: true, code: 'booked', redirectTo: '/app/bookings/bkg_new' }, undefined, { follow: true }); });
    expect(toasts.success).toHaveBeenCalledWith('Booked!');
    expect(navigation.back).toHaveBeenCalledTimes(1);
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(navigation.push).toHaveBeenCalledWith('/app/bookings/bkg_new');
    expect(navigation.refresh).not.toHaveBeenCalled();
  });

  it('after it was closed, a late result only refreshes (it never goes back a second time)', () => {
    const grabbed: RouteDialogControls[] = [];
    function Grab() {
      const controls = useRouteDialog();
      useEffect(() => { if (controls) grabbed.push(controls); }, [controls]);
      return null;
    }
    const view = mount(<Grab />);
    const controls = grabbed[0];
    expect(controls).toBeDefined();
    // The router hides a closed dialog's screen, which cleans up its effects; unmounting does the same.
    view.unmount();
    act(() => { controls?.finish({ ok: true, code: 'submitted' }); });
    expect(navigation.back).not.toHaveBeenCalled();
    expect(navigation.refresh).toHaveBeenCalledTimes(1);
    act(() => { controls?.close(); });
    expect(navigation.back).not.toHaveBeenCalled();
  });

  it('a link inside the dialog closes it first, then opens its page; a new tab or another site is left to the browser', () => {
    mount(<>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a plain anchor on purpose: the frame handles any link inside it, Link or not */}
      <a href="/help">Get help</a>
      <a href="https://example.com/terms">Elsewhere</a>
    </>);
    const help = screen.getByRole('link', { name: 'Get help' });
    const elsewhere = screen.getByRole('link', { name: 'Elsewhere' });
    // jsdom would try to navigate: keep it from that, as the browser's own handling isn't under test.
    for (const link of [help, elsewhere]) link.addEventListener('click', (event) => event.preventDefault());
    fireEvent.click(help, { metaKey: true });
    expect(navigation.back).not.toHaveBeenCalled();
    fireEvent.click(elsewhere);
    expect(navigation.back).not.toHaveBeenCalled();
    fireEvent.click(help);
    expect(navigation.back).toHaveBeenCalledTimes(1);
    expect(navigation.push).not.toHaveBeenCalled();
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(navigation.push).toHaveBeenCalledWith('/help');
  });

  it('useFormAction closes the dialog where a full page would follow the redirect', async () => {
    mount(<HookForm result={{ ok: true, code: 'submitted', redirectTo: '/app/bookings/bkg_desk' }} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send' })); });
    expect(navigation.push).not.toHaveBeenCalled();
    expect(navigation.back).toHaveBeenCalledTimes(1);
    expect(toasts.success).toHaveBeenCalledWith('Saved it.');
  });

  it('useFormAction leaves a result without a redirect to the form (an error stays in the dialog)', async () => {
    mount(<HookForm result={{ ok: false, code: 'unknown' }} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send' })); });
    expect(navigation.back).not.toHaveBeenCalled();
    expect(navigation.push).not.toHaveBeenCalled();
    expect(toasts.success).not.toHaveBeenCalled();
  });
});

describe('useFormAction outside a route dialog', () => {
  it('follows the redirect, as before', async () => {
    render(<NextIntlClientProvider locale="en" messages={messages}><HookForm result={{ ok: true, code: 'submitted', redirectTo: '/app/bookings/bkg_desk' }} /></NextIntlClientProvider>);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send' })); });
    expect(navigation.push).toHaveBeenCalledWith('/app/bookings/bkg_desk');
    expect(navigation.back).not.toHaveBeenCalled();
    expect(toasts.success).not.toHaveBeenCalled();
  });
});
