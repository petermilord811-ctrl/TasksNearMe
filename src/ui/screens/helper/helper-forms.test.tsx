/** @vitest-environment jsdom */
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ActionResult, HelperServicesInput } from '@/contracts';
import { routes } from '@/contracts';
import { onboardingAreaStep, onboardingProfileStep, samProfileEditorData } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import helperOnboarding from '../../../../messages/en/ui/helperOnboarding.json';
import { HelperAreaForm, HelperProfileForm, HelperServicesForm, HelperToolsForm } from './helper-forms';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function renderForm(children: ReactNode) {
  return render(<NextIntlClientProvider locale="en" messages={{ ...messages, helperOnboarding }}>{children}</NextIntlClientProvider>);
}

const saved = () => Promise.resolve<ActionResult>({ ok: true, code: 'saved' });
const serviceValues: HelperServicesInput = { services: [{ categorySlug: 'furniture-assembly', pricingType: 'fixed', fromPriceCents: 2500, description: '' }] };

describe('helper profile and service forms', () => {
  it('validates profile lengths and languages, focuses the first error, then saves and follows the redirect', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(() => Promise.resolve<ActionResult>({ ok: true, code: 'saved', redirectTo: routes.app.helperOnboarding('services') }));
    renderForm(<HelperProfileForm values={onboardingProfileStep.values.profile} languageOptions={onboardingProfileStep.languageOptions} onSave={onSave} />);
    await user.click(screen.getByRole('checkbox', { name: 'English' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getAllByText(messages.forms.fieldErrors.too_short)).toHaveLength(2);
    expect(screen.getByText(messages.forms.fieldErrors.required)).toBeInTheDocument();
    expect(screen.getByLabelText('Headline')).toHaveFocus();
    await user.type(screen.getByLabelText('Headline'), samProfileEditorData.values.profile.headline);
    await user.type(screen.getByLabelText('About you'), samProfileEditorData.values.profile.bio);
    await user.click(screen.getByRole('checkbox', { name: 'English' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ ...samProfileEditorData.values.profile, languages: ['en'] }));
    expect(push).toHaveBeenCalledWith(routes.app.helperOnboarding('services'));
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
  });

  it('rejects a furniture starting price under $25.00 and duplicate categories', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(saved);
    renderForm(<HelperServicesForm values={serviceValues} categories={samProfileEditorData.categories} onSave={onSave} />);
    expect(screen.getByText(/Category minimum: \$25.00/)).toBeInTheDocument();
    await user.clear(screen.getByLabelText('From price ($)'));
    await user.type(screen.getByLabelText('From price ($)'), '24.99');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByText(messages.forms.fieldErrors.out_of_range)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Add service' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByText(helperOnboarding.forms.services.duplicate)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('requires at least one service and saves parsed prices without computing amounts', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(saved);
    renderForm(<HelperServicesForm values={{ services: [] }} categories={samProfileEditorData.categories} onSave={onSave} />);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByText(messages.forms.fieldErrors.required)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add service' }));
    await user.clear(screen.getByLabelText('From price ($)'));
    await user.type(screen.getByLabelText('From price ($)'), '50.25');
    await user.type(screen.getByLabelText('Service description'), 'Careful assembly.');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ services: [{ categorySlug: 'furniture-assembly', pricingType: 'fixed', fromPriceCents: 5025, description: 'Careful assembly.' }] }));
  });

  it('validates the category hourly minimum and submits the hourly values', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(saved);
    renderForm(<HelperServicesForm values={{ services: [{ categorySlug: 'moving-help', pricingType: 'hourly', hourlyRateCents: 3500, minHours: 1, description: 'Moving help.' }] }} categories={samProfileEditorData.categories} onSave={onSave} />);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByText(messages.forms.fieldErrors.out_of_range)).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Minimum hours'));
    await user.type(screen.getByLabelText('Minimum hours'), '2');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSave).toHaveBeenCalledWith({ services: [{ categorySlug: 'moving-help', pricingType: 'hourly', hourlyRateCents: 3500, minHours: 2, description: 'Moving help.' }] });
  });

  it('shows nested server field errors and leaves unsaved values available to correct', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(() => Promise.resolve<ActionResult>({ ok: false, code: 'validation_failed', fieldErrors: { 'services.0.fromPriceCents': ['out_of_range'] } }));
    renderForm(<HelperServicesForm values={serviceValues} categories={samProfileEditorData.categories} onSave={onSave} />);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(messages.forms.fieldErrors.out_of_range)).toBeInTheDocument();
    expect(screen.getByLabelText('From price ($)')).toHaveValue('25');
    expect(screen.getByLabelText('From price ($)')).toHaveFocus();
    expect(push).not.toHaveBeenCalled();
  });
});

describe('helper area and tools forms', () => {
  it('validates home area and saves the selected radius and remote option', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(saved);
    renderForm(<HelperAreaForm values={onboardingAreaStep.values.area} areas={onboardingAreaStep.areas} remoteAllowed onSave={onSave} />);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByText(messages.forms.fieldErrors.required)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    await user.selectOptions(screen.getByLabelText('Home area'), 'area_mueller');
    await user.selectOptions(screen.getByLabelText('Service radius'), '8');
    await user.click(screen.getByRole('checkbox', { name: 'I also help remotely' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSave).toHaveBeenCalledWith({ areaId: 'area_mueller', serviceRadiusMiles: 8, remoteOk: true });
  });

  it('does not show remote help when offered services do not allow it', () => {
    renderForm(<HelperAreaForm values={onboardingAreaStep.values.area} areas={onboardingAreaStep.areas} remoteAllowed={false} onSave={saved} />);
    expect(screen.queryByRole('checkbox', { name: 'I also help remotely' })).not.toBeInTheDocument();
    expect(within(screen.getByLabelText('Service radius')).getAllByRole('option')).toHaveLength(5);
  });

  it('validates tool length and saves additions and removals', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(saved);
    renderForm(<HelperToolsForm values={{ tools: ['Drill'] }} onSave={onSave} />);
    await user.click(screen.getByRole('button', { name: 'Add tool' }));
    await user.type(screen.getByLabelText('Tool 2'), 'L');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByText(messages.forms.fieldErrors.too_short)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Tool 2'), 'evel');
    await user.click(screen.getByRole('button', { name: 'Remove tool 1' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSave).toHaveBeenCalledWith({ tools: ['Level'] });
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
  });

  it('disables edits and the submit button during saving and announces a handler failure', async () => {
    const user = userEvent.setup();
    let resolve!: (value: ActionResult) => void;
    const onSave = vi.fn(() => new Promise<ActionResult>((done) => { resolve = done; }));
    const view = renderForm(<HelperToolsForm values={{ tools: ['Drill'] }} onSave={onSave} />);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByRole('button', { name: /Saving/ })).toBeDisabled();
    expect(screen.getByLabelText('Tool 1')).toBeDisabled();
    expect(view.container.querySelector('form')).toHaveAttribute('aria-busy', 'true');
    resolve({ ok: false, code: 'unknown' });
    expect(await screen.findByText(messages.feedback.error.unknown)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
    expect(push).not.toHaveBeenCalled();
  });
});
