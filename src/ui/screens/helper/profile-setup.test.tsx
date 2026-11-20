/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionResult, HelperAreaInput, HelperOnboardingHandlers, HelperOnboardingPageData, HelperProfileInput, HelperServicesInput } from '@/contracts';
import { fakeOnboardingHandlers, onboardingAreaStep, onboardingProfileStep, onboardingSetupAbout, onboardingSetupAboutExamples, onboardingSetupAboutPhoto, onboardingSetupServicesChosen } from '@/fixtures';
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
afterEach(async () => {
  cleanup();
  // A part shown just before the end scrolls in the next frame: let it run while matchMedia is still stubbed.
  await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

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

  it('shows the field Save and continue stops on, also one that already had focus (journeys on a phone, J-H2)', async () => {
    const user = userEvent.setup();
    const onSaveProfile = vi.fn(async () => ok('/app/helper/onboarding/identity'));
    render(show(onboardingSetupAboutExamples, { onSaveProfile }));
    const scrolled = () => vi.mocked(window.HTMLElement.prototype.scrollIntoView).mock.contexts;
    const headline = screen.getByLabelText('Headline');
    await user.type(headline, 'Hi');
    // An iPhone's tap on the sticky button leaves focus in the field: focusing it again moves nothing by itself.
    vi.mocked(window.HTMLElement.prototype.scrollIntoView).mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }));
    await waitFor(() => expect(headline).toHaveAttribute('aria-invalid', 'true'));
    expect(headline).toHaveFocus();
    await waitFor(() => expect(scrolled()).toContain(headline));
    // Valid words, no agreement: the agreement it stops on is shown too.
    await user.click(screen.getByRole('button', { name: 'Use an example' }));
    vi.mocked(window.HTMLElement.prototype.scrollIntoView).mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }));
    const agreement = screen.getByRole('checkbox', { name: /I agree to the Helper agreement/ });
    await waitFor(() => expect(agreement).toHaveFocus());
    await waitFor(() => expect(scrolled()).toContain(agreement));
    expect(onSaveProfile).not.toHaveBeenCalled();
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
    window.sessionStorage.setItem('tnm:helper-setup:usr_priya', JSON.stringify({ services: { values: onboardingSetupServicesChosen.values.services, base: JSON.stringify(onboardingProfileStep.values.services) } }));
    render(show(onboardingProfileStep));
    expect(await screen.findByText('We kept what you typed before.')).toBeVisible();
    expect(screen.getByRole('button', { name: /^Light cleaning/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^Yard cleanup/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('never puts back text typed over saved values that have changed since', async () => {
    window.sessionStorage.setItem('tnm:helper-setup:usr_priya', JSON.stringify({ services: { values: onboardingSetupServicesChosen.values.services, base: JSON.stringify({ services: [] , stale: true }) } }));
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

/** Services and area saved and the profile written, opened at What you do (so Where you help's step can be tapped). */
const allWritten: HelperOnboardingPageData = { ...onboardingSetupAboutPhoto, step: 'services', agreementNeeded: false };
const partsNav = () => within(screen.getByRole('navigation', { name: /profile.s parts/ }));
/** The line beside the buttons: Saving…, Saved, Not saved yet… */
const statusLine = () => screen.getByRole('button', { name: /^(Next: |Save and continue)/ }).parentElement!.querySelector('p[aria-live="polite"]')!;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
/**
 * A services handler that keeps a copy of each call: the form's values share their nested objects (the rows) with the
 * form, so a recorded call would change as typing goes on.
 */
function servicesSaves() {
  const sent: HelperServicesInput[] = [];
  const handler = vi.fn(async (input: HelperServicesInput) => { sent.push(JSON.parse(JSON.stringify(input)) as HelperServicesInput); return ok(); });
  return { sent, handler };
}
/** Everything kept in this tab, as one string. */
const kept = () => Array.from({ length: window.sessionStorage.length }, (_, index) => window.sessionStorage.getItem(window.sessionStorage.key(index)!) ?? '').join('\n');
const pricedAt = (cents: number) => expect.objectContaining({ services: expect.arrayContaining([expect.objectContaining({ categorySlug: 'light-cleaning', fromPriceCents: cents })]) });

async function changePriceThenOpenArea(user: ReturnType<typeof userEvent.setup>) {
  const price = screen.getByLabelText('Your price, from');
  await user.clear(price);
  await user.type(price, '95');
  // Before What you do saves itself: on to Where you help.
  await user.click(partsNav().getByRole('button', { name: /Where you help/ }));
  expect(await screen.findByRole('heading', { level: 2, name: 'Where you help' })).toBeVisible();
}

describe('each part saves on its own (aa’s sweep S3)', () => {
  it('a change in another part never cancels a part’s save on the way', async () => {
    const user = userEvent.setup();
    const onSaveServices = vi.fn(async (_input: HelperServicesInput) => ok());
    const onSaveArea = vi.fn(async (_input: HelperAreaInput) => ok());
    render(show(allWritten, { onSaveServices, onSaveArea }));
    await changePriceThenOpenArea(user);
    await user.selectOptions(screen.getByLabelText('Service radius'), '8');
    await waitFor(() => expect(onSaveArea).toHaveBeenCalledWith(expect.objectContaining({ serviceRadiusMiles: 8 })), { timeout: 4000 });
    await waitFor(() => expect(onSaveServices).toHaveBeenCalledWith(pricedAt(9500)), { timeout: 4000 });
  });

  it('Save and continue first sends what every part has waiting, and waits for each', async () => {
    const user = userEvent.setup();
    const calls: string[] = [];
    const services = deferred<ActionResult>();
    const onSaveServices = vi.fn((_input: HelperServicesInput) => { calls.push('services'); return services.promise; });
    const onSaveArea = vi.fn(async () => { calls.push('area'); return ok(); });
    const onSaveProfile = vi.fn(async () => { calls.push('profile'); return ok('/app/helper/onboarding/identity'); });
    render(show(allWritten, { onSaveServices, onSaveArea, onSaveProfile }));
    await changePriceThenOpenArea(user);
    // Next on Where you help saves only that part (nothing changed there) and never drops another's.
    await user.click(screen.getByRole('button', { name: /Next: Introduce yourself/ }));
    await user.click(await screen.findByRole('button', { name: 'Save and continue' }));
    await waitFor(() => expect(onSaveServices).toHaveBeenCalledWith(pricedAt(9500)));
    expect(onSaveProfile).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    await act(async () => { services.resolve(ok()); await services.promise; });
    await waitFor(() => expect(push).toHaveBeenCalledWith('/app/helper/onboarding/identity'));
    expect(calls).toEqual(['services', 'profile']);
    expect(kept()).toBe('');
  });

  it('a part that can’t save stops Save and continue: it opens with the error, and what was typed stays', async () => {
    const user = userEvent.setup();
    const onSaveServices = vi.fn(async (_input: HelperServicesInput): Promise<ActionResult> => ({ ok: false, code: 'unknown' }));
    const onSaveProfile = vi.fn(async () => ok('/app/helper/onboarding/identity'));
    render(show(allWritten, { onSaveServices, onSaveProfile }));
    await changePriceThenOpenArea(user);
    await user.click(screen.getByRole('button', { name: /Next: Introduce yourself/ }));
    await user.click(await screen.findByRole('button', { name: 'Save and continue' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'What you do' })).toBeVisible();
    expect(await screen.findByText(/We couldn.t complete that action/)).toBeVisible();
    expect(onSaveServices).toHaveBeenLastCalledWith(pricedAt(9500));
    expect(screen.getByLabelText('Your price, from')).toHaveValue('95');
    expect(statusLine()).not.toHaveTextContent(/^Saved$/);
    expect(onSaveProfile).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(kept()).toContain('"fromPriceCents":9500');
  });

  it('says Saved only when what’s on screen is saved', async () => {
    const user = userEvent.setup();
    const first = deferred<ActionResult>();
    let saves = 0;
    const onSaveServices = vi.fn((_input: HelperServicesInput) => ((saves += 1) === 1 ? first.promise : Promise.resolve(ok())));
    render(show(allWritten, { onSaveServices }));
    const price = screen.getByLabelText('Your price, from');
    await user.clear(price);
    await user.type(price, '95');
    await waitFor(() => expect(onSaveServices).toHaveBeenCalledTimes(1), { timeout: 4000 });
    // Typed again while that save was on its way ($95.50): the newer price isn't saved yet.
    await user.type(price, '.5');
    await act(async () => { first.resolve(ok()); await first.promise; });
    expect(statusLine()).toHaveTextContent('Not saved yet');
    await waitFor(() => expect(onSaveServices).toHaveBeenLastCalledWith(pricedAt(9550)), { timeout: 4000 });
    await waitFor(() => expect(statusLine()).toHaveTextContent(/^Saved$/));
  });

  it('a save that failed still says so after moving between parts', async () => {
    const user = userEvent.setup();
    const onSaveServices = vi.fn(async (_input: HelperServicesInput): Promise<ActionResult> => ({ ok: false, code: 'unknown' }));
    render(show(allWritten, { onSaveServices }));
    const price = screen.getByLabelText('Your price, from');
    await user.clear(price);
    await user.type(price, '95');
    await waitFor(() => expect(statusLine()).toHaveTextContent(/Couldn.t save just now/), { timeout: 4000 });
    await user.click(partsNav().getByRole('button', { name: /Where you help/ }));
    await user.click(await screen.findByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'What you do' })).toBeVisible();
    expect(statusLine()).toHaveTextContent(/Couldn.t save just now/);
  });
});

describe('hourly prices (aa’s sweep S6)', () => {
  it('start at the typical rate, and the least shown and allowed is the category’s minimum over the minimum hours', async () => {
    const user = userEvent.setup();
    const { sent, handler: onSaveServices } = servicesSaves();
    render(show(onboardingProfileStep, { onSaveServices }));
    await user.click(screen.getByRole('button', { name: /^Moving help/ }));
    // Typical $32–$40 an hour; its $35 minimum is for a task: $17.50 an hour over 2 hours.
    expect(screen.getByLabelText('Your hourly rate')).toHaveValue('32');
    expect(screen.getByText('At least $17.50 an hour ($35.00 for 2 hours).')).toBeVisible();
    const hours = screen.getByLabelText('Minimum hours');
    await user.clear(hours);
    await user.type(hours, '3');
    expect(screen.getByText('At least $11.67 an hour ($35.00 for 3 hours).')).toBeVisible();
    await user.clear(hours);
    await user.type(hours, '2');
    // Under it: Next says so, and nothing under it is ever sent.
    const rate = screen.getByLabelText('Your hourly rate');
    await user.clear(rate);
    await user.type(rate, '15');
    await user.click(screen.getByRole('button', { name: /Next: Where you help/ }));
    expect(await screen.findByText('Choose a value within the allowed range.')).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'What you do' })).toBeVisible();
    await user.clear(rate);
    await user.type(rate, '20');
    await user.click(screen.getByRole('button', { name: /Next: Where you help/ }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Where you help' })).toBeVisible();
    expect(onSaveServices).toHaveBeenLastCalledWith({ services: [{ categorySlug: 'moving-help', pricingType: 'hourly', hourlyRateCents: 2000, minHours: 2, description: '' }] });
    expect(sent.some((input) => input.services.some((service) => (service.hourlyRateCents ?? 0) < 1750))).toBe(false);
  });
});

describe('text not saved yet, kept in this tab (aa’s sweep S4)', () => {
  it('comes back after a reload once its part saved, though the server trims it and leaves the agreement out', async () => {
    const user = userEvent.setup();
    const onSaveProfile = vi.fn(async (_input: HelperProfileInput) => ok());
    render(show(onboardingSetupAboutExamples, { onSaveProfile }));
    const bio = () => screen.getByLabelText('About you', { selector: 'textarea' });
    await user.type(screen.getByLabelText('Headline'), 'Careful cleaning in Mueller ');
    await user.type(bio(), 'I clean kitchens, bathrooms and floors with my own supplies.');
    await user.click(screen.getByRole('checkbox', { name: /I agree to the Helper agreement/ }));
    await waitFor(() => expect(onSaveProfile).toHaveBeenCalledTimes(1), { timeout: 4000 });
    await waitFor(() => expect(statusLine()).toHaveTextContent(/^Saved$/));
    await user.type(bio(), ' I bring a vacuum.');
    cleanup();

    // The reload: the page as the server sends it now, trimmed and without the agreement (it's recorded).
    const sent = onSaveProfile.mock.lastCall![0];
    render(show({ ...onboardingSetupAboutExamples, agreementNeeded: false, values: { ...onboardingSetupAboutExamples.values, profile: { headline: sent.headline.trim(), bio: sent.bio.trim(), languages: sent.languages } } }));
    expect(await screen.findByText('We kept what you typed before.')).toBeVisible();
    expect(bio()).toHaveValue('I clean kitchens, bathrooms and floors with my own supplies. I bring a vacuum.');
  });

  it('comes back whatever order the server keeps the services in', async () => {
    const user = userEvent.setup();
    const { sent: saves, handler: onSaveServices } = servicesSaves();
    render(show(onboardingProfileStep, { onSaveServices }));
    // Yard cleanup first, then furniture assembly: the server keeps them in category order.
    await user.click(screen.getByRole('button', { name: /^Yard cleanup/ }));
    await user.click(screen.getByRole('button', { name: /^Furniture assembly/ }));
    await waitFor(() => expect(onSaveServices).toHaveBeenLastCalledWith({ services: [expect.objectContaining({ categorySlug: 'yard-cleanup' }), expect.objectContaining({ categorySlug: 'furniture-assembly' })] }), { timeout: 4000 });
    await waitFor(() => expect(statusLine()).toHaveTextContent(/^Saved$/));
    const yardPrice = () => within(screen.getByRole('region', { name: 'Yard cleanup' })).getByLabelText('Your price, from');
    await user.clear(yardPrice());
    await user.type(yardPrice(), '75');
    cleanup();

    const sent = saves.at(-1)!.services;
    const inCategoryOrder = ['furniture-assembly', 'yard-cleanup'].map((slug) => {
      const { categorySlug, pricingType, fromPriceCents, description } = sent.find((service) => service.categorySlug === slug)!;
      return { categorySlug, pricingType, ...(fromPriceCents !== undefined ? { fromPriceCents } : {}), description };
    });
    render(show({ ...onboardingProfileStep, step: 'services', values: { ...onboardingProfileStep.values, services: { services: inCategoryOrder } } }));
    expect(await screen.findByText('We kept what you typed before.')).toBeVisible();
    expect(yardPrice()).toHaveValue('75');
  });

  it('belongs to its account: another account with the same name, or another id, never gets it', async () => {
    const draft = JSON.stringify({ services: { values: onboardingSetupServicesChosen.values.services, base: JSON.stringify(onboardingProfileStep.values.services) } });
    // What another "Priya S." typed in this tab: under the name, as drafts once were, or under her own id.
    window.sessionStorage.setItem('tnm:helper-setup:Priya S.', draft);
    window.sessionStorage.setItem('tnm:helper-setup:usr_another_priya', draft);
    render(show(onboardingProfileStep));
    await act(async () => { await new Promise((resolve) => requestAnimationFrame(() => resolve(null))); });
    expect(screen.queryByText('We kept what you typed before.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Light cleaning/ })).toHaveAttribute('aria-pressed', 'false');
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
