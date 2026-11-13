import { checkrFromEnv } from '@/integrations/checkr';
import { stripeIdentityFromEnv } from '@/integrations/stripe-identity';
import { newId } from '@/platform/db/ids';

/**
 * The hosted verification providers (blueprint 06 §1): Stripe Identity for the ID check, Stripe Connect
 * for payouts, Checkr for background checks. Stripe Identity (`STRIPE_SECRET_KEY`) and Checkr
 * (`CHECKR_API_KEY`, `CHECKR_PACKAGE`) are built (src/integrations) and replace their stand-ins as soon as
 * their keys are set; without keys, development uses pages under /dev/providers that simulate each
 * provider's flow and webhook. Production needs all three, so until the Connect adapter exists those
 * steps can't start there (docs/integration-points.md).
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
    start(person: { userId: string; email: string; firstName: string; lastName: string }): Promise<{ ref: string; url: string }>;
    /** Sends the pre-adverse action notice (with a copy of the report and the summary of rights); returns its id when the provider has one. */
    preAdverseAction(ref: string): Promise<string | void>;
    /** Sends the final adverse action notice, after the dispute window (Checkr does it on its own schedule). */
    postAdverseAction(ref: string): Promise<void>;
    /** Staff decided for the person after the pre-adverse notice: the final notice must not go. */
    cancelAdverseAction?(adverseActionId: string): Promise<void>;
  };
}

/**
 * The app's providers. Outside production: a built adapter wherever its keys are set (test keys), the
 * stand-in otherwise. In production: none until every adapter exists (payouts need Stripe Connect).
 */
export function verificationProvidersFor(env: Record<string, string | undefined>): VerificationProviders | null {
  const identity = stripeIdentityFromEnv(env);
  const background = checkrFromEnv(env);
  if (env.NODE_ENV === 'production') return null;
  const dev = createDevVerificationProviders();
  return { identity: identity ?? dev.identity, payout: dev.payout, background: background ?? dev.background };
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
