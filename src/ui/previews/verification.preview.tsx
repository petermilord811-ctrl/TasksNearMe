import type { ReactNode } from 'react';
import { routes, type AdminUserPageData, type AdminVerificationsPageData, type AppShellHandlers, type HelperOnboardingPageData, type PosterIdentityPageData, type PreviewEntry, type StaffViewer } from '@/contracts';
import {
  ADMIN_NOW,
  adminUserJordanData,
  adminUserPriyaData,
  adminVerificationsAddressData,
  adminVerificationsBackgroundData,
  adminVerificationsEmptyData,
  adminVerificationsIdentityData,
  adminVerificationsReadOnlyData,
  alexStaff,
  devonVerification,
  fakeAdminUserHandlers,
  fakeHandler,
  fakeOnboardingHandlers,
  fakePosterIdentityHandlers,
  homeAddressSuggestions,
  leeVerification,
  mayaShell,
  morganStaff,
  onboardingAddressInReview,
  onboardingAddressRejected,
  onboardingAddressRequested,
  onboardingAddressStep,
  onboardingAddressUpdate,
  onboardingAddressVerified,
  onboardingBackgroundEngaged,
  onboardingBackgroundInvited,
  onboardingBackgroundPostAdverse,
  onboardingBackgroundPreAdverse,
  onboardingBackgroundRenewal,
  onboardingBackgroundReview,
  onboardingBackgroundSuspended,
  onboardingIdentityNameCheck,
  onboardingIdentityRequested,
  onboardingIdentityStep,
  onboardingIdentityTooMany,
  onboardingIdentityTryLater,
  onboardingIdentityUnder18,
  onboardingPhoneStep,
  onboardingPhoneVerified,
  onboardingProfileStep,
  posterIdentityFailedPayments,
  posterIdentityLargeBooking,
  posterIdentityNameCheck,
  posterIdentityNotNeeded,
  posterIdentityProcessing,
  posterIdentityReports,
  posterIdentityRetry,
  posterIdentityStaffRequest,
  posterIdentityTooMany,
  posterIdentityTryLater,
  posterIdentityVerified,
  posterVerification,
  priyaShell,
  priyaVerification,
} from '@/fixtures';
import { AdminUserContent } from '@/ui/screens/admin/admin-user-screen';
import { AdminVerificationSection } from '@/ui/screens/admin/admin-verification-section';
import { AdminVerificationsScreen } from '@/ui/screens/admin/admin-verifications-screen';
import { AddressStep } from '@/ui/screens/helper/address-step';
import { HelperOnboardingScreen } from '@/ui/screens/helper/helper-onboarding-screen';
import { PhoneStep } from '@/ui/screens/helper/phone-step';
import { AdminShell } from '@/ui/shells/admin-shell';
import { PosterIdentityScreen } from '@/ui/screens/verify';
import { AppShell } from '@/ui/shells/app-shell';
import onboardingCopy from '../../../messages/en/ui/helperOnboarding.json';
import adminCopy from '../../../messages/en/ui/adminVerification.json';
import posterCopy from '../../../messages/en/ui/posterIdentity.json';

/** Verification (added 2026-11-12): the new onboarding states, the staff queues and the person page's section. */

const o = onboardingCopy.screen.previews;
const a = adminCopy.previews;
const c = posterCopy.previews;
const shellHandlers: AppShellHandlers = { onModeChange: fakeHandler({ ok: true, code: 'updated' }), onSignOut: fakeHandler({ ok: true, code: 'updated' }) };
const adminShellHandlers = { onSignOut: fakeHandler({ ok: true, code: 'updated' }) };

function onboarding(variant: string, title: string, data: HelperOnboardingPageData): PreviewEntry {
  return {
    id: `screen-helper-onboarding/${variant}`, title, group: o.group, layout: 'fullscreen',
    render: () => <AppShell viewer={priyaShell} handlers={shellHandlers} currentPath={routes.app.helperOnboarding(data.step)} layout="flow"><HelperOnboardingScreen data={data} handlers={fakeOnboardingHandlers} /></AppShell>,
  };
}

function step(variant: string, title: string, path: string, children: ReactNode): PreviewEntry {
  return {
    id: `screen-helper-onboarding/${variant}`, title, group: o.group, layout: 'fullscreen',
    render: () => <AppShell viewer={priyaShell} handlers={shellHandlers} currentPath={path} layout="flow"><div className="mx-auto max-w-reading space-y-6 pb-24 sm:pb-0">{children}</div></AppShell>,
  };
}

function posterId(variant: string, title: string, data: PosterIdentityPageData): PreviewEntry {
  return {
    id: `screen-verify-identity/${variant}`, title, group: c.group, layout: 'fullscreen',
    render: () => <AppShell viewer={mayaShell} handlers={shellHandlers} currentPath={routes.app.verifyIdentity()} layout="flow"><PosterIdentityScreen data={data} handlers={fakePosterIdentityHandlers} /></AppShell>,
  };
}

function Admin({ path, viewer = morganStaff, children }: { path: string; viewer?: StaffViewer; children: ReactNode }) {
  return <AdminShell viewer={viewer} handlers={adminShellHandlers} currentPath={path}>{children}</AdminShell>;
}

function queue(id: string, title: string, data: AdminVerificationsPageData, viewer: StaffViewer = morganStaff): PreviewEntry {
  return {
    id: `screen-admin-verifications/${id}`, title, group: a.group, layout: 'fullscreen',
    render: () => <Admin path={routes.admin.verifications(data.queue)} viewer={viewer}><AdminVerificationsScreen data={data} now={ADMIN_NOW} /></Admin>,
  };
}

function person(id: string, title: string, data: AdminUserPageData): PreviewEntry {
  return {
    id: `screen-admin-user/${id}`, title, group: a.group, layout: 'fullscreen',
    render: () => <Admin path={routes.admin.user(data.user.id)}><AdminUserContent data={data} handlers={fakeAdminUserHandlers} now={ADMIN_NOW} /></Admin>,
  };
}

export const verificationPreviews: PreviewEntry[] = [
  onboarding('profile-agreement', o.agreement, onboardingProfileStep),
  onboarding('phone', o.phone, onboardingPhoneStep),
  step('phone-code', o.phoneCode, routes.app.helperOnboarding('phone'), <PhoneStep verification={onboardingPhoneStep.verification} handlers={fakeOnboardingHandlers} initialSentTo="(512) 555-0204" />),
  onboarding('phone-verified', o.phoneVerified, onboardingPhoneVerified),
  onboarding('identity-consent', o.identityConsent, onboardingIdentityStep),
  onboarding('identity-name-check', o.identityNameCheck, onboardingIdentityNameCheck),
  onboarding('identity-try-later', o.identityTryLater, onboardingIdentityTryLater),
  onboarding('identity-too-many', o.identityTooMany, onboardingIdentityTooMany),
  onboarding('identity-under-18', o.identityUnder18, onboardingIdentityUnder18),
  onboarding('identity-requested', o.identityRequested, onboardingIdentityRequested),
  onboarding('address', o.address, onboardingAddressStep),
  step('address-search', o.addressSearch, routes.app.helperOnboarding('address'), <AddressStep verification={onboardingAddressStep.verification} handlers={fakeOnboardingHandlers} initialSuggestions={homeAddressSuggestions} />),
  step('address-errors', o.addressErrors, routes.app.helperOnboarding('address'), <AddressStep verification={onboardingAddressStep.verification} handlers={fakeOnboardingHandlers} initialErrors={{ placeId: 'not_supported', documentType: 'required', file: 'invalid', declaration: 'must_accept' }} />),
  onboarding('address-in-review', o.addressInReview, onboardingAddressInReview),
  onboarding('address-rejected', o.addressRejected, onboardingAddressRejected),
  onboarding('address-verified', o.addressVerified, onboardingAddressVerified),
  onboarding('address-update', o.addressUpdate, onboardingAddressUpdate),
  onboarding('address-requested', o.addressRequested, onboardingAddressRequested),
  onboarding('background-invitation-dated', o.backgroundInvited, onboardingBackgroundInvited),
  onboarding('background-review', o.backgroundReview, onboardingBackgroundReview),
  onboarding('background-pre-adverse', o.backgroundPreAdverse, onboardingBackgroundPreAdverse),
  onboarding('background-post-adverse', o.backgroundPostAdverse, onboardingBackgroundPostAdverse),
  onboarding('background-engaged', o.backgroundEngaged, onboardingBackgroundEngaged),
  onboarding('background-renewal', o.backgroundRenewal, onboardingBackgroundRenewal),
  onboarding('background-suspended-checkr', o.backgroundSuspended, onboardingBackgroundSuspended),

  queue('address', a.address, adminVerificationsAddressData),
  queue('identity', a.identity, adminVerificationsIdentityData),
  queue('background', a.background, adminVerificationsBackgroundData),
  queue('empty', a.empty, adminVerificationsEmptyData),
  queue('read-only', a.readOnly, adminVerificationsReadOnlyData, alexStaff),
  person('verification-review', a.section, adminUserPriyaData),
  {
    id: 'screen-admin-user/verification-opened', title: a.sectionRevealed, group: a.group, layout: 'fullscreen',
    render: () => <Admin path={routes.admin.user('usr_priya')}><div className="mx-auto max-w-content p-gutter"><AdminVerificationSection userId="usr_priya" verification={priyaVerification} handlers={fakeAdminUserHandlers} now={ADMIN_NOW} initialRevealed={{ proofId: 'adr_priya', result: { ok: true, address: '1234 Example Lane, Austin, TX 78723', document: { url: '/samples/proof-of-address.svg', kind: 'image' }, expiresAt: '2026-11-20T16:05:00.000Z' } }} /></div></Admin>,
  },
  person('verification-done', a.sectionDone, adminUserJordanData),
  person('verification-name-check', a.sectionNameCheck, { ...adminUserJordanData, verification: devonVerification }),
  person('verification-background', a.sectionBackground, { ...adminUserJordanData, verification: leeVerification }),
  person('verification-poster', a.sectionPoster, { ...adminUserJordanData, verification: posterVerification }),

  posterId('reports', c.reports, posterIdentityReports),
  posterId('large-booking', c.largeBooking, posterIdentityLargeBooking),
  posterId('failed-payments', c.failedPayments, posterIdentityFailedPayments),
  posterId('staff-request', c.staffRequest, posterIdentityStaffRequest),
  posterId('retry', c.retry, posterIdentityRetry),
  posterId('processing', c.processing, posterIdentityProcessing),
  posterId('try-later', c.tryLater, posterIdentityTryLater),
  posterId('too-many', c.tooMany, posterIdentityTooMany),
  posterId('name-check', c.nameCheck, posterIdentityNameCheck),
  posterId('verified', c.verified, posterIdentityVerified),
  posterId('not-needed', c.notNeeded, posterIdentityNotNeeded),
];
