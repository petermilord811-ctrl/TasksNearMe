import type { ActionHandler } from './actions';

/**
 * The staff two-step check (`/admin/verify`; blueprint 08: staff sessions require TOTP). Staff with an
 * authenticator enter its code. Someone new to staff first enters the setup code an admin gave them, then
 * adds the key to their app and confirms with its first code. Outside production the development code
 * also works (`devCodeAllowed`).
 */
export type StaffVerifyPageData =
  /** `canEnroll`: no authenticator yet (development only offers the code step then, with set-up beside it). */
  | { step: 'code'; displayName: string; devCodeAllowed: boolean; canEnroll: boolean }
  | { step: 'setup_code'; displayName: string; devCodeAllowed: boolean }
  | {
      step: 'enroll';
      displayName: string;
      devCodeAllowed: boolean;
      /** The key to type into the app (base32), shown only to this staff member until confirmed. */
      secret: string;
      /** The same key as a link phones open in their authenticator app. */
      otpauthUri: string;
    };

/**
 * `onVerifyCode`: ok `updated` with `redirectTo` (the admin home). `onRedeemSetupCode`: ok `updated` (the
 * page then shows the key). `onConfirmEnrollment`: ok `updated` with `redirectTo`. Errors: `validation_failed`
 * (`fieldErrors.code` or `.setupCode`: `invalid`, `incorrect`), `rate_limited` (5 tries in 10 minutes),
 * `not_allowed`.
 */
export interface StaffVerifyHandlers {
  onVerifyCode: ActionHandler<{ code: string }>;
  onRedeemSetupCode: ActionHandler<{ setupCode: string }>;
  onConfirmEnrollment: ActionHandler<{ code: string }>;
}
