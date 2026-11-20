import type { PaymentProvider } from '@/integrations/payments';

/**
 * Cancels at the provider the intents of attempts we replaced or gave up while they waited on the bank (repeats review #5),
 * or of holds we let go: left live, a bank step finished later could still charge the client a second time. Best effort:
 * an intent that went through meanwhile can't be canceled, and its late event refunds it (stripe-webhooks.ts).
 */
export async function cancelIntents(provider: PaymentProvider | null, refs: readonly (string | null)[], what: string): Promise<void> {
  if (!provider) return;
  for (const ref of refs) {
    if (!ref) continue;
    try {
      await provider.cancelAuthorization({ authorizationRef: ref });
    } catch (error) {
      console.error(`[payments] canceling ${what}'s intent ${ref} failed`, error);
    }
  }
}
