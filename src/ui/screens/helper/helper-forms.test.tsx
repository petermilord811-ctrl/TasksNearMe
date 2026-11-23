/** @vitest-environment jsdom */
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ActionResult, HelperServicesInput } from '@/contracts';
import { routes } from '@/contracts';
import { onboardingAreaDallas, onboardingAreaStep, onboardingProfileStep, samProfileEditorData } from '@/fixtures';
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
    await waitFor(() => expect(screen.getByLabelText('Headline')).toHaveFocus());
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

  it('checks an hourly rate against the category minimum over the minimum hours, and says so (aa’s sweep S6)', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(saved);
    renderForm(<HelperServicesForm values={{ services: [{ categorySlug: 'moving-help', pricingType: 'hourly', hourlyRateCents: 1500, minHours: 2, description: 'Moving help.' }] }} categories={samProfileEditorData.categories} onSave={onSave} />);
    // Moving help's $35 minimum is for a task, not an hour: $17.50 an hour over its 2 hours.
    expect(screen.getByText('Category minimum: $35.00 a task, with at least 2 hours.')).toBeVisible();
    expect(screen.getByText('Your rate for one hour of help: at least $17.50 ($35.00 for 2 hours).')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(messages.forms.fieldErrors.out_of_range)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText('Hourly rate ($)'));
    await user.type(screen.getByLabelText('Hourly rate ($)'), '20');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ services: [{ categorySlug: 'moving-help', pricingType: 'hourly', hourlyRateCents: 2000, minHours: 2, description: 'Moving help.' }] }));
  });

  it('shows nested server field errors and leaves unsaved values available to correct', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(() => Promise.resolve<ActionResult>({ ok: false, code: 'validation_failed', fieldErrors: { 'services.0.fromPriceCents': ['out_of_range'] } }));
    renderForm(<HelperServicesForm values={serviceValues} categories={samProfileEditorData.categories} onSave={onSave} />);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(messages.forms.fieldErrors.out_of_range)).toBeInTheDocument();
    expect(screen.getByLabelText('From price ($)')).toHaveValue('25');
    await waitFor(() => expect(screen.getByLabelText('From price ($)')).toHaveFocus());
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
    expect(onSave).toHaveBeenCalledWith({ where: 'market', areaId: 'area_mueller', homeZip: '', homeCity: '', serviceRadiusMiles: 8, remoteOk: true });
  });

  it('takes a ZIP and city anywhere else in the US, a ZIP in the market too (owner, 2026-11-23: no list to be on)', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(saved);
    renderForm(<HelperAreaForm values={onboardingAreaStep.values.area} areas={onboardingAreaStep.areas} remoteAllowed={false} onSave={onSave} homeMarket={onboardingAreaStep.homeMarket} />);
    expect(screen.getByRole('radio', { name: /In Austin/ })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: /Anywhere else in the US/ }));
    expect(screen.queryByLabelText('Home area')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getAllByText(messages.forms.fieldErrors.required)).toHaveLength(2);
    const zip = screen.getByRole('textbox', { name: 'ZIP code' });
    // A ZIP the market covers is fine too: the server places it in its nearest neighborhood.
    await user.type(zip, '78723');
    expect(zip).not.toHaveAttribute('aria-invalid', 'true');
    await user.clear(zip);
    await user.type(zip, '75204');
    await user.type(screen.getByRole('textbox', { name: 'City' }), 'Dallas');
    // No list to be on (owner, 2026-11-23): they help from their city right away.
    expect(screen.getByText(/You help from your city/)).toBeInTheDocument();
    expect(screen.queryByText(/opening city by city/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSave).toHaveBeenCalledWith({ where: 'elsewhere', areaId: '', homeZip: '75204', homeCity: 'Dallas', serviceRadiusMiles: 5, remoteOk: false });
  });

  it('keeps a ZIP chosen outside the neighborhoods, and shows the server\'s answer for a ZIP it can\'t place', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(() => Promise.resolve<ActionResult>({ ok: false, code: 'validation_failed', fieldErrors: { homeZip: ['not_supported'] } }));
    renderForm(<HelperAreaForm values={onboardingAreaDallas.values.area} areas={onboardingAreaDallas.areas} remoteAllowed={false} onSave={onSave} homeMarket={onboardingAreaDallas.homeMarket} />);
    expect(screen.getByRole('radio', { name: /Anywhere else in the US/ })).toBeChecked();
    expect(screen.getByRole('textbox', { name: 'ZIP code' })).toHaveValue('75204');
    expect(screen.queryByText(/on the list/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Enter a US ZIP code.')).toBeInTheDocument();
  });

  it('offers only the neighborhood without a home market (older callers)', () => {
    renderForm(<HelperAreaForm values={onboardingAreaStep.values.area} areas={onboardingAreaStep.areas} remoteAllowed={false} onSave={saved} />);
    expect(screen.queryByRole('radio', { name: /Anywhere else/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Home area')).toBeInTheDocument();
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
