/** @vitest-environment jsdom */
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { BOT_CHECK_STAND_IN_TOKEN, routes, type PublicSupportHandlers } from '@/contracts';
import { fakePublicSupportHandlers, publicSupportNoBotCheckData, publicSupportPageData, publicSupportResults } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import messagesEs from '../../../../messages/es/ui';
import copy from '../../../../messages/en/ui/helpContact.json';
import { HelpContactScreen } from './help-contact-screen';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));
// Radix's radio group measures itself.
beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn(); }); });
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

function renderScreen(element: ReactElement, locale: 'en' | 'es' = 'en') {
  return render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? messages : messagesEs} onError={(error) => { throw error; }}>{element}</NextIntlClientProvider>);
}

const message = 'I changed phones and the sign-in code never arrives at my old number.';

describe('HelpContactScreen (5.22)', () => {
  it('points people who can sign in to in-app support, and keeps 911 first', () => {
    renderScreen(<HelpContactScreen data={publicSupportPageData} handlers={fakePublicSupportHandlers} />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('link', { name: copy.call })).toHaveAttribute('href', 'tel:911');
    expect(screen.getByRole('link', { name: copy.signedIn.link })).toHaveAttribute('href', routes.app.support());
  });

  it('requires an address, a topic and a message, then sends them with the bot check and confirms by address only', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<PublicSupportHandlers['onSubmit']>(async () => publicSupportResults.submitted);
    renderScreen(<HelpContactScreen data={publicSupportPageData} handlers={{ onSubmit }} />);
    const form = within(screen.getByRole('form', { name: copy.form }));
    await user.click(form.getByRole('button', { name: copy.send }));
    expect(await form.findByText(copy.topicRequired)).toBeVisible();
    expect(onSubmit).not.toHaveBeenCalled();

    await user.type(form.getByRole('textbox', { name: copy.email }), 'Maya@Example.test');
    await user.click(form.getByRole('radio', { name: copy.topics.account_access }));
    await user.type(form.getByRole('textbox', { name: copy.message }), message);
    await user.click(form.getByRole('button', { name: copy.send }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ email: 'maya@example.test', topic: 'account_access', message, botCheck: BOT_CHECK_STAND_IN_TOKEN }));
    const sent = await screen.findByRole('heading', { name: copy.sent.title });
    await waitFor(() => expect(sent).toHaveFocus());
    expect(screen.getByRole('status')).toHaveTextContent(copy.sent.body.replace('{email}', 'maya@example.test'));
    expect(screen.queryByRole('form')).toBeNull();
  });

  it('keeps the form on a refusal and shows the server’s field errors', async () => {
    const user = userEvent.setup();
    renderScreen(<HelpContactScreen data={publicSupportNoBotCheckData} handlers={{ onSubmit: async () => publicSupportResults.rateLimited }} />);
    const form = within(screen.getByRole('form', { name: copy.form }));
    await user.type(form.getByRole('textbox', { name: copy.email }), 'maya@example.test');
    await user.click(form.getByRole('radio', { name: copy.topics.other }));
    await user.type(form.getByRole('textbox', { name: copy.message }), message);
    await user.click(form.getByRole('button', { name: copy.send }));
    expect(await screen.findByRole('status')).toBeVisible();
    expect(screen.getByRole('form', { name: copy.form })).toBeVisible();
    expect(screen.queryByRole('heading', { name: copy.sent.title })).toBeNull();
  });

  it('has every label in Spanish', () => {
    renderScreen(<HelpContactScreen data={publicSupportPageData} handlers={fakePublicSupportHandlers} />, 'es');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Contactar a soporte');
    expect(screen.getByRole('radio', { name: 'No puedo entrar a mi cuenta' })).toBeVisible();
  });
});
