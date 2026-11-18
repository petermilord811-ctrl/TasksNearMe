/** @vitest-environment jsdom */
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionResult, HelperOnboardingHandlers, HelperOnboardingPageData, HelperServicesInput } from '@/contracts';
import { fakeOnboardingHandlers, onboardingAreaStep, onboardingProfileStep, onboardingSetupAbout, onboardingSetupAboutExamples, onboardingSetupServicesChosen } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import esMessages from '../../../../messages/es/ui';
import { buildExamples, EXAMPLE_VARIANTS } from './setup-examples';
import { HelperProfileSetup, startingPart } from './profile-setup';

const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }), usePathname: () => '/app/helper/onboarding/profile' }));

beforeEach(() => {
  window.sessionStorage.clear();
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: false, media: query, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() })));
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

const ok = (redirectTo?: string): ActionResult => ({ ok: true, code: 'saved', ...(redirectTo ? { redirectTo } : {}) });
function show(data: HelperOnboardingPageData, handlers: Partial<HelperOnboardingHandlers> = {}): ReactElement {
  return <NextIntlClientProvider locale="en" timeZone="America/Chicago" messages={uiMessages}><HelperProfileSetup data={data} handlers={{ ...fakeOnboardingHandlers, ...handlers }} /></NextIntlClientProvider>;
}

describe('helper setup, the profile in one flow (plan 9.11)', () => {
  it('opens the first part not saved yet, or the part the address names', () => {
    expect(startingPart(onboardingProfileStep)).toBe('services');
    expect(startingPart(onboardingAreaStep)).toBe('area');
    expect(startingPart(onboardingSetupAbout)).toBe('about');
    const allSaved = { ...onboardingSetupAbout, progress: { ...onboardingSetupAbout.progress, steps: onboardingSetupAbout.progress.steps.map((entry) => entry.step === 'profile' ? { ...entry, state: 'done' as const } : entry) } };
    expect(startingPart(allSaved)).toBe('about');
  });

  it('goes through What you do and Where you help, saving each, and Back keeps what was chosen', async () => {
    const user = userEvent.setup();
    const onSaveServices = vi.fn(async () => ok('/app/helper/onboarding/area'));
    const onSaveArea = vi.fn(async () => ok('/app/helper/onboarding/profile'));
    render(show(onboardingProfileStep, { onSaveServices, onSaveArea }));
    expect(screen.getByRole('heading', { level: 2, name: 'What you do' })).toBeVisible();
    expect(screen.getByText('Part 1 of 3')).toBeVisible();

    // Nothing chosen: Next says so and saves nothing.
    await user.click(screen.getByRole('button', { name: /Next: Where you help/ }));
    expect(await screen.findByText('Choose at least one service.')).toBeVisible();
    expect(onSaveServices).not.toHaveBeenCalled();

    // A service opens prefilled with the market's typical low end ($50 a piece for assembly).
    await user.click(screen.getByRole('button', { name: /^Furniture assembly/ }));
    expect(screen.getByRole('button', { name: /^Furniture assembly/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Your price, from')).toHaveValue('50');
    await user.click(screen.getByRole('button', { name: /Next: Where you help/ }));
    await waitFor(() => expect(onSaveServices).toHaveBeenCalledWith({ services: [{ categorySlug: 'furniture-assembly', pricingType: 'fixed', fromPriceCents: 5000, description: '' }] }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Where you help' })).toBeVisible();

    await user.selectOptions(screen.getByLabelText('Home area'), 'area_mueller');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'What you do' })).toBeVisible();
    expect(screen.getByRole('button', { name: /^Furniture assembly/ })).toHaveAttribute('aria-pressed', 'true');
    // Unchanged and saved: Next moves on without saving again, and the area is still chosen.
    await user.click(screen.getByRole('button', { name: /Next: Where you help/ }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Where you help' })).toBeVisible();
    expect(onSaveServices).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Home area')).toHaveValue('area_mueller');
    await user.click(screen.getByRole('button', { name: /Next: Introduce yourself/ }));
    await waitFor(() => expect(onSaveArea).toHaveBeenCalledWith(expect.objectContaining({ where: 'market', areaId: 'area_mueller' })));
    expect(await screen.findByRole('heading', { level: 2, name: 'Introduce yourself' })).toBeVisible();
  });

  it('keeps the part in the address’s fragment, never its path, and follows the browser’s Back and a reload', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/app/helper/onboarding/services');
    render(show(onboardingSetupServicesChosen, { onSaveServices: vi.fn(async () => ok()) }));
    await user.click(screen.getByRole('button', { name: /Next: Where you help/ }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Where you help' })).toBeVisible();
    // Another path would be another page: a save refreshes the page for the address, and React would start it over.
    expect(window.location.pathname).toBe('/app/helper/onboarding/services');
    expect(window.location.hash).toBe('#area');

    // The browser's Back to the address without a fragment: the part the page opened with.
    window.history.replaceState(null, '', '/app/helper/onboarding/services');
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(await screen.findByRole('heading', { level: 2, name: 'What you do' })).toBeVisible();
    cleanup();

    // A reload of an address naming a part opens it.
    window.history.replaceState(null, '', '/app/helper/onboarding/services#area');
    render(show(onboardingSetupServicesChosen));
    expect(await screen.findByRole('heading', { level: 2, name: 'Where you help' })).toBeVisible();
  });

  it('fills Introduce yourself from a written example without Claude, needs the agreement, then goes on to the checks', async () => {
    const user = userEvent.setup();
    const onSaveProfile = vi.fn(async () => ok('/app/helper/onboarding/identity'));
    render(show(onboardingSetupAboutExamples, { onSaveProfile }));
    expect(screen.getByRole('heading', { level: 2, name: 'Introduce yourself' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Use an example' }));
    const headline = screen.getByLabelText('Headline') as HTMLInputElement;
    expect(headline.value).toBe('Light cleaning and yard cleanup in Mueller');
    expect((screen.getByLabelText('About you', { selector: 'textarea' }) as HTMLTextAreaElement).value).toMatch(/^Hi, I'm Priya\. I help neighbors in Mueller with light cleaning and yard cleanup\./);
    // The live card shows it before anything is saved.
    expect(within(screen.getByRole('complementary', { name: 'How clients see you' })).getByText('Light cleaning and yard cleanup in Mueller')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save and continue' }));
    expect(await screen.findByText('Agree to the Helper agreement and the Community guidelines to continue.')).toBeVisible();
    expect(onSaveProfile).not.toHaveBeenCalled();
    await user.click(screen.getByRole('checkbox', { name: /I agree to the Helper agreement/ }));
    await user.click(screen.getByRole('button', { name: 'Save and continue' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/app/helper/onboarding/identity'));
    expect(onSaveProfile).toHaveBeenCalledWith(expect.objectContaining({ headline: 'Light cleaning and yard cleanup in Mueller', acceptHelperAgreement: true }));
  });

  it('saves a valid part by itself a moment after typing stops', async () => {
    const user = userEvent.setup();
    const onSaveServices = vi.fn(async (_input: HelperServicesInput) => ok());
    render(show(onboardingSetupServicesChosen, { onSaveServices }));
    const price = screen.getByLabelText('Your price, from');
    await user.clear(price);
    await user.type(price, '95');
    expect(screen.getByText('Not saved yet')).toBeVisible();
    await waitFor(() => expect(onSaveServices).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect(onSaveServices.mock.calls[0]![0]).toEqual(expect.objectContaining({ services: expect.arrayContaining([expect.objectContaining({ categorySlug: 'light-cleaning', fromPriceCents: 9500 })]) }));
    expect(await screen.findByText('Saved')).toBeVisible();
  });

  it('keeps text not saved yet in this tab and puts it back after a reload', async () => {
    window.sessionStorage.setItem('tnm:helper-setup:Priya S.', JSON.stringify({ services: { values: onboardingSetupServicesChosen.values.services, base: JSON.stringify(onboardingProfileStep.values.services) } }));
    render(show(onboardingProfileStep));
    expect(await screen.findByText('We kept what you typed before.')).toBeVisible();
    expect(screen.getByRole('button', { name: /^Light cleaning/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^Yard cleanup/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('never puts back text typed over saved values that have changed since', async () => {
    window.sessionStorage.setItem('tnm:helper-setup:Priya S.', JSON.stringify({ services: { values: onboardingSetupServicesChosen.values.services, base: JSON.stringify({ services: [] , stale: true }) } }));
    render(show(onboardingProfileStep));
    await act(async () => { await new Promise((resolve) => requestAnimationFrame(() => resolve(null))); });
    expect(screen.queryByText('We kept what you typed before.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Light cleaning/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows the server’s field errors in place and stays on the part', async () => {
    const user = userEvent.setup();
    const onSaveServices = vi.fn(async (): Promise<ActionResult> => ({ ok: false, code: 'validation_failed', fieldErrors: { 'services.0.fromPriceCents': ['out_of_range'] } }));
    render(show(onboardingSetupServicesChosen, { onSaveServices }));
    await act(async () => { await user.click(screen.getByRole('button', { name: /Next: Where you help/ })); });
    expect(await screen.findByRole('heading', { level: 2, name: 'What you do' })).toBeVisible();
    expect(screen.getByLabelText('Your price, from', { selector: '[aria-invalid="true"]' })).toBeInTheDocument();
  });
});

describe('written examples (plan 9.11)', () => {
  const name = (slug: string) => (uiMessages.helperCard.categories as Record<string, string>)[slug]!;
  const t = (messages: typeof uiMessages) => (key: string, values: Record<string, string | number> = {}) => {
    const template = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], messages.helperOnboarding.setup.examples) as string;
    return template.replace(/\{(\w+)\}/g, (_, field: string) => String(values[field] ?? ''));
  };

  it('offers three, within the profile’s limits, naming the services and the area', () => {
    const examples = buildExamples({ firstName: 'Priya', services: ['light-cleaning', 'yard-cleanup'], area: 'Mueller', languages: ['en', 'hi'] }, t(uiMessages), name, 'en');
    expect(examples).toHaveLength(EXAMPLE_VARIANTS.length);
    for (const example of examples) {
      expect(example.headline.length).toBeGreaterThanOrEqual(10);
      expect(example.headline.length).toBeLessThanOrEqual(80);
      expect(example.headline).toMatch(/Mueller/);
      expect(example.bio.length).toBeGreaterThanOrEqual(40);
      expect(example.bio).toContain('I speak English and Hindi.');
    }
  });

  it('keep long lists of services inside 80 characters', () => {
    const examples = buildExamples({ firstName: 'Ana', services: ['furniture-assembly', 'moving-help', 'yard-cleanup', 'light-cleaning', 'computer-help'], area: 'Northwest Gainesville', languages: ['en'] }, t(uiMessages), name, 'en');
    for (const example of examples) expect(example.headline.length).toBeLessThanOrEqual(80);
    expect(examples[0]!.headline).toBe('Furniture assembly, moving help and more in Northwest Gainesville');
  });

  it('are written in the page’s language', () => {
    const esName = (slug: string) => (esMessages.helperCard.categories as Record<string, string>)[slug]!;
    const [first] = buildExamples({ firstName: 'Priya', services: ['light-cleaning'], area: 'Mueller', languages: ['es', 'en'] }, t(esMessages as typeof uiMessages), esName, 'es');
    expect(first!.headline).toBe('Limpieza ligera en Mueller');
    expect(first!.bio).toContain('Hablo español e inglés.');
  });
});
