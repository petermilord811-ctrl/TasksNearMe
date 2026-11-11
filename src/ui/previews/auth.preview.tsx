import type { ReactNode } from 'react';
import type { ActionResult, PreviewEntry, SignInPageData } from '@/contracts';
import { routes } from '@/contracts';
import { fakeSignInHandlers, publicViewer, signInEmailStep, signInEmailCodeStep, signInProfileStep, signInProfileStepPrefilled, signInPhoneStep, signInPhoneStepOffer, signInPhoneCodeStep, signInResults } from '@/fixtures';
import { PublicShell } from '@/ui/shells/public-shell';
import { SignInScreen, EmailCodeStep, PhoneStep, ProfileStep, EmailStep } from '@/ui/screens/auth';
import { SignInFrame } from '@/ui/screens/auth/sign-in-screen';
import { CountdownPreview } from './auth-countdown';
import copy from '../../../messages/en/ui/signIn.json';

function page(id: string, variant: keyof typeof copy.previews, render: () => ReactNode): PreviewEntry {
  return { id, group: copy.previews.group, title: copy.previews[variant], layout: 'fullscreen', render: () => <PublicShell viewer={publicViewer} currentPath={routes.signIn()}>{render()}</PublicShell> };
}

const screens: [keyof typeof copy.previews, SignInPageData][] = [
  ['email', signInEmailStep], ['email-code', signInEmailCodeStep], ['profile', signInProfileStep], ['profile-prefilled', signInProfileStepPrefilled],
  ['phone-post', signInPhoneStep], ['phone-offer', signInPhoneStepOffer], ['phone-book', { ...signInPhoneStep, phoneReason: 'book' }], ['phone-account', { ...signInPhoneStep, phoneReason: 'account' }], ['phone-code', signInPhoneCodeStep],
];

const errors: [keyof typeof copy.previews, SignInPageData, ActionResult][] = [
  ['code-incorrect', signInEmailCodeStep, signInResults.codeIncorrect], ['code-expired', signInEmailCodeStep, signInResults.codeExpired], ['too-many-tries', signInEmailCodeStep, signInResults.tooManyTries],
  ['phone-not-supported', signInPhoneStep, signInResults.phoneNotSupported], ['phone-in-use', signInPhoneStep, signInResults.phoneInUse], ['profile-incomplete', signInProfileStep, signInResults.profileIncomplete], ['account-not-allowed', signInEmailStep, signInResults.accountNotAllowed],
];

export const authPreviews: PreviewEntry[] = [
  ...screens.map(([variant, data]) => page(`screen-sign-in/${variant}`, variant, () => <SignInScreen data={data} handlers={fakeSignInHandlers} />)),
  ...errors.map(([variant, data, initialResult]) => page(`sign-in-step/${variant}`, variant, () => {
    const Step = data.step === 'email_code' ? EmailCodeStep : data.step === 'phone' ? PhoneStep : data.step === 'profile' ? ProfileStep : EmailStep;
    return <SignInFrame><Step data={data} handlers={fakeSignInHandlers} initialResult={initialResult} /></SignInFrame>;
  })),
  page('sign-in-step/resend-countdown', 'resend-countdown', () => <CountdownPreview />),
];
