import type { ReactNode } from 'react';
import type { ActionResult, PreviewEntry, SignInPageData } from '@/contracts';
import { routes } from '@/contracts';
import { botCheckResults, fakeSignInHandlers, publicViewer, standInBotCheck, signInEmailStep, signInEmailStepWithProviders, signInSocialErrors, signInEmailCodeStep, signInProfileStep, signInProfileStepPrefilled, signInPhoneStep, signInPhoneStepOffer, signInPhoneCodeStep, signInResults, signInSignUpStep, signInSignUpStepWithProviders } from '@/fixtures';
import { PublicShell } from '@/ui/shells/public-shell';
import { SignInScreen, EmailCodeStep, PhoneStep, ProfileStep, EmailStep } from '@/ui/screens/auth';
import { SignInFrame } from '@/ui/screens/auth/sign-in-screen';
import { BotCheckStatusLine, type BotCheckStatus } from '@/ui/components/forms/bot-check';
import { CountdownPreview } from './auth-countdown';
import copy from '../../../messages/en/ui/signIn.json';

function page(id: string, variant: keyof typeof copy.previews, render: () => ReactNode): PreviewEntry {
  return { id, group: copy.previews.group, title: copy.previews[variant], layout: 'fullscreen', render: () => <PublicShell viewer={publicViewer} currentPath={routes.signIn()}>{render()}</PublicShell> };
}

const BOT_CHECK_STATES: BotCheckStatus[] = ['checking', 'passed', 'interactive', 'retrying', 'slow', 'failed', 'unsupported'];

const screens: [keyof typeof copy.previews, SignInPageData][] = [
  ['email', signInEmailStep], ['email-with-providers', signInEmailStepWithProviders],
  // `/sign-up`'s first step (completion plan 9.6), with the stand-in bot check as outside production.
  ['sign-up', { ...signInSignUpStep, botCheck: standInBotCheck }], ['sign-up-with-providers', { ...signInSignUpStepWithProviders, botCheck: standInBotCheck }],
  ['social-cancelled', signInSocialErrors.cancelled], ['social-unconfirmed', signInSocialErrors.emailUnconfirmed], ['social-use-email-code', signInSocialErrors.useEmailCode],
  ['social-not-allowed', signInSocialErrors.notAllowed], ['social-failed', signInSocialErrors.failed],
  ['email-code', signInEmailCodeStep], ['profile', signInProfileStep], ['profile-prefilled', signInProfileStepPrefilled],
  ['phone-post', signInPhoneStep], ['phone-offer', signInPhoneStepOffer], ['phone-book', { ...signInPhoneStep, phoneReason: 'book' }], ['phone-account', { ...signInPhoneStep, phoneReason: 'account' }], ['phone-code', signInPhoneCodeStep],
];

const errors: [keyof typeof copy.previews, SignInPageData, ActionResult][] = [
  ['code-incorrect', signInEmailCodeStep, signInResults.codeIncorrect], ['code-expired', signInEmailCodeStep, signInResults.codeExpired], ['too-many-tries', signInEmailCodeStep, signInResults.tooManyTries],
  ['phone-not-supported', signInPhoneStep, signInResults.phoneNotSupported], ['phone-in-use', signInPhoneStep, signInResults.phoneInUse], ['profile-incomplete', signInProfileStep, signInResults.profileIncomplete], ['account-not-allowed', signInEmailStep, signInResults.accountNotAllowed],
  ['bot-check-refused', { ...signInEmailStep, botCheck: standInBotCheck }, botCheckResults.refused], ['bot-check-expired', { ...signInProfileStep, botCheck: standInBotCheck }, botCheckResults.expired],
];

export const authPreviews: PreviewEntry[] = [
  ...screens.map(([variant, data]) => page(`screen-sign-in/${variant}`, variant, () => <SignInScreen data={data} handlers={fakeSignInHandlers} />)),
  ...errors.map(([variant, data, initialResult]) => page(`sign-in-step/${variant}`, variant, () => {
    const Step = data.step === 'email_code' ? EmailCodeStep : data.step === 'phone' ? PhoneStep : data.step === 'profile' ? ProfileStep : EmailStep;
    return <SignInFrame><Step data={data} handlers={fakeSignInHandlers} initialResult={initialResult} /></SignInFrame>;
  })),
  page('sign-in-step/resend-countdown', 'resend-countdown', () => <CountdownPreview />),
  // Every state of the security check's line (Turnstile can't run in previews): a submit waiting on it, then each status.
  page('sign-in-step/bot-check-states', 'bot-check-states', () => <SignInFrame><div className="space-y-3">
    <BotCheckStatusLine status="checking" waiting onRetry={() => {}} />
    {BOT_CHECK_STATES.map((status) => <BotCheckStatusLine key={status} status={status} onRetry={() => {}} />)}
  </div></SignInFrame>),
];
