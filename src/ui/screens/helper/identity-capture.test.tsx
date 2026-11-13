/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IDENTITY_CAPTURE_REJECTION_REASONS, LIVENESS_PROMPTS, routes, type ActionResult, type IdentityCaptureResult } from '@/contracts';
import {
  fakeOnboardingHandlers,
  onboardingIdentityCapture,
  onboardingIdentityCaptureApproved,
  onboardingIdentityCaptureInReview,
  onboardingIdentityCaptureRejected,
  onboardingIdentityStep,
  onboardingIdentityTooMany,
  onboardingIdentityTryLater,
  onboardingIdentityUnder18,
} from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import copy from '../../../../messages/en/ui/verification.json';
import { HelperOnboardingScreen } from './helper-onboarding-screen';
import { IdentityCaptureStep, type IdentityCaptureStepProps } from './identity-capture';

const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const c = copy.capture;
const photo = (name = 'photo.jpg', type = 'image/jpeg', size = 1024) => new File([new Uint8Array(size)], name, { type });

function show(props: Partial<IdentityCaptureStepProps> = {}) {
  return render(<NextIntlClientProvider locale="en" messages={uiMessages}><IdentityCaptureStep verification={onboardingIdentityCapture.verification} handlers={fakeOnboardingHandlers} {...props} /></NextIntlClientProvider>);
}

/** The notice is accepted: choose the ID, then take each photo with the file input (jsdom has no camera). */
async function takePhotos(type: 'drivers_license' | 'passport') {
  await userEvent.click(screen.getByRole('radio', { name: new RegExp(c.documentType.types[type]) }));
  await userEvent.click(screen.getByRole('button', { name: c.continue }));
  const photos = type === 'passport' ? 2 : 3;
  for (let index = 1; index <= photos; index += 1) {
    expect(screen.getByText(`Photo ${index} of ${photos}`)).toBeVisible();
    const selfie = index === photos;
    // No camera here: the selfie falls back to the camera app; a document can be uploaded.
    await userEvent.upload(screen.getByLabelText(selfie ? c.camera.uploadSelfie : c.camera.upload), photo());
    await userEvent.click(await screen.findByRole('button', { name: c.photo.use }));
  }
}

describe('our own ID check (stage 1)', () => {
  it('records the Texas notice before any photo, and only once it is ticked', async () => {
    const onAcceptIdentityNotice = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated' }));
    show({ verification: onboardingIdentityStep.verification, handlers: { ...fakeOnboardingHandlers, onAcceptIdentityNotice } });
    expect(screen.getByText(c.notice.body)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: c.notice.continue }));
    expect(screen.getByText(c.notice.required)).toBeVisible();
    expect(onAcceptIdentityNotice).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('checkbox', { name: c.notice.checkbox }));
    await userEvent.click(screen.getByRole('button', { name: c.notice.continue }));
    expect(onAcceptIdentityNotice).toHaveBeenCalledExactlyOnceWith({ consent: true });
    expect(await screen.findByRole('heading', { name: c.documentType.legend })).toHaveFocus();
  });

  it('asks which ID, then takes the front, the back and a selfie that follows its prompt, and sends them', async () => {
    const onSubmitIdentityCapture = vi.fn(async (_form: FormData): Promise<IdentityCaptureResult> => ({ ok: true, code: 'submitted' }));
    show({ handlers: { ...fakeOnboardingHandlers, onSubmitIdentityCapture } });
    await userEvent.click(screen.getByRole('button', { name: c.continue }));
    expect(screen.getByText(c.documentType.required)).toBeVisible();
    await takePhotos('drivers_license');
    expect(screen.getByRole('heading', { name: c.review.title })).toBeVisible();
    const prompt = onboardingIdentityCapture.verification.identity.capture!.prompt;
    expect(screen.getByText(`Your selfie should show: ${c.prompt[prompt]}.`)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: c.review.submit }));
    expect(onSubmitIdentityCapture).toHaveBeenCalledTimes(1);
    const form = onSubmitIdentityCapture.mock.calls[0]![0];
    expect(form.get('documentType')).toBe('drivers_license');
    for (const kind of ['front', 'back', 'selfie']) expect(form.get(kind)).toBeInstanceOf(File);
    expect(await screen.findByText(c.review.sent)).toBeVisible();
    expect(refresh).toHaveBeenCalled();
  });

  it('skips the back for a passport, and shows the selfie prompt before the photo', async () => {
    const onSubmitIdentityCapture = vi.fn(async (_form: FormData): Promise<IdentityCaptureResult> => ({ ok: true, code: 'submitted' }));
    show({ handlers: { ...fakeOnboardingHandlers, onSubmitIdentityCapture } });
    await userEvent.click(screen.getByRole('radio', { name: new RegExp(c.documentType.types.passport) }));
    await userEvent.click(screen.getByRole('button', { name: c.continue }));
    expect(screen.getByRole('heading', { name: c.steps.front.passportTitle })).toBeVisible();
    await userEvent.upload(screen.getByLabelText(c.camera.upload), photo());
    await userEvent.click(await screen.findByRole('button', { name: c.photo.use }));
    expect(screen.getByRole('heading', { name: c.steps.selfie.title })).toBeVisible();
    expect(screen.getByText(c.prompt.look_left)).toBeVisible();
    await userEvent.upload(screen.getByLabelText(c.camera.uploadSelfie), photo());
    await userEvent.click(await screen.findByRole('button', { name: c.photo.use }));
    await userEvent.click(screen.getByRole('button', { name: c.review.submit }));
    const form = onSubmitIdentityCapture.mock.calls[0]![0];
    expect(form.get('documentType')).toBe('passport');
    expect(form.get('back')).toBeNull();
  });

  it('lets each photo be retaken, before and after the review', async () => {
    show();
    await userEvent.click(screen.getByRole('radio', { name: new RegExp(c.documentType.types.drivers_license) }));
    await userEvent.click(screen.getByRole('button', { name: c.continue }));
    await userEvent.upload(screen.getByLabelText(c.camera.upload), photo());
    await userEvent.click(await screen.findByRole('button', { name: c.photo.retake }));
    expect(screen.getByLabelText(c.camera.upload)).toBeInTheDocument();
    cleanup();
    show({ preview: { step: 'review', documentType: 'drivers_license', photos: { front: '/a.svg', back: '/b.svg', selfie: '/c.svg' } } });
    await userEvent.click(screen.getByRole('button', { name: c.photo.retakeNamed.replace('{photo}', c.photo.names.back) }));
    expect(screen.getByRole('heading', { name: c.steps.back.title })).toHaveFocus();
  });

  it('puts the app’s photo errors on the photos, and sends the person back for the notice or the ID kind', async () => {
    const answers: IdentityCaptureResult[] = [
      { ok: false, code: 'validation_failed', fieldErrors: { selfie: ['invalid'] } },
      { ok: false, code: 'validation_failed', fieldErrors: { documentType: ['required'] } },
    ];
    const onSubmitIdentityCapture = vi.fn(async (): Promise<IdentityCaptureResult> => answers.shift()!);
    show({ handlers: { ...fakeOnboardingHandlers, onSubmitIdentityCapture }, preview: { step: 'review', documentType: 'drivers_license', photos: { front: '/a.svg', back: '/b.svg', selfie: '/c.svg' } } });
    await userEvent.click(screen.getByRole('button', { name: c.review.submit }));
    expect(await screen.findByText(c.errors.photo.invalid)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: c.review.submit }));
    expect(await screen.findByRole('heading', { name: c.documentType.legend })).toBeVisible();
    expect(screen.getByText(c.documentType.required)).toBeVisible();
  });

  it.each(['too_large', 'unsupported_type', 'rate_limited', 'not_allowed', 'unknown'] as const)('explains a %s result without the raw code, and keeps the photos', async (code) => {
    const onSubmitIdentityCapture = vi.fn(async (): Promise<IdentityCaptureResult> => ({ ok: false, code }));
    show({ handlers: { ...fakeOnboardingHandlers, onSubmitIdentityCapture }, preview: { step: 'review', documentType: 'passport', photos: { front: '/a.svg', selfie: '/c.svg' } } });
    const send = screen.getByRole('button', { name: c.review.submit });
    await userEvent.click(send);
    await waitFor(() => expect(send).toBeEnabled());
    expect(screen.getByText(c.errors[code].replace('{megabytes}', '3'))).toBeVisible();
    expect(screen.queryByText(code, { exact: true })).not.toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });

  it('disables sending while it waits, and sends once', async () => {
    let finish: (result: IdentityCaptureResult) => void = () => {};
    const onSubmitIdentityCapture = vi.fn(() => new Promise<IdentityCaptureResult>((resolve) => { finish = resolve; }));
    show({ handlers: { ...fakeOnboardingHandlers, onSubmitIdentityCapture }, preview: { step: 'review', documentType: 'passport', photos: { front: '/a.svg', selfie: '/c.svg' } } });
    const send = screen.getByRole('button', { name: c.review.submit });
    await userEvent.click(send);
    const sending = screen.getByRole('button', { name: c.review.sending });
    expect(sending).toBeDisabled();
    expect(sending).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(sending);
    expect(onSubmitIdentityCapture).toHaveBeenCalledTimes(1);
    finish({ ok: true, code: 'submitted' });
    expect(await screen.findByText(c.review.sent)).toBeVisible();
  });

  it('says photos are in review, with only a status check', async () => {
    const onRefreshStatus = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated' }));
    show({ verification: onboardingIdentityCaptureInReview.verification, handlers: { ...fakeOnboardingHandlers, onRefreshStatus } });
    expect(screen.getByText(c.statuses.in_review)).toBeVisible();
    expect(screen.getByText(new RegExp(c.inReview.slice(0, 30)))).toBeVisible();
    expect(screen.queryByRole('button', { name: c.continue })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: c.checkStatus }));
    expect(onRefreshStatus).toHaveBeenCalledTimes(1);
  });

  it('gives the reason photos were turned down, and a new try', () => {
    show({ verification: onboardingIdentityCaptureRejected.verification });
    expect(screen.getByText(c.rejectionReasons.prompt_not_followed)).toBeVisible();
    expect(screen.getByText(c.statuses.retake)).toBeVisible();
    expect(screen.getByRole('heading', { name: c.documentType.legend })).toBeVisible();
  });

  it.each([
    ['try_later', onboardingIdentityTryLater, false],
    ['too_many_attempts', onboardingIdentityTooMany, true],
    ['under_18', onboardingIdentityUnder18, true],
  ] as const)('pauses the capture (%s), with support when our team has to look', (blocked, data, support) => {
    show({ verification: data.verification });
    expect(screen.getByText(new RegExp(copy.setup.identityBlocked[blocked].split('{')[0]!.slice(0, 30)))).toBeVisible();
    expect(screen.queryByRole('button', { name: c.continue })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: copy.setup.contactSupport }) !== null).toBe(support);
    if (support) expect(screen.getByRole('link', { name: copy.setup.contactSupport })).toHaveAttribute('href', routes.app.support());
  });

  it('never asks for an ID number, a birth date or other private fields', () => {
    show({ verification: onboardingIdentityStep.verification });
    expect(screen.queryByLabelText(/ID number|SSN|social security|date of birth|birth date/i)).not.toBeInTheDocument();
  });

  it('has copy for every prompt and reason, without banned words', () => {
    for (const prompt of LIVENESS_PROMPTS) expect(c.prompt[prompt]).toBeTruthy();
    for (const reason of IDENTITY_CAPTURE_REJECTION_REASONS) expect(c.rejectionReasons[reason]).toBeTruthy();
    expect(JSON.stringify(c)).not.toMatch(/\b(escrow|wallet|guaranteed|hire|best|cheapest|gig|job|worker|tasker|bonus pay)\b/i);
  });
});

describe('the ID step on the onboarding screen', () => {
  const screenWith = (data: Parameters<typeof HelperOnboardingScreen>[0]['data']) => render(<NextIntlClientProvider locale="en" messages={uiMessages}><HelperOnboardingScreen data={data} handlers={fakeOnboardingHandlers} /></NextIntlClientProvider>);

  it('takes our photos first, then opens the double check once they are approved', async () => {
    screenWith(onboardingIdentityStep);
    expect(screen.getByRole('heading', { name: c.notice.title })).toBeVisible();
    expect(screen.queryByRole('button', { name: copy.setup.startDoubleCheck })).not.toBeInTheDocument();
    cleanup();
    const onStartIdentity = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated', redirectTo: '/dev/providers/identity' }));
    render(<NextIntlClientProvider locale="en" messages={uiMessages}><HelperOnboardingScreen data={onboardingIdentityCaptureApproved} handlers={{ ...fakeOnboardingHandlers, onStartIdentity }} /></NextIntlClientProvider>);
    expect(screen.getByText(copy.setup.identityDoubleCheck)).toBeVisible();
    const stages = within(screen.getByRole('list', { name: c.stages.label }));
    expect(stages.getAllByRole('listitem')[1]).toHaveAttribute('aria-current', 'step');
    await userEvent.click(screen.getByRole('button', { name: copy.setup.startDoubleCheck }));
    expect(onStartIdentity).toHaveBeenCalledExactlyOnceWith({ consent: false });
    expect(push).toHaveBeenCalledWith('/dev/providers/identity');
  });
});
