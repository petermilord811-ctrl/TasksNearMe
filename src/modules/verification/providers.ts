import { newId } from '@/platform/db/ids';

/**
 * The hosted verification providers (blueprint 06 §1): Stripe Identity for the ID check, Stripe Connect
 * for payouts, Checkr for background checks. Until their keys exist, development uses stand-ins: pages
 * under /dev/providers that simulate each provider's flow and webhook. Production has none, so those
 * steps can't start there yet (docs/integration-points.md).
 */
export interface VerificationProviders {
  identity: {
    /** Stored on each row (`dev`, `stripe_identity`). */
    readonly provider: string;
    /** Starts a hosted session (document and live selfie) and returns where to send the person. */
    start(userId: string): Promise<{ sessionId: string; url: string }>;
    /** Asks the provider to delete the session's images and personal data (Texas biometric limits, blueprint 06 §3). */
    redact(sessionId: string): Promise<void>;
  };
  payout: {
    readonly provider: string;
    start(userId: string): Promise<{ accountId: string; url: string }>;
  };
  background: {
    readonly provider: string;
    /** Creates the candidate and invitation (the person gives SSN, birth date and consent on the provider's page). */
    start(userId: string): Promise<{ ref: string; url: string }>;
    /** Sends the pre-adverse action notice (with a copy of the report and the summary of rights). */
    preAdverseAction(ref: string): Promise<void>;
    /** Sends the final adverse action notice, after the dispute window. */
    postAdverseAction(ref: string): Promise<void>;
  };
}

/** The app's providers: the stand-ins outside production, none in production until the adapters exist. */
export function verificationProvidersFor(env: { NODE_ENV?: string }): VerificationProviders | null {
  return env.NODE_ENV === 'production' ? null : createDevVerificationProviders();
}

/** Development stand-ins: pages under /dev/providers simulate the provider and its webhook. */
export function createDevVerificationProviders(): VerificationProviders {
  return {
    identity: {
      provider: 'dev',
      async start() {
        const sessionId = newId('vs_dev');
        return { sessionId, url: `/dev/providers/identity?session=${sessionId}` };
      },
      async redact() {},
    },
    payout: {
      provider: 'dev',
      async start(userId) {
        const accountId = `acct_dev_${userId.slice(4)}`;
        return { accountId, url: '/dev/providers/payout' };
      },
    },
    background: {
      provider: 'dev',
      async start() {
        const ref = newId('chk_dev');
        return { ref, url: `/dev/providers/background?check=${ref}` };
      },
      async preAdverseAction() {},
      async postAdverseAction() {},
    },
  };
}
