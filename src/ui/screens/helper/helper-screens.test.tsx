/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routes, type ActionResult, type HelperOnboardingHandlers, type HelperProfileEditorHandlers } from '@/contracts';
import {
  fakeOnboardingHandlers,
  fakeProfileEditorHandlers,
  onboardingAddressStep,
  onboardingAreaStep,
  onboardingDone,
  onboardingDoneHelping,
  onboardingIdentityStep,
  onboardingPhoneStep,
  onboardingProfileStep,
  onboardingServicesStep,
  samProfileEditorData,
  samResumeRead,
} from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import { HelperOnboardingScreen } from './helper-onboarding-screen';
import { HelperProfileEditorScreen } from './helper-profile-editor-screen';

const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh, back: vi.fn() }), usePathname: () => '/app/helper/verification' }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

function show(children: ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={uiMessages}>{children}</NextIntlClientProvider>);
}

const privateProviderLabels = /\bID number\b|\bSSN\b|\bDOB\b|social security|date of birth|bank (account|details)/i;
const hub = uiMessages.verifyFlow.hub;
const flow = uiMessages.verifyFlow;
const page = uiMessages.helperProfileEditor.page;

function copyValues(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') return Object.values(value).map(copyValues).join('\n');
  return '';
}

const hrefs = () => screen.getAllByRole('link').map((link) => link.getAttribute('href'));

describe('Verifications (owner, 2026-11-27: every check picked in any order)', () => {
  it('lists every check with where it stands and opens the ID, address and phone checks in place', () => {
    show(<HelperOnboardingScreen data={onboardingDoneHelping} handlers={fakeOnboardingHandlers} />);
    expect(screen.getByRole('heading', { level: 1, name: hub.title })).toBeInTheDocument();
    for (const check of ['identity', 'address', 'phone', 'payout', 'background'] as const) expect(screen.getByText(hub.checks[check].title)).toBeInTheDocument();
    // The ID is with our team; the address and phone are done.
    expect(screen.getAllByText(hub.statuses.inReview).length).toBeGreaterThan(0);
    expect(screen.getAllByText(hub.statuses.verified).length).toBeGreaterThan(0);
    expect(hrefs()).toEqual(expect.arrayContaining([routes.app.helperCheck('identity'), routes.app.helperCheck('address'), routes.app.helperCheck('phone')]));
    // No stepper, no "Step 5 of 9".
    expect(screen.queryByRole('navigation', { name: 'Helper setup progress' })).not.toBeInTheDocument();
  });

  it('starts payouts with the provider and follows its link', async () => {
    const onStartPayout = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated', redirectTo: '/dev/providers/payout' }));
    show(<HelperOnboardingScreen data={onboardingDoneHelping} handlers={{ ...fakeOnboardingHandlers, onStartPayout }} />);
    await userEvent.click(screen.getByRole('button', { name: hub.actions.setUp }));
    expect(onStartPayout).toHaveBeenCalledOnce();
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dev/providers/payout'));
  });

  it('asks for the background check summary before Checkr opens', async () => {
    const onStartBackgroundCheck = vi.fn<HelperOnboardingHandlers['onStartBackgroundCheck']>(async () => ({ ok: true, code: 'updated', redirectTo: '/dev/providers/background' }));
    show(<HelperOnboardingScreen data={onboardingDoneHelping} handlers={{ ...fakeOnboardingHandlers, onStartBackgroundCheck }} />);
    await userEvent.click(screen.getByRole('button', { name: hub.actions.start }));
    const dialog = within(screen.getByRole('dialog', { name: hub.background.title }));
    const go = dialog.getByRole('button', { name: hub.background.continue });
    expect(go).toBeDisabled();
    await userEvent.click(dialog.getByRole('checkbox'));
    await userEvent.click(go);
    expect(onStartBackgroundCheck).toHaveBeenCalledWith({ acknowledged: true });
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dev/providers/background'));
  });

  it('says so when every check is done', () => {
    show(<HelperOnboardingScreen data={onboardingDone} handlers={fakeOnboardingHandlers} />);
    expect(screen.getByText(hub.allDone)).toBeInTheDocument();
    expect(screen.getByText(hub.progress.replace('{done}', '5').replace('{total}', '5'))).toBeInTheDocument();
  });

  it('opens the ID step as its flow: consent first, then the kind of ID', async () => {
    const onAcceptIdentityNotice = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated' }));
    show(<HelperOnboardingScreen data={onboardingIdentityStep} handlers={{ ...fakeOnboardingHandlers, onAcceptIdentityNotice }} />);
    expect(screen.getByRole('heading', { name: flow.id.intro.title })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: flow.id.intro.start }));
    expect(screen.getByText(flow.id.intro.consentRequired)).toBeInTheDocument();
    expect(onAcceptIdentityNotice).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('checkbox', { name: flow.id.intro.consent }));
    await userEvent.click(screen.getByRole('button', { name: flow.id.intro.start }));
    expect(onAcceptIdentityNotice).toHaveBeenCalledWith({ consent: true });
    expect(await screen.findByRole('heading', { name: flow.id.type.title })).toBeInTheDocument();
  });

  it('opens the address and phone steps as their flows', () => {
    show(<HelperOnboardingScreen data={onboardingAddressStep} handlers={fakeOnboardingHandlers} />);
    expect(screen.getByRole('heading', { name: flow.address.intro.title })).toBeInTheDocument();
    cleanup();
    show(<HelperOnboardingScreen data={{ ...onboardingPhoneStep, verification: { ...onboardingPhoneStep.verification, phone: { verified: false } } }} handlers={fakeOnboardingHandlers} />);
    expect(screen.getByRole('heading', { name: flow.phone.title })).toBeInTheDocument();
  });

  it.each([onboardingProfileStep, onboardingServicesStep, onboardingAreaStep])('does not collect private provider details in the $step form', (data) => {
    show(<HelperOnboardingScreen data={data} handlers={fakeOnboardingHandlers} />);
    expect(screen.queryByLabelText(privateProviderLabels)).not.toBeInTheDocument();
  });

  it.each(['helperOnboarding', 'helperProfileEditor', 'verifyFlow'] as const)('keeps %s copy within the product glossary', (namespace) => {
    expect(copyValues(uiMessages[namespace])).not.toMatch(/\b(job|gig|bid|quote|contract|order|worker|employee|contractor|tasker|customer|employer|commission|wages|escrow|wallet|guaranteed|hire|best|cheapest|bonus pay|cash)\b/i);
  });
});

function showEditor(overrides: Partial<HelperProfileEditorHandlers> = {}, data = samProfileEditorData) {
  return show(<HelperProfileEditorScreen data={data} handlers={{ ...fakeProfileEditorHandlers, ...overrides }} />);
}

describe('the helper’s own profile, LinkedIn-style (owner, 2026-11-27)', () => {
  it('leads with the card: name, headline, area, import and the public page, then the sections as clients read them', () => {
    showEditor();
    expect(screen.getByRole('heading', { level: 1, name: samProfileEditorData.person.displayName })).toBeInTheDocument();
    expect(screen.getByText(samProfileEditorData.values.profile.headline)).toBeInTheDocument();
    expect(screen.getAllByText(samProfileEditorData.areaLabel!).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: page.importResume })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: page.viewPublic })).toHaveAttribute('href', routes.helperProfile(samProfileEditorData.handle));
    for (const section of [page.about, page.services, page.skills, page.experience, page.tools, page.area, page.workSamples]) expect(screen.getByRole('heading', { level: 2, name: section })).toBeInTheDocument();
    for (const item of [...samProfileEditorData.values.preferences.skills, ...samProfileEditorData.values.preferences.excludes]) expect(screen.getByText(item)).toBeInTheDocument();
    expect(screen.getByText(samProfileEditorData.values.experience.experience[0]!.title)).toBeInTheDocument();
  });

  it('has no public link while the profile is a draft, and says so', () => {
    showEditor({}, { ...samProfileEditorData, publicProfile: false });
    expect(screen.queryByRole('link', { name: page.viewPublic })).not.toBeInTheDocument();
    expect(screen.getByText(page.statusDraft)).toBeInTheDocument();
  });

  it('pauses from the menu and refreshes', async () => {
    const onSetPaused = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated' }));
    showEditor({ onSetPaused });
    await userEvent.click(screen.getByRole('button', { name: page.more }));
    await userEvent.click(await screen.findByRole('menuitem', { name: page.pauseProfile }));
    expect(onSetPaused).toHaveBeenCalledWith({ paused: true });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('edits a section in a dialog that closes once saved', async () => {
    const onSavePreferences = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'saved' }));
    showEditor({ onSavePreferences });
    await userEvent.click(screen.getByRole('button', { name: page.editSection.replace('{section}', page.skills) }));
    const dialog = within(screen.getByRole('dialog'));
    await userEvent.type(dialog.getByLabelText(uiMessages.helperProfileEditor.lists.skills), 'Tile grout{Enter}');
    await userEvent.click(dialog.getByRole('button', { name: uiMessages.helperProfileEditor.lists.save }));
    expect(onSavePreferences).toHaveBeenCalledWith(expect.objectContaining({ skills: [...samProfileEditorData.values.preferences.skills, 'Tile grout'] }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('imports a resume: reads it, shows the suggestions to keep, and adds what was kept', async () => {
    const onReadResume = vi.fn(async () => samResumeRead);
    const onApplyResume = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'saved' }));
    showEditor({ onReadResume, onApplyResume });
    await userEvent.click(screen.getByRole('button', { name: page.importResume }));
    const dialog = within(screen.getByRole('dialog'));
    const input = document.querySelector<HTMLInputElement>('[role="dialog"] input[type="file"]')!;
    await userEvent.upload(input, new File(['%PDF-1.4 resume'], 'resume.pdf', { type: 'application/pdf' }));
    expect(onReadResume).toHaveBeenCalledOnce();
    // Everything starts kept; one skill is left out.
    await userEvent.click(await dialog.findByRole('button', { name: 'Truck loading', pressed: true }));
    await userEvent.click(dialog.getByRole('button', { name: /Add \d+ items to my profile/ }));
    expect(onApplyResume).toHaveBeenCalledWith(expect.objectContaining({
      skills: ['Flat-pack assembly', 'Furniture moving', 'Wall mounting', 'Packing'],
      excludes: ['Pianos and safes', 'Electrical wiring'],
    }));
    expect(await dialog.findByText(uiMessages.helperProfileEditor.resume.done.title)).toBeInTheDocument();
  });
});
