import type { ReactNode } from 'react';
import { routes, type AppShellHandlers, type HelperOnboardingPageData, type PreviewEntry, type VerificationSummary } from '@/contracts';
import {
  addressProgressReading,
  addressProgressReview,
  addressProgressTooOld,
  addressProgressVerified,
  fakeHandler,
  fakeOnboardingHandlers,
  homeAddressSuggestions,
  idProgressDoubleCheck,
  idProgressExpired,
  idProgressReading,
  idProgressReview,
  idProgressVerified,
  onboardingAddressInReview,
  onboardingAddressStep,
  onboardingAddressVerified,
  onboardingDone,
  onboardingDoneHelping,
  onboardingIdentityCapture,
  onboardingIdentityCaptureApproved,
  onboardingIdentityCaptureInReview,
  onboardingIdentityCaptureRejected,
  onboardingIdentityStep,
  onboardingIdentityTryLater,
  onboardingIdentityUnder18,
  onboardingPhoneStep,
  priyaShell,
  sampleProofFile,
} from '@/fixtures';
import { AddressFlow, type AddressFlowProps } from '@/ui/screens/verify/address-flow';
import { IdFlow, type IdFlowProps } from '@/ui/screens/verify/id-flow';
import { PhoneFlow } from '@/ui/screens/verify/phone-flow';
import { VerificationHub } from '@/ui/screens/verify/verification-hub';
import { AppShell } from '@/ui/shells/app-shell';
import { ClickOnLoad } from './click-on-load';
import copy from '../../../messages/en/ui/verifyFlow.json';

/**
 * Verifications and the Persona-style flows (2026-11-27): the list of checks in any order, and every screen of the ID,
 * home address and phone flows, from the intro to the outcome, plus the states a flow opens on when a check is under way.
 * Cameras are stand-ins: previews never open one.
 */

const group = 'Verifications and ID flows';
const shellHandlers: AppShellHandlers = { onModeChange: fakeHandler({ ok: true, code: 'updated' }), onSignOut: fakeHandler({ ok: true, code: 'updated' }) };
const front = '/samples/id-front.svg';
const back = '/samples/id-back.svg';
const selfie = '/samples/id-selfie.svg';
const hubHandlers = { onStartPayout: fakeOnboardingHandlers.onStartPayout, onStartBackgroundCheck: fakeOnboardingHandlers.onStartBackgroundCheck };

function page(id: string, title: string, path: string, children: ReactNode): PreviewEntry {
  return { id, title, group, layout: 'fullscreen', render: () => <AppShell viewer={priyaShell} handlers={shellHandlers} currentPath={path} layout="flow">{children}</AppShell> };
}

const hub = (variant: string, title: string, data: HelperOnboardingPageData, click?: string) =>
  page(`verify-hub/${variant}`, title, routes.app.helperVerification(), click ? <ClickOnLoad label={click}><VerificationHub data={data} handlers={hubHandlers} /></ClickOnLoad> : <VerificationHub data={data} handlers={hubHandlers} />);

const id = (variant: string, title: string, verification: VerificationSummary, preview?: IdFlowProps['preview'], click?: string) => {
  const flow = <div className="py-2 sm:py-6"><IdFlow variant="page" verification={verification} handlers={fakeOnboardingHandlers} {...(preview ? { preview } : {})} /></div>;
  return page(`verify-id/${variant}`, title, routes.app.helperOnboarding('identity'), click ? <ClickOnLoad label={click}>{flow}</ClickOnLoad> : flow);
};

const address = (variant: string, title: string, verification: VerificationSummary, preview?: AddressFlowProps['preview']) =>
  page(`verify-address/${variant}`, title, routes.app.helperOnboarding('address'), <div className="py-2 sm:py-6"><AddressFlow variant="page" verification={verification} handlers={fakeOnboardingHandlers} {...(preview ? { preview } : {})} /></div>);

const captureReady = onboardingIdentityCapture.verification;
const license = { documentType: 'drivers_license' as const, camera: 'live' as const };

export const verifyFlowPreviews: PreviewEntry[] = [
  // Verifications: any check, in any order.
  hub('new', 'Verifications: a new helper', { ...onboardingIdentityStep, step: 'done' }),
  hub('in-progress', 'Verifications: some done, the ID with our team', onboardingDoneHelping),
  hub('all-done', 'Verifications: all done', onboardingDone),
  hub('background-dialog', 'Verifications: the background check summary', onboardingDoneHelping, copy.hub.actions.start),

  // The ID flow, screen by screen.
  id('intro-consent', 'ID: intro with consent', onboardingIdentityStep.verification),
  id('intro-consent-error', 'ID: consent not given', onboardingIdentityStep.verification, undefined, copy.id.intro.start),
  id('intro', 'ID: intro', captureReady),
  id('intro-rejected', 'ID: intro after photos were turned down', onboardingIdentityCaptureRejected.verification),
  id('type', 'ID: choose the ID', captureReady, { screen: 'type' }),
  id('front-camera', 'ID: front, camera', captureReady, { ...license, screen: 'front' }),
  id('front-choose', 'ID: front, camera or upload', captureReady, { documentType: 'drivers_license', camera: 'unavailable', screen: 'front' }),
  id('front-check', 'ID: check the front', captureReady, { ...license, screen: 'front-check', photos: { front } }),
  id('back-camera', 'ID: back, camera', captureReady, { ...license, screen: 'back', photos: { front } }),
  id('back-check', 'ID: check the back', captureReady, { ...license, screen: 'back-check', photos: { front, back } }),
  id('passport', 'ID: passport photo page', captureReady, { documentType: 'passport', camera: 'live', screen: 'front' }),
  id('selfie-intro', 'ID: selfie intro', captureReady, { ...license, screen: 'selfie-intro', photos: { front, back } }),
  id('selfie-camera', 'ID: selfie camera', captureReady, { ...license, screen: 'selfie', photos: { front, back } }),
  id('selfie-check', 'ID: check the selfie', captureReady, { ...license, screen: 'selfie-check', photos: { front, back, selfie } }),
  id('send-failed', 'ID: sending failed', captureReady, { ...license, screen: 'selfie-check', photos: { front, back, selfie }, failure: 'rate_limited' }),
  id('verifying', 'ID: verifying', captureReady, { ...license, screen: 'verifying', progress: idProgressReading }),
  id('verifying-answers', 'ID: verifying, answers landing', captureReady, { ...license, screen: 'verifying', progress: idProgressVerified }),
  id('result-verified', 'ID: verified', captureReady, { ...license, screen: 'result', progress: idProgressVerified }),
  id('result-double-check', 'ID: approved, double check next', captureReady, { ...license, screen: 'result', progress: idProgressDoubleCheck }),
  id('result-review', 'ID: our team will look', captureReady, { ...license, screen: 'result', progress: idProgressReview }),
  id('result-rejected', 'ID: turned down (expired)', captureReady, { ...license, screen: 'result', progress: idProgressExpired }),
  id('result-slow', 'ID: still checking', captureReady, { ...license, screen: 'result', progress: idProgressReading }),
  id('status-in-review', 'ID: opened while our team looks', onboardingIdentityCaptureInReview.verification, { progress: idProgressReview }),
  id('status-approved', 'ID: opened with the double check next', { ...onboardingIdentityCaptureApproved.verification, identity: { ...onboardingIdentityCaptureApproved.verification.identity, capture: { ...onboardingIdentityCaptureApproved.verification.identity.capture!, doubleCheck: true } } }),
  id('status-try-later', 'ID: too many tries today', onboardingIdentityTryLater.verification),
  id('status-under-18', 'ID: under 18', onboardingIdentityUnder18.verification),
  id('status-verified', 'ID: opened when verified', onboardingDone.verification),

  // The home address flow.
  address('intro', 'Address: intro', onboardingAddressStep.verification),
  address('address', 'Address: search', onboardingAddressStep.verification, { screen: 'address', suggestions: homeAddressSuggestions }),
  address('kind', 'Address: the kind of document', onboardingAddressStep.verification, { screen: 'kind', address: homeAddressSuggestions[0] }),
  address('upload', 'Address: upload', onboardingAddressStep.verification, { screen: 'upload', address: homeAddressSuggestions[0], documentType: 'utility_bill' }),
  address('upload-file', 'Address: a file chosen', onboardingAddressStep.verification, { screen: 'upload', address: homeAddressSuggestions[0], documentType: 'utility_bill', file: sampleProofFile }),
  address('verifying', 'Address: checking', onboardingAddressStep.verification, { screen: 'verifying', progress: addressProgressReading }),
  address('result-verified', 'Address: verified', onboardingAddressStep.verification, { screen: 'result', progress: addressProgressVerified }),
  address('result-review', 'Address: our team will look', onboardingAddressStep.verification, { screen: 'result', progress: addressProgressReview }),
  address('result-rejected', 'Address: too old', onboardingAddressStep.verification, { screen: 'result', progress: addressProgressTooOld }),
  address('status-in-review', 'Address: opened while our team looks', onboardingAddressInReview.verification, { progress: addressProgressReview }),
  address('status-verified', 'Address: opened when verified', onboardingAddressVerified.verification),

  // The phone flow.
  page('verify-phone/number', 'Phone: the number', routes.app.helperOnboarding('phone'), <div className="py-2 sm:py-6"><PhoneFlow variant="page" verification={{ ...onboardingPhoneStep.verification, phone: { verified: false } }} handlers={fakeOnboardingHandlers} /></div>),
  page('verify-phone/code', 'Phone: the code', routes.app.helperOnboarding('phone'), <div className="py-2 sm:py-6"><PhoneFlow variant="page" verification={{ ...onboardingPhoneStep.verification, phone: { verified: false } }} handlers={fakeOnboardingHandlers} initialSentTo="(352) 555-0144" /></div>),
  page('verify-phone/verified', 'Phone: verified', routes.app.helperOnboarding('phone'), <div className="py-2 sm:py-6"><PhoneFlow variant="page" verification={onboardingDone.verification} handlers={fakeOnboardingHandlers} /></div>),
];
