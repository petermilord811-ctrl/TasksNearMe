/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes, type AdminCaseHandlers, type AdminCasePageData } from '@/contracts';
import { ADMIN_NOW, contactAdminCaseData, contactAnsweredAdminCaseData, fakeAdminCaseHandlers } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import adminCase from '../../../../messages/en/ui/adminCase.json';
import adminCases from '../../../../messages/en/ui/adminCases.json';
import { AdminCaseScreen } from './admin-case-screen';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function content(data: AdminCasePageData, handlers: AdminCaseHandlers = fakeAdminCaseHandlers) {
  return <NextIntlClientProvider locale="en" messages={{ ...messages, adminCase, adminCases }} onError={(error) => { throw error; }}><AdminCaseScreen data={data} handlers={handlers} now={ADMIN_NOW} /></NextIntlClientProvider>;
}

const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_match, key: string) => values[key] ?? '');

/** A request from the public contact form (completion plan 5.22): an address instead of a member. */
describe('AdminCaseScreen for a public request', () => {
  it('shows who wrote as an unconfirmed address, with the matching account for staff, and no people list', () => {
    render(content(contactAdminCaseData));
    const card = within(screen.getByRole('heading', { name: adminCase.details.contact.title, level: 2 }).closest('section')!);
    expect(card.getByText('maya@example.test')).toBeVisible();
    expect(card.getByText(adminCase.details.contact.unconfirmed)).toBeVisible();
    expect(card.getByText(fill(adminCase.details.contact.language, { language: 'English' }))).toBeVisible();
    expect(card.getByText(fill(adminCase.details.contact.account, { name: 'Maya R.' }))).toBeVisible();
    expect(card.getByRole('link', { name: adminCase.details.contact.openAccount })).toHaveAttribute('href', routes.admin.user('usr_maya'));
    expect(screen.queryByRole('heading', { name: adminCase.details.people })).toBeNull();
    // The address's follow-up, in the timeline.
    expect(screen.getByText(fill(adminCase.details.from, { name: 'maya@example.test' }))).toBeVisible();
    expect(screen.getByText(adminCase.details.contactForm)).toBeVisible();
  });

  it('answers by email with the account warning (even when an account matches), never the member reply form', async () => {
    const user = userEvent.setup();
    const onEmailContact = vi.fn<AdminCaseHandlers['onEmailContact']>(async () => ({ ok: true, code: 'sent' }));
    render(content(contactAdminCaseData, { ...fakeAdminCaseHandlers, onEmailContact }));
    const form = within(screen.getByRole('form', { name: adminCase.emailContact.title }));
    expect(screen.queryByRole('form', { name: adminCase.reply.title })).toBeNull();
    expect(form.getByText(adminCase.emailContact.warning)).toBeVisible();
    expect(form.getByText(fill(adminCase.emailContact.to, { email: 'maya@example.test' }))).toBeVisible();
    const body = form.getByRole('textbox', { name: adminCase.emailContact.body });
    expect(body.getAttribute('aria-describedby')).toContain(form.getByText(adminCase.emailContact.warning).id);
    await user.click(form.getByRole('button', { name: adminCase.emailContact.send }));
    expect(await form.findByText(adminCase.emailContact.bodyRequired)).toBeVisible();
    expect(onEmailContact).not.toHaveBeenCalled();
    await user.type(body, 'Thanks for writing. Try signing in with your email instead.');
    await user.click(form.getByRole('button', { name: adminCase.emailContact.send }));
    await waitFor(() => expect(onEmailContact).toHaveBeenCalledExactlyOnceWith({ body: 'Thanks for writing. Try signing in with your email instead.' }));
    expect(await form.findByText(adminCase.emailContact.sent)).toBeVisible();
  });

  it('marks emailed answers, names the language, and says when no account uses the address', () => {
    render(content(contactAnsweredAdminCaseData));
    expect(screen.getByText(fill(adminCase.details.emailedTo, { email: 'vecino@example.test' }))).toBeVisible();
    expect(screen.getByText(adminCase.details.contact.noAccount)).toBeVisible();
    expect(screen.getByText(fill(adminCase.emailContact.bodyHint, { language: 'Spanish' }))).toBeVisible();
  });
});
