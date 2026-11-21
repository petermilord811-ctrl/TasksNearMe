import { devHelpersOn } from '@/shared/dev-helpers';

/**
 * Provider faults on purpose, for the development helpers only (when things break, 2026-11-21): in `next dev` and the
 * e2e build, the stand-in email, text and payment providers can fail ('down') or hang until the real provider's
 * timeout and then fail ('slow'), to see what people and staff get when a provider breaks, and that it comes back.
 * Set through /dev/faults (this machine only). In memory, for this server process; every other build ignores it.
 */
export type FaultKind = 'email' | 'sms' | 'payments';
export type FaultMode = 'down' | 'slow';
export const FAULT_KINDS: readonly FaultKind[] = ['email', 'sms', 'payments'];

/** How long the real providers wait before giving up (src/integrations/email/timeout.ts, sms/twilio.ts, payments/stripe.ts). */
const TIMEOUT_MS: Record<FaultKind, number> = { email: 15_000, sms: 15_000, payments: 30_000 };
const KEY = Symbol.for('tnm.providerFaults');

function table(): Map<FaultKind, FaultMode> {
  const holder = globalThis as unknown as Record<symbol, Map<FaultKind, FaultMode> | undefined>;
  return (holder[KEY] ??= new Map());
}

export function setFault(kind: FaultKind, mode: FaultMode | null): void {
  if (mode) table().set(kind, mode);
  else table().delete(kind);
}

export function currentFaults(): Partial<Record<FaultKind, FaultMode>> {
  return Object.fromEntries(table());
}

export class ProviderFaultError extends Error {
  constructor(kind: FaultKind, mode: FaultMode) {
    super(mode === 'slow' ? `The ${kind} provider didn't answer in ${TIMEOUT_MS[kind] / 1000} s (fault switch)` : `The ${kind} provider is unavailable (fault switch)`);
    this.name = 'ProviderFaultError';
  }
}

/** Called by a stand-in provider before it acts: throws, or waits and throws, while a fault is set for it. */
export async function applyFault(kind: FaultKind): Promise<void> {
  if (!devHelpersOn()) return;
  const mode = table().get(kind);
  if (!mode) return;
  if (mode === 'slow') await new Promise((resolve) => setTimeout(resolve, TIMEOUT_MS[kind]));
  throw new ProviderFaultError(kind, mode);
}
