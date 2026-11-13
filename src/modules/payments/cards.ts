import { and, eq } from 'drizzle-orm';
import { DEV_TEST_CARDS, type PaymentPanelData, type PaymentVerification } from '@/contracts';
import { stripePublishableKey, type ChargeMethod, type PaymentProvider } from '@/integrations/payments';
import { users } from '@/modules/accounts/schema';
import type { Db } from '@/platform/db/connect';
import { paymentCustomers } from './schema';

/**
 * Cards with the payment provider (blueprint 04 §1): how a new one is collected, the person's customer at
 * the provider, what a charge sends, and the bank step a payment may need. Shared by every checkout
 * (bookings, invites, changes, rebooking, tips) and the payments page.
 */

/** How a new card is collected with this provider: Stripe's card form, or the development test cards. */
export function newCardCollection(provider: PaymentProvider | null): PaymentPanelData['newCard'] {
  const publishableKey = provider?.name === 'stripe' ? stripePublishableKey() : null;
  return publishableKey ? { kind: 'stripe', publishableKey } : { kind: 'dev', testCards: DEV_TEST_CARDS };
}

/** The person's customer at the provider (made by `prepareCard` the first time), and who they are. */
export async function customerFor(db: Db, userId: string, provider: string): Promise<{ ref?: string; userId: string; email: string; name: string }> {
  const [[person], [stored]] = await Promise.all([
    db.select({ email: users.email, firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, userId)).limit(1),
    db.select({ ref: paymentCustomers.customerRef }).from(paymentCustomers).where(and(eq(paymentCustomers.userId, userId), eq(paymentCustomers.provider, provider))).limit(1),
  ]);
  return { ...(stored ? { ref: stored.ref } : {}), userId, email: person?.email ?? '', name: [person?.firstName, person?.lastName].filter(Boolean).join(' ') };
}

/** What the provider charges: the card, and the person's customer when the card is attached to one. */
export function chargeMethodOf(method: { providerRef: string; customerRef?: string }): ChargeMethod {
  return { providerRef: method.providerRef, ...(method.customerRef ? { customerRef: method.customerRef } : {}) };
}

/** The bank step for a payment that needs one: Stripe.js's own (with the intent's client secret), or the dev dialog. */
export async function bankStep(provider: PaymentProvider, paymentId: string, intentRef: string): Promise<PaymentVerification> {
  const publishableKey = provider.name === 'stripe' ? stripePublishableKey() : null;
  const clientSecret = publishableKey && provider.clientSecretOf ? await provider.clientSecretOf(intentRef) : null;
  return clientSecret && publishableKey ? { paymentId, kind: 'stripe', clientSecret, publishableKey } : { paymentId, kind: 'dev' };
}
