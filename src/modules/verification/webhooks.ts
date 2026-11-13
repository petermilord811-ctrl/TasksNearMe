import { identityFailureReason, isAdult, parseStripeIdentityEvent, verifyStripeSignature, type StripeIdentity } from '@/integrations/stripe-identity';
import { parseCheckrEvent, verifyCheckrSignature } from '@/integrations/checkr';
import type { Db } from '@/platform/db/connect';
import { recordBackgroundResult, recordIdentityResult, type IdentityResult } from './tracks';

/**
 * The providers' webhooks (src/app/api/webhooks/stripe, …/checkr): checked signatures, then the same
 * recorders the dev stand-ins use. Unknown events and sessions are acknowledged (200) so the provider
 * stops retrying; a bad signature is refused (400). Repeats change nothing (final results don't move).
 */

export type WebhookOutcome = { status: 200 | 400; body: { ok: boolean; ignored?: boolean } };

export async function handleStripeIdentityWebhook(
  db: Db,
  input: { payload: string; signature: string | null; secret: string; identity: Pick<StripeIdentity, 'verifiedOutputs'> },
  now: Date,
): Promise<WebhookOutcome> {
  if (!verifyStripeSignature({ payload: input.payload, header: input.signature, secret: input.secret, now })) return { status: 400, body: { ok: false } };
  let event: unknown;
  try {
    event = JSON.parse(input.payload);
  } catch {
    return { status: 400, body: { ok: false } };
  }
  const parsed = parseStripeIdentityEvent(event);
  if (!parsed) return { status: 200, body: { ok: true, ignored: true } };
  let result: IdentityResult;
  if (parsed.kind === 'verified') {
    // The verified name and age, read once: compared and checked, never stored.
    const outputs = await input.identity.verifiedOutputs(parsed.sessionId);
    result = outputs.dob && !isAdult(outputs.dob, now)
      ? { status: 'requires_input', reason: 'under_18' }
      : { status: 'verified', ...(outputs.firstName && outputs.lastName ? { verifiedName: { firstName: outputs.firstName, lastName: outputs.lastName } } : {}) };
  } else if (parsed.kind === 'requires_input') {
    result = { status: 'requires_input', reason: identityFailureReason(parsed.errorCode) };
  } else {
    result = { status: parsed.kind };
  }
  const userId = await recordIdentityResult(db, parsed.sessionId, result, now);
  return { status: 200, body: { ok: true, ...(userId ? {} : { ignored: true }) } };
}

export async function handleCheckrWebhook(db: Db, input: { payload: string; signature: string | null; apiKey: string }, now: Date): Promise<WebhookOutcome> {
  if (!verifyCheckrSignature({ payload: input.payload, header: input.signature, apiKey: input.apiKey })) return { status: 400, body: { ok: false } };
  let event: unknown;
  try {
    event = JSON.parse(input.payload);
  } catch {
    return { status: 400, body: { ok: false } };
  }
  const parsed = parseCheckrEvent(event);
  if (!parsed) return { status: 200, body: { ok: true, ignored: true } };
  const userId = await recordBackgroundResult(db, parsed.ref, parsed.status, now);
  return { status: 200, body: { ok: true, ...(userId ? {} : { ignored: true }) } };
}
