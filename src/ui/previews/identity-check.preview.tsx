import type { ReactNode } from 'react';
import { routes, type AppShellHandlers, type PreviewEntry, type StaffViewer, type VerificationSummary } from '@/contracts';
import {
  ADMIN_NOW,
  adminUserJordanData,
  alexStaff,
  anaDoubleCheckVerification,
  fakeAdminUserHandlers,
  fakeHandler,
  fakeOnboardingHandlers,
  identityCaptureRevealed,
  kaiDuplicateVerification,
  morganStaff,
  onboardingIdentityCapture,
  onboardingIdentityCaptureApproved,
  onboardingIdentityCaptureInReview,
  onboardingIdentityCaptureRejected,
  onboardingIdentityDoubleCheckRejected,
  onboardingIdentityDoubleCheckReview,
  onboardingIdentityDuplicateHold,
  onboardingIdentityExpired,
  onboardingIdentityRenewal,
  onboardingIdentityStep,
  priyaShell,
  rosaReadOnlyVerification,
  rosaVerification,
} from '@/fixtures';
import { AdminUserContent } from '@/ui/screens/admin/admin-user-screen';
import { AdminVerificationSection } from '@/ui/screens/admin/admin-verification-section';
import { HelperOnboardingScreen } from '@/ui/screens/helper/helper-onboarding-screen';
import { IdentityCaptureStep, type IdentityCaptureStepProps } from '@/ui/screens/helper/identity-capture';
import { AdminShell } from '@/ui/shells/admin-shell';
import { AppShell } from '@/ui/shells/app-shell';
import { ClickOnLoad } from './click-on-load';
import copy from '../../../messages/en/ui/verification.json';
import adminCopy from '../../../messages/en/ui/adminVerification.json';

/**
 * The ID check in two stages (completion plan 6.1): our own capture (the Texas notice, the kind of ID, its
 * photos and a live selfie that follows a prompt, then the review), its review states, the provider's
 * double check once approved (and its review when it doesn't confirm our approval, 6.2), the hold for the
 * same ID on another account and the new check before an ID runs out (6.3), and the staff side (the
 * photos to compare, opened with a logged reason, the double check's case, the same ID elsewhere).
 * The camera is a stand-in here: previews never open one.
 */

const p = copy.capture.previews;
const a = adminCopy.previews;
const shellHandlers: AppShellHandlers = { onModeChange: fakeHandler({ ok: true, code: 'updated' }), onSignOut: fakeHandler({ ok: true, code: 'updated' }) };
const adminShellHandlers = { onSignOut: fakeHandler({ ok: true, code: 'updated' }) };
const front = '/samples/id-front.svg';
const back = '/samples/id-back.svg';
const selfie = '/samples/id-selfie.svg';

function onboarding(variant: string, title: string, children: ReactNode): PreviewEntry {
  return {
    id: `screen-helper-onboarding/${variant}`, title, group: p.group, layout: 'fullscreen',
    render: () => <AppShell viewer={priyaShell} handlers={shellHandlers} currentPath={routes.app.helperOnboarding('identity')} layout="flow">{children}</AppShell>,
  };
}

/** One part of the capture, open on its own (the notice already accepted). */
function capture(variant: string, title: string, preview: IdentityCaptureStepProps['preview'], verification: VerificationSummary = onboardingIdentityCapture.verification): PreviewEntry {
  return onboarding(variant, title, <div className="mx-auto max-w-reading space-y-6 pb-24 sm:pb-0"><IdentityCaptureStep verification={verification} handlers={fakeOnboardingHandlers} preview={preview} /></div>);
}

function Admin({ path, viewer = morganStaff, children }: { path: string; viewer?: StaffViewer; children: ReactNode }) {
  return <AdminShell viewer={viewer} handlers={adminShellHandlers} currentPath={path}>{children}</AdminShell>;
}

export const identityCheckPreviews: PreviewEntry[] = [
  onboarding('id-notice-error', p.noticeError, <ClickOnLoad label={copy.capture.notice.continue}><HelperOnboardingScreen data={onboardingIdentityStep} handlers={fakeOnboardingHandlers} /></ClickOnLoad>),
  onboarding('id-type', p.type, <HelperOnboardingScreen data={onboardingIdentityCapture} handlers={fakeOnboardingHandlers} />),
  capture('id-front', p.front, { step: 'front', documentType: 'drivers_license', camera: 'live' }),
  capture('id-front-camera', p.frontCamera, { step: 'front', documentType: 'drivers_license', camera: 'live', cameraOpen: true }),
  capture('id-front-taken', p.frontTaken, { step: 'front', documentType: 'drivers_license', camera: 'live', photos: { front } }),
  capture('id-back', p.back, { step: 'back', documentType: 'state_id', camera: 'live', cameraOpen: true, photos: { front } }),
  capture('id-selfie', p.selfie, { step: 'selfie', documentType: 'drivers_license', camera: 'live', photos: { front, back } }),
  capture('id-selfie-unavailable', p.selfieUnavailable, { step: 'selfie', documentType: 'drivers_license', camera: 'unavailable', photos: { front, back } }),
  capture('id-selfie-denied', p.selfieDenied, { step: 'selfie', documentType: 'drivers_license', camera: 'denied', photos: { front, back } }),
  capture('id-passport', p.passport, { step: 'review', documentType: 'passport', photos: { front, selfie } }),
  capture('id-review', p.review, { step: 'review', documentType: 'drivers_license', photos: { front, back, selfie } }),
  capture('id-review-errors', p.reviewErrors, { step: 'review', documentType: 'drivers_license', photos: { front, back, selfie }, photoErrors: { back: 'invalid' } }),
  capture('id-review-failure', p.reviewFailure, { step: 'review', documentType: 'drivers_license', photos: { front, back, selfie }, failure: 'rate_limited' }),
  onboarding('id-rejected', p.rejected, <HelperOnboardingScreen data={onboardingIdentityCaptureRejected} handlers={fakeOnboardingHandlers} />),
  onboarding('id-in-review', p.inReview, <HelperOnboardingScreen data={onboardingIdentityCaptureInReview} handlers={fakeOnboardingHandlers} />),
  onboarding('id-approved', p.approved, <HelperOnboardingScreen data={onboardingIdentityCaptureApproved} handlers={fakeOnboardingHandlers} />),
  onboarding('id-double-check-review', p.doubleCheckReview, <HelperOnboardingScreen data={onboardingIdentityDoubleCheckReview} handlers={fakeOnboardingHandlers} />),
  onboarding('id-double-check-rejected', p.doubleCheckRejected, <HelperOnboardingScreen data={onboardingIdentityDoubleCheckRejected} handlers={fakeOnboardingHandlers} />),
  onboarding('id-duplicate-hold', p.duplicateHold, <HelperOnboardingScreen data={onboardingIdentityDuplicateHold} handlers={fakeOnboardingHandlers} />),
  onboarding('id-renewal', p.renewal, <HelperOnboardingScreen data={onboardingIdentityRenewal} handlers={fakeOnboardingHandlers} />),
  onboarding('id-expired', p.expired, <HelperOnboardingScreen data={onboardingIdentityExpired} handlers={fakeOnboardingHandlers} />),

  {
    id: 'screen-admin-user/verification-id-photos', title: a.sectionCapture, group: a.group, layout: 'fullscreen',
    render: () => <Admin path={routes.admin.user('usr_rosa')}><AdminUserContent data={{ ...adminUserJordanData, verification: rosaVerification }} handlers={fakeAdminUserHandlers} now={ADMIN_NOW} /></Admin>,
  },
  {
    id: 'screen-admin-user/verification-id-photos-opened', title: a.sectionCaptureOpened, group: a.group, layout: 'fullscreen',
    render: () => <Admin path={routes.admin.user('usr_rosa')}><div className="mx-auto max-w-content p-gutter"><AdminVerificationSection userId="usr_rosa" verification={rosaVerification} handlers={fakeAdminUserHandlers} now={ADMIN_NOW} initialCaptureRevealed={{ captureId: 'idc_rosa', result: identityCaptureRevealed }} /></div></Admin>,
  },
  {
    id: 'screen-admin-user/verification-double-check', title: a.sectionDoubleCheck, group: a.group, layout: 'fullscreen',
    render: () => <Admin path={routes.admin.user('usr_ana')}><div className="mx-auto max-w-content p-gutter"><AdminVerificationSection userId="usr_ana" verification={anaDoubleCheckVerification} handlers={fakeAdminUserHandlers} now={ADMIN_NOW} /></div></Admin>,
  },
  {
    id: 'screen-admin-user/verification-duplicate-id', title: a.sectionDuplicate, group: a.group, layout: 'fullscreen',
    render: () => <Admin path={routes.admin.user('usr_kai')}><div className="mx-auto max-w-content p-gutter"><AdminVerificationSection userId="usr_kai" verification={kaiDuplicateVerification} handlers={fakeAdminUserHandlers} now={ADMIN_NOW} /></div></Admin>,
  },
  {
    id: 'screen-admin-user/verification-id-photos-read-only', title: a.sectionCaptureReadOnly, group: a.group, layout: 'fullscreen',
    render: () => <Admin path={routes.admin.user('usr_rosa')} viewer={alexStaff}><div className="mx-auto max-w-content p-gutter"><AdminVerificationSection userId="usr_rosa" verification={rosaReadOnlyVerification} handlers={fakeAdminUserHandlers} now={ADMIN_NOW} /></div></Admin>,
  },
];
