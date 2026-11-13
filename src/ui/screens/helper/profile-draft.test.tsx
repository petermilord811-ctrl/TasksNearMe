/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ActionResult, ProfileDraftInput, ProfileDraftResult } from '@/contracts';
import { onboardingProfileStep, samProfileDraft } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import helperOnboarding from '../../../../messages/en/ui/helperOnboarding.json';
import { HelperProfileForm } from './helper-forms';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const ai = helperOnboarding.forms.profile.ai;
const status = messages.forms.aiDraft;
const values = { headline: 'Help around the house', bio: 'I help with things around the house for my neighbors.', languages: ['en' as const] };

function show(onDraft?: (input: ProfileDraftInput) => Promise<ProfileDraftResult>, onSave = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'saved' }))) {
  render(<NextIntlClientProvider locale="en" messages={{ ...messages, helperOnboarding }}>
    <HelperProfileForm values={values} languageOptions={onboardingProfileStep.languageOptions} onSave={onSave} onDraft={onDraft} />
  </NextIntlClientProvider>);
  return { onSave };
}

describe('"Write it for me" on the helper profile', () => {
  it('is offered only with a handler', () => {
    show();
    expect(screen.queryByRole('group', { name: ai.title })).not.toBeInTheDocument();
  });

  it('drafts from the notes into the headline and about-me, saves only on Save, and Undo puts the old text back', async () => {
    const user = userEvent.setup();
    const onDraft = vi.fn(async (): Promise<ProfileDraftResult> => ({ ok: true, draft: samProfileDraft }));
    const { onSave } = show(onDraft);
    expect(screen.getByRole('group', { name: ai.title })).toBeVisible();
    await user.type(screen.getByLabelText(ai.notes), '  Patient and tidy  ');
    await user.click(screen.getByRole('button', { name: ai.draft }));
    expect(onDraft).toHaveBeenCalledExactlyOnceWith({ notes: 'Patient and tidy' });
    expect(await screen.findByText(status.drafted)).toBeVisible();
    expect(screen.getByLabelText('Headline')).toHaveValue(samProfileDraft.headline);
    expect(screen.getByLabelText('About you')).toHaveValue(samProfileDraft.bio);
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: ai.redraft })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: status.undo }));
    expect(screen.getByLabelText('Headline')).toHaveValue(values.headline);
    expect(screen.getByLabelText('About you')).toHaveValue(values.bio);
    expect(screen.getByText(status.undone)).toBeVisible();

    await user.click(screen.getByRole('button', { name: ai.redraft }));
    await waitFor(() => expect(screen.getByLabelText('Headline')).toHaveValue(samProfileDraft.headline));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ headline: samProfileDraft.headline, bio: samProfileDraft.bio, languages: ['en'] }));
  });

  it.each([
    ['unavailable', status.errors.unavailable],
    ['rate_limited', status.errors.rate_limited],
    ['prohibited', status.errors.prohibited],
  ] as const)('explains %s and leaves the fields alone', async (code, text) => {
    const user = userEvent.setup();
    show(async () => ({ ok: false, code }));
    await user.click(screen.getByRole('button', { name: ai.draft }));
    expect(await screen.findByText(text)).toBeVisible();
    expect(screen.getByLabelText('Headline')).toHaveValue(values.headline);
  });

  it('treats a thrown handler as unavailable and shows that it is busy meanwhile', async () => {
    const user = userEvent.setup();
    let fail!: (error: Error) => void;
    show(() => new Promise<ProfileDraftResult>((_resolve, reject) => { fail = reject; }));
    await user.click(screen.getByRole('button', { name: ai.draft }));
    expect(screen.getByRole('button', { name: status.drafting })).toHaveAttribute('aria-busy', 'true');
    fail(new Error('network'));
    expect(await screen.findByText(status.errors.unavailable)).toBeVisible();
  });
});
