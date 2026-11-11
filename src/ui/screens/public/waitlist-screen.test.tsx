/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { routes, type ActionResult, type WaitlistHandlers, type WaitlistInput } from '@/contracts';
import { fakeHandler, waitlistPageData } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { WaitlistScreen } from './waitlist-screen';

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

function renderWaitlist(onJoin: WaitlistHandlers['onJoin']) {
  return render(<NextIntlClientProvider locale="en" messages={messages}><WaitlistScreen data={waitlistPageData} handlers={{ onJoin }} /></NextIntlClientProvider>);
}

async function fillWaitlist(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole('textbox', { name: 'Email' }), ' Maya@Example.TEST ');
  await user.type(screen.getByRole('textbox', { name: 'ZIP code' }), '10001');
  await user.click(screen.getByRole('radio', { name: 'Both' }));
}

describe('waitlist form', () => {
  it('submits normalized values and replaces the form with the email and ZIP confirmation', async () => {
    const user = userEvent.setup();
    const onJoin = vi.fn(fakeHandler<WaitlistInput>({ ok: true, code: 'submitted' }, 0));
    renderWaitlist(onJoin);
    await fillWaitlist(user);
    await user.click(screen.getByRole('button', { name: 'Join the waitlist' }));
    expect(onJoin).toHaveBeenCalledWith({ email: 'maya@example.test', zip: '10001', interest: 'both' });
    expect(await screen.findByRole('heading', { name: "You're on the list." })).toBeInTheDocument();
    expect(screen.getByText("We'll email maya@example.test when TasksNearMe opens near 10001.")).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Email' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'See local help in Austin' })).toHaveAttribute('href', routes.market(waitlistPageData.markets[0]!.slug));
  });

  it('requires all fields, focuses the first invalid field, and labels the interest group', async () => {
    const user = userEvent.setup();
    const onJoin = vi.fn(fakeHandler<WaitlistInput>());
    renderWaitlist(onJoin);
    await user.click(screen.getByRole('button', { name: 'Join the waitlist' }));
    expect(onJoin).not.toHaveBeenCalled();
    expect(await screen.findAllByText(messages.forms.fieldErrors.required)).toHaveLength(3);
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveFocus();
    const radios = screen.getByRole('radiogroup', { name: "I'm interested in" });
    expect(radios).toHaveAttribute('aria-invalid', 'true');
    expect(radios).toHaveAccessibleDescription(/Choose how you'd like to use TasksNearMe.*Fill in this field/);
  });

  it('locks submission while pending and keeps the form when the server rejects it', async () => {
    const user = userEvent.setup();
    let resolve!: (result: ActionResult) => void;
    const onJoin = vi.fn(() => new Promise<ActionResult>((done) => { resolve = done; }));
    renderWaitlist(onJoin);
    await fillWaitlist(user);
    const submit = screen.getByRole('button', { name: 'Join the waitlist' });
    await user.click(submit);
    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute('aria-busy', 'true');
    await user.click(submit);
    expect(onJoin).toHaveBeenCalledTimes(1);
    resolve({ ok: false, code: 'validation_failed', fieldErrors: { zip: ['invalid'] } });
    expect(await screen.findByText(messages.forms.fields.zip.invalid)).toBeInTheDocument();
    await waitFor(() => expect(submit).toBeEnabled());
    expect(screen.getByRole('textbox', { name: 'ZIP code' })).toHaveFocus();
    expect(screen.queryByRole('heading', { name: "You're on the list." })).not.toBeInTheDocument();
  });

  it('uses the handler redirect and does not show joined for a different success code', async () => {
    const user = userEvent.setup();
    renderWaitlist(fakeHandler<WaitlistInput>({ ok: true, code: 'saved', redirectTo: routes.market() }, 0));
    await fillWaitlist(user);
    await user.click(screen.getByRole('button', { name: 'Join the waitlist' }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith(routes.market()));
    expect(screen.queryByRole('heading', { name: "You're on the list." })).not.toBeInTheDocument();
  });
});
