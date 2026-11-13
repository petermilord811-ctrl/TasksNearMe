import { describe, expect, it } from 'vitest';
import { authPathAllowed } from './auth-routes';

describe('Better Auth endpoints reachable from the internet', () => {
  it('are only the providers’ redirects back and the error page', () => {
    expect(authPathAllowed('/api/auth/callback/google')).toBe(true);
    expect(authPathAllowed('/api/auth/callback/microsoft')).toBe(true);
    expect(authPathAllowed('/api/auth/error')).toBe(true);
  });

  it('never the endpoints that would skip the app’s own checks', () => {
    for (const path of [
      '/api/auth/email-otp/send-verification-otp',
      '/api/auth/sign-in/email-otp',
      '/api/auth/email-otp/request-email-change',
      '/api/auth/email-otp/change-email',
      '/api/auth/update-user',
      '/api/auth/unlink-account',
      '/api/auth/link-social',
      '/api/auth/sign-in/social',
      '/api/auth/passkey/generate-authenticate-options',
      '/api/auth/get-session',
      '/api/auth/sign-out',
      '/api/auth/callback/google/../../update-user',
      '/api/auth/callback',
      '/api/authx/callback/google',
    ]) {
      expect(authPathAllowed(path), path).toBe(false);
    }
  });
});
