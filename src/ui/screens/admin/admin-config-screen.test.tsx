/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POLICY_FIELDS, type AdminConfigHandlers } from '@/contracts';
import { ADMIN_NOW, adminConfigData, fakeHandler } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import copy from '../../../../messages/en/ui/adminConfig.json';
import { AdminConfigScreen } from './admin-config-screen';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function mount() {
  const handlers = {
    onPublishPolicy: vi.fn<AdminConfigHandlers['onPublishPolicy']>(fakeHandler({ ok: true, code: 'updated' }, 0)),
    onSetFlag: vi.fn<AdminConfigHandlers['onSetFlag']>(fakeHandler({ ok: true, code: 'updated' }, 0)),
  };
  render(<NextIntlClientProvider locale="en" messages={uiMessages}><AdminConfigScreen data={adminConfigData} handlers={handlers} now={ADMIN_NOW} /></NextIntlClientProvider>);
  return handlers;
}

describe('AdminConfigScreen', () => {
  it('has a label for every policy field', () => {
    for (const key of POLICY_FIELDS) expect(copy.fields[key]).toMatch(/\S/);
  });

  it('fills the form with the version in use, in percent and dollars, and publishes in basis points and cents', async () => {
    const user = userEvent.setup();
    const handlers = mount();
    const form = within(screen.getByRole('form', { name: copy.publishTitle }));
    expect(form.getByLabelText(copy.fields.posterBps)).toHaveValue('10');
    expect(form.getByLabelText(copy.fields.posterMinCents)).toHaveValue('3.00');
    await user.clear(form.getByLabelText(copy.fields.posterBps));
    await user.type(form.getByLabelText(copy.fields.posterBps), '12.5');
    await user.click(form.getByRole('button', { name: 'Publish version 3' }));
    expect(await form.findByText(copy.reasonRequired)).toBeInTheDocument();
    expect(handlers.onPublishPolicy).not.toHaveBeenCalled();
    await user.type(form.getByLabelText(copy.reason), 'A small fee change for the holidays.');
    await user.click(form.getByRole('button', { name: 'Publish version 3' }));
    await waitFor(() => expect(handlers.onPublishPolicy).toHaveBeenCalledWith(expect.objectContaining({ posterBps: 1250, posterMinCents: 300, helperBps: 1000, autoApproveHours: 72, reason: 'A small fee change for the holidays.' })));
    expect(await form.findByText(copy.published)).toBeInTheDocument();
  });

  it('explains the allowed range for a value out of range, before sending', async () => {
    const user = userEvent.setup();
    const handlers = mount();
    const form = within(screen.getByRole('form', { name: copy.publishTitle }));
    await user.clear(form.getByLabelText(copy.fields.posterBps));
    await user.type(form.getByLabelText(copy.fields.posterBps), '45');
    await user.type(form.getByLabelText(copy.reason), 'Trying a much higher fee.');
    await user.click(form.getByRole('button', { name: 'Publish version 3' }));
    expect(await form.findByText('From 0% to 30%.')).toBeInTheDocument();
    expect(handlers.onPublishPolicy).not.toHaveBeenCalled();
  });

  it('turns a flag off after a confirmation with a reason', async () => {
    const user = userEvent.setup();
    const handlers = mount();
    await user.click(screen.getByRole('button', { name: 'Turn off ai_drafting' }));
    const dialog = within(screen.getByRole('alertdialog'));
    await user.type(dialog.getByLabelText(copy.reason), 'Pausing while we review its suggestions.');
    await user.click(dialog.getByRole('button', { name: 'Turn off ai_drafting' }));
    await waitFor(() => expect(handlers.onSetFlag).toHaveBeenCalledWith({ key: 'ai_drafting', enabled: false, reason: 'Pausing while we review its suggestions.' }));
    expect(await screen.findByText(copy.flagSaved)).toBeInTheDocument();
  });
});
