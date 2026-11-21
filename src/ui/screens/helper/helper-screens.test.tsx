/** @vitest-environment jsdom */
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routes, type ActionResult, type HelperOnboardingPageData, type HelperProfileEditorHandlers } from '@/contracts';
import { fakeOnboardingHandlers, fakeProfileEditorHandlers, onboardingAreaStep, onboardingDone, onboardingDoneAwaitingCity, onboardingDoneAwaitingCityPending, onboardingIdentityStep, onboardingProfileStep, onboardingServicesStep, samProfileEditorData } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import { HelperOnboardingScreen } from './helper-onboarding-screen';
import { HelperProfileEditorScreen } from './helper-profile-editor-screen';

const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }), usePathname: () => '/app/helper/onboarding/profile' }));
let desktop = false;

beforeEach(() => {
  desktop = false;
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: desktop,
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

function showEditor(overrides: Partial<HelperProfileEditorHandlers> = {}, paused = false) {
  return show(<HelperProfileEditorScreen data={{ ...samProfileEditorData, paused }} handlers={{ ...fakeProfileEditorHandlers, ...overrides }} />);
}

const privateProviderLabels = /\bID number\b|\bSSN\b|\bDOB\b|social security|date of birth|bank (account|details)/i;

function copyValues(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') return Object.values(value).map(copyValues).join('\n');
  return '';
}

describe('helper onboarding screen', () => {
  it('links completed steps and keeps locked steps out of the link path', () => {
    show(<HelperOnboardingScreen data={onboardingIdentityStep} handlers={fakeOnboardingHandlers} />);
    const navigation = within(screen.getByRole('navigation', { name: 'Helper setup progress' }));
    // The profile's three steps are one entry (plan 9.11), done here, linking to the profile.
    expect(navigation.queryByText(uiMessages.helperOnboarding.screen.steps.services)).not.toBeInTheDocument();
    expect(navigation.queryByText(uiMessages.helperOnboarding.screen.steps.area)).not.toBeInTheDocument();
    for (const { step, state } of onboardingIdentityStep.progress.steps.filter(({ step }) => step !== 'services' && step !== 'area')) {
      const label = uiMessages.helperOnboarding.screen.steps[step];
      if (state === 'done') {
        expect(navigation.getByRole('link', { name: new RegExp(`${label}\\s*Done`) })).toHaveAttribute('href', routes.app.helperOnboarding(step));
      } else {
        expect(navigation.queryByRole('link', { name: new RegExp(label) })).not.toBeInTheDocument();
      }
    }
    expect(navigation.getByText('Current step').closest('li')).toHaveAttribute('aria-current', 'step');
    expect(screen.queryByRole('link', { name: 'Continue to Payout setup' })).not.toBeInTheDocument();
  });

  it('uses explicit bookability even when all verification statuses are complete', () => {
    const data: HelperOnboardingPageData = {
      ...onboardingDone,
      progress: {
        ...onboardingDone.progress,
        bookable: false,
        bookableCategories: [],
        steps: [
          { step: 'profile', state: 'done' },
          { step: 'services', state: 'done' },
          { step: 'area', state: 'done' },
          { step: 'identity', state: 'todo' },
          { step: 'payout', state: 'locked' },
          { step: 'background', state: 'skipped' },
          { step: 'done', state: 'current' },
        ],
      },
    };
    show(<HelperOnboardingScreen data={data} handlers={fakeOnboardingHandlers} />);
    expect(screen.getByRole('heading', { name: 'A few steps left' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Find work' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Finish ID check' })).toHaveAttribute('href', routes.app.helperOnboarding('identity'));
    expect(screen.queryByRole('link', { name: /Payout setup/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Finish Background check/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('says a step waiting for our team is in review, not one to finish (journeys on a phone, J-H6)', () => {
    const steps = onboardingDone.progress.steps.map((entry) => (entry.step === 'address' ? { ...entry, state: 'in_review' as const } : entry.step === 'done' ? { ...entry, state: 'current' as const } : entry));
    show(<HelperOnboardingScreen data={{ ...onboardingDone, progress: { ...onboardingDone.progress, bookable: false, bookableCategories: [], steps } }} handlers={fakeOnboardingHandlers} />);
    expect(screen.getByRole('heading', { name: 'A few steps left' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Home address: in review' })).toHaveAttribute('href', routes.app.helperOnboarding('address'));
    expect(screen.queryByRole('link', { name: /Finish Home address/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Our team is checking what you sent/)).toBeVisible();
    expect(screen.queryByText(/Finish the available steps below/)).not.toBeInTheDocument();
  });

  it('shows the earned welcome gift card (no first task) and the find-work link on the last step', () => {
    show(<HelperOnboardingScreen data={onboardingDone} handlers={fakeOnboardingHandlers} />);
    expect(screen.getByRole('heading', { name: 'You can make offers now' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Find work' })).toHaveAttribute('href', routes.app.findWork());
    const reward = screen.getByRole('region', { name: 'Your $50 gift card is yours' });
    expect(reward).toHaveTextContent('3 of 3 checks done');
    expect(reward).toHaveTextContent('Founding helper #4');
    expect(reward).not.toHaveTextContent(/\$40|60 days|spots? left/);
    // The last step shows the card itself, not the strip.
    expect(screen.queryByRole('complementary', { name: 'Welcome gift card' })).not.toBeInTheDocument();
  });

  it('puts the three checks and the gift card under the stepper on the steps in between, and marks the steps that earn it', () => {
    show(<HelperOnboardingScreen data={onboardingIdentityStep} handlers={fakeOnboardingHandlers} />);
    expect(screen.getByRole('complementary', { name: 'Welcome gift card' })).toHaveTextContent('1 of 3 checks done for your $50 gift card.');
    // The three steps in the list, and the phone's "Step 5 of 9: ID check" line (the ID step is one of them).
    expect(screen.getAllByText('. Counts toward your welcome gift card')).toHaveLength(4);
  });

  it('on phones, keeps the step list (the current step too) behind "All steps", so the card sits under the bar', async () => {
    show(<HelperOnboardingScreen data={onboardingIdentityStep} handlers={fakeOnboardingHandlers} />);
    const navigation = screen.getByRole('navigation', { name: 'Helper setup progress' });
    const list = navigation.querySelector('ol')!;
    expect(list).toHaveClass('max-sm:hidden');
    expect(list.querySelector('[aria-current="step"]')).not.toHaveClass('max-sm:col-span-2');
    await userEvent.click(within(navigation).getByRole('button', { name: 'All steps' }));
    expect(list).not.toHaveClass('max-sm:hidden');
    expect(within(navigation).getByRole('button', { name: 'Fewer steps' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('omits the welcome gift card when the app does not supply one', () => {
    show(<HelperOnboardingScreen data={{ ...onboardingDone, welcomeReward: undefined }} handlers={fakeOnboardingHandlers} />);
    expect(screen.queryByRole('region', { name: /gift card/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Find work' })).toBeVisible();
  });

  it('tells a verified helper outside our cities we will say when their city opens (national, 2026-11-14)', () => {
    show(<HelperOnboardingScreen data={onboardingDoneAwaitingCity} handlers={fakeOnboardingHandlers} />);
    expect(screen.getByRole('heading', { name: "You're verified. We'll tell you the moment Dallas opens." })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'A few steps left' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Find work' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Get your profile ready' })).toHaveAttribute('href', routes.app.helperProfile());
    expect(screen.getByRole('link', { name: 'Change your city' })).toHaveAttribute('href', routes.app.helperOnboarding('area'));
    // The home address waits for the city: it's neither a step to finish nor "not needed".
    expect(screen.queryByRole('link', { name: /Finish Home address/ })).not.toBeInTheDocument();
    const navigation = within(screen.getByRole('navigation', { name: 'Helper setup progress' }));
    expect(navigation.getByText('Home address').closest('li')).toHaveTextContent('When your city opens');
  });

  it('lists the checks still to do for a helper waiting for their city', () => {
    show(<HelperOnboardingScreen data={onboardingDoneAwaitingCityPending} handlers={fakeOnboardingHandlers} />);
    expect(screen.getByRole('heading', { name: "We're not in Dallas, TX yet" })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Finish Background check' })).toHaveAttribute('href', routes.app.helperOnboarding('background'));
  });

  it.each([onboardingProfileStep, onboardingServicesStep, onboardingAreaStep])('does not collect private provider details in the $step form', (data) => {
    show(<HelperOnboardingScreen data={data} handlers={fakeOnboardingHandlers} />);
    expect(screen.queryByLabelText(privateProviderLabels)).not.toBeInTheDocument();
  });

  it.each(['helperOnboarding', 'helperProfileEditor'] as const)('keeps %s copy within the product glossary', (namespace) => {
    expect(copyValues(uiMessages[namespace])).not.toMatch(/\b(job|gig|bid|quote|contract|order|worker|employee|contractor|tasker|customer|employer|commission|wages|escrow|wallet|guaranteed|hire|best|cheapest|bonus pay|cash)\b/i);
  });
});

describe('helper profile editor screen', () => {
  it('pauses through the handler, waits for confirmation, and announces Saved', async () => {
    let finish: (result: ActionResult) => void = () => {};
    const onSetPaused = vi.fn(() => new Promise<ActionResult>((resolve) => { finish = resolve; }));
    showEditor({ onSetPaused });
    const visibility = within(screen.getByRole('region', { name: 'Visibility' }));
    const button = visibility.getByRole('button', { name: 'Pause profile' });
    await userEvent.click(button);
    expect(onSetPaused).toHaveBeenCalledExactlyOnceWith({ paused: true });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(visibility.getByText('Your profile is visible')).toBeVisible();
    expect(visibility.queryByText('Saved')).not.toBeInTheDocument();
    await act(async () => finish({ ok: true, code: 'updated' }));
    expect(await visibility.findByText('Your profile is paused')).toBeVisible();
    expect(visibility.getByRole('button', { name: 'Resume profile' })).toBeEnabled();
    expect(visibility.getByRole('status')).toHaveTextContent('Saved');
  });

  it('keeps the visible state when pausing fails and offers a retry', async () => {
    const onSetPaused = vi.fn(async (): Promise<ActionResult> => ({ ok: false, code: 'unknown' }));
    showEditor({ onSetPaused });
    const visibility = within(screen.getByRole('region', { name: 'Visibility' }));
    await userEvent.click(visibility.getByRole('button', { name: 'Pause profile' }));
    expect(await visibility.findByText(uiMessages.feedback.error.unknown)).toBeVisible();
    expect(visibility.getByText('Your profile is visible')).toBeVisible();
    expect(visibility.getByRole('button', { name: 'Pause profile' })).toBeEnabled();
    expect(visibility.queryByRole('button', { name: 'Resume profile' })).not.toBeInTheDocument();
    expect(visibility.queryByText('Saved')).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('resumes a paused profile using the matching handler value', async () => {
    const onSetPaused = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated' }));
    showEditor({ onSetPaused }, true);
    const visibility = within(screen.getByRole('region', { name: 'Visibility' }));
    expect(visibility.getByText('Your profile is paused')).toBeVisible();
    await userEvent.click(visibility.getByRole('button', { name: 'Resume profile' }));
    expect(onSetPaused).toHaveBeenCalledExactlyOnceWith({ paused: false });
    expect(await visibility.findByText('Your profile is visible')).toBeVisible();
    expect(visibility.getByRole('status')).toHaveTextContent('Saved');
  });

  it("links to the public profile only while it's live: a draft or paused one says why there's none yet", () => {
    const draft = show(<HelperProfileEditorScreen data={{ ...samProfileEditorData, publicProfile: false }} handlers={fakeProfileEditorHandlers} />);
    expect(screen.queryByRole('link', { name: 'View public profile' })).not.toBeInTheDocument();
    expect(screen.getByText('Your public profile appears once you can be booked.')).toBeVisible();
    draft.unmount();
    show(<HelperProfileEditorScreen data={{ ...samProfileEditorData, paused: true, publicProfile: false }} handlers={fakeProfileEditorHandlers} />);
    expect(screen.queryByRole('link', { name: 'View public profile' })).not.toBeInTheDocument();
    expect(screen.getByText('Your profile is paused, so your public page is hidden.')).toBeVisible();
  });

  it('builds the public profile link from the handle and offers all phone sections', () => {
    showEditor();
    expect(screen.getByRole('link', { name: 'View public profile' })).toHaveAttribute('href', routes.helperProfile(samProfileEditorData.handle));
    const navigation = within(screen.getByRole('navigation', { name: 'Edit profile sections' }));
    for (const [section, label] of Object.entries(uiMessages.helperProfileEditor.screen.sections)) {
      expect(navigation.getByRole('link', { name: label })).toHaveAttribute('href', `${routes.app.helperProfile()}#helper-section-${section}`);
      expect(screen.getByRole('region', { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByLabelText(privateProviderLabels)).not.toBeInTheDocument();
  });

  it('connects desktop tabs to their panels and preserves a profile draft while switching', async () => {
    desktop = true;
    showEditor();
    for (const tab of screen.getAllByRole('tab')) {
      const controlledId = tab.getAttribute('aria-controls');
      expect(controlledId).toBeTruthy();
      const panel = document.getElementById(controlledId!);
      expect(panel).toHaveAttribute('role', 'tabpanel');
      expect(panel).toHaveAccessibleName(tab.textContent!);
    }
    const user = userEvent.setup();
    const headline = screen.getByRole('textbox', { name: 'Headline' });
    await user.clear(headline);
    await user.type(headline, 'Careful help around Hyde Park');
    await user.click(screen.getByRole('tab', { name: 'Services' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Services' })).toHaveAttribute('aria-selected', 'true'));
    await user.click(screen.getByRole('tab', { name: 'Profile' }));
    expect(screen.getByRole('textbox', { name: 'Headline' })).toHaveValue('Careful help around Hyde Park');
  });
});
