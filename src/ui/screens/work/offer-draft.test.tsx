/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { HelperTaskView, HelperWorkHandlers, OfferMessageDraftResult } from '@/contracts';
import { deskOfferMessageDraft, fakeHelperWorkHandlers, helperMovingHourly } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import helperTask from '../../../../messages/en/ui/helperTask.json';
import { OfferForm } from './offer-form';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); window.sessionStorage.clear(); });

const form = helperTask.form;
const status = messages.forms.aiDraft;

function show(data: HelperTaskView, overrides: Partial<HelperWorkHandlers> = {}) {
  const handlers = { ...fakeHelperWorkHandlers, onQuote: vi.fn(fakeHelperWorkHandlers.onQuote), ...overrides };
  render(<NextIntlClientProvider locale="en" messages={{ ...messages, helperTask }}><OfferForm data={data} handlers={handlers} /></NextIntlClientProvider>);
  return handlers;
}

describe('"Write it for me" on the offer message', () => {
  it('comes after the message’s count, privacy hint and error, so a phone with the keyboard open fits the field and its hint above Send offer', () => {
    show(helperMovingHourly);
    const message = screen.getByLabelText(form.message);
    const described = (message.getAttribute('aria-describedby') ?? '').split(' ').map((id) => document.getElementById(id)!);
    expect(described.map((node) => node.textContent)).toContain(form.privacy);
    const draft = screen.getByRole('button', { name: form.aiDraft });
    // Every node that describes the message comes before "Write it for me".
    for (const node of described) expect(node.compareDocumentPosition(draft) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('is offered only when drafting is on', () => {
    show({ ...helperMovingHourly, aiDraftingEnabled: false });
    expect(screen.queryByRole('button', { name: form.aiDraft })).not.toBeInTheDocument();
  });

  it('sends the start time, what they bring and what was typed, fills the message, and Undo restores it', async () => {
    const user = userEvent.setup();
    const onDraftOfferMessage = vi.fn(async (): Promise<OfferMessageDraftResult> => ({ ok: true, message: deskOfferMessageDraft }));
    show(helperMovingHourly, { onDraftOfferMessage });
    const message = screen.getByLabelText(form.message);
    await user.type(message, 'have a dolly');
    await user.click(screen.getByRole('button', { name: form.aiDraft }));
    expect(onDraftOfferMessage).toHaveBeenCalledExactlyOnceWith({ startTime: helperMovingHourly.offerDefaults.startTime, brings: [], notes: 'have a dolly' });
    expect(await screen.findByText(status.drafted)).toBeVisible();
    expect(message).toHaveValue(deskOfferMessageDraft);
    await user.click(screen.getByRole('button', { name: status.undo }));
    expect(message).toHaveValue('have a dolly');
  });

  it('says why when it cannot draft, and keeps what was typed', async () => {
    const user = userEvent.setup();
    show(helperMovingHourly, { onDraftOfferMessage: async () => ({ ok: false, code: 'rate_limited' }) });
    await user.type(screen.getByLabelText(form.message), 'hello');
    await user.click(screen.getByRole('button', { name: form.aiDraft }));
    expect(await screen.findByText(status.errors.rate_limited)).toBeVisible();
    await waitFor(() => expect(screen.getByLabelText(form.message)).toHaveValue('hello'));
  });
});
