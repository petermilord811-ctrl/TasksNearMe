import type { StaffVerifyHandlers, StaffVerifyPageData } from '@/contracts';

/** The staff two-step check (`/admin/verify`) for Riley: each step it can show. */

const base = { displayName: 'Riley N.', devCodeAllowed: false };

/** An authenticator in use: its code. */
export const staffVerifyCodeData: StaffVerifyPageData = { step: 'code', ...base, canEnroll: false };
/** Development, no authenticator yet: the development code, with setting one up beside it. */
export const staffVerifyDevData: StaffVerifyPageData = { step: 'code', ...base, devCodeAllowed: true, canEnroll: true };
/** Production, no authenticator yet: the setup code from an admin first. */
export const staffVerifySetupCodeData: StaffVerifyPageData = { step: 'setup_code', ...base };
/** The key to add to the app (a well-known sample key, not a real one). */
export const staffVerifyEnrollData: StaffVerifyPageData = {
  step: 'enroll',
  ...base,
  secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
  otpauthUri: 'otpauth://totp/TasksNearMe%20Staff:riley%40example.test?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=TasksNearMe%20Staff&algorithm=SHA1&digits=6&period=30',
};

const wait = <T,>(value: T, ms = 400) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

export const fakeStaffVerifyHandlers: StaffVerifyHandlers = {
  onVerifyCode: () => wait({ ok: false as const, code: 'validation_failed' as const, fieldErrors: { code: ['incorrect' as const] } }),
  onRedeemSetupCode: () => wait({ ok: true as const, code: 'updated' as const }),
  onConfirmEnrollment: () => wait({ ok: false as const, code: 'validation_failed' as const, fieldErrors: { code: ['incorrect' as const] } }),
};
