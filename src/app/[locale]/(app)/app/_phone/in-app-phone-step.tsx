import type { SignInPageData } from '@/contracts';
import {
  changeEmail,
  changePhone,
  continueWith,
  passkeySignIn,
  passkeySignInOptions,
  requestEmailCode,
  resendEmailCode,
  resendPhoneCode,
  saveProfile,
  sendPhoneCode,
  signOutOfSignUp,
  verifyEmailCode,
  verifyPhoneCode,
} from '@/modules/accounts/sign-in/actions';
import { redeemSignUpInvite } from '@/modules/beta/actions';
import { SignInScreen } from '@/ui/screens/auth/sign-in-screen';

/**
 * Sign-in's own phone steps inside the app (journeys on a phone, J-C2), for a page that waits for a verified phone: the
 * number, then the texted code, with the app's frame around them and nothing about the account. `data.next` is where a
 * verified phone goes on to: /app/verify-phone's `next`, or the page itself when the steps show on it (Post a task,
 * 2026-11-23: no trip through /app/verify-phone), which then opens in place once the code is right.
 */
export function InAppPhoneStep({ data }: { data: SignInPageData }) {
  return (
    <SignInScreen
      inApp
      data={data}
      handlers={{
        onRequestEmailCode: requestEmailCode.bind(null, data.next),
        onContinueWith: continueWith.bind(null, data.next),
        onVerifyEmailCode: verifyEmailCode.bind(null, data.next),
        onResendEmailCode: resendEmailCode.bind(null, data.next),
        onChangeEmail: changeEmail,
        onRedeemInvite: redeemSignUpInvite.bind(null, data.next),
        onSignOut: signOutOfSignUp,
        onSaveProfile: saveProfile.bind(null, data.next),
        onSendPhoneCode: sendPhoneCode.bind(null, data.next),
        onVerifyPhoneCode: verifyPhoneCode.bind(null, data.next),
        onResendPhoneCode: resendPhoneCode.bind(null, data.next),
        onChangePhone: changePhone,
        onPasskeyOptions: passkeySignInOptions,
        onPasskeySignIn: passkeySignIn.bind(null, data.next),
      }}
    />
  );
}

/** The sign-in steps a page can show in place: the phone number and its code. */
export function isPhoneStep(data: SignInPageData): boolean {
  return data.step === 'phone' || data.step === 'phone_code';
}
