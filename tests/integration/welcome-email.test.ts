import { and, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createDevOutboxEmailProvider, type EmailProvider } from '@/integrations/email';
import { users } from '@/modules/accounts/schema';
import { sendWelcomeEmail, welcomeOfferFor } from '@/modules/accounts/welcome';
import { createDb } from '@/platform/db/connect';
import { devOutboxMessages } from '@/platform/dev-outbox/schema';
import { throwawayClient } from '../support/people';

/**
 * The welcome email goes out once per account when sign-up finishes, leads with the welcome gift card while the
 * program is on (every helper whose three checks pass, 2026-11-14), and never fails sign-up: a failed send is
 * retried, then given up.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(() => pool.end());

const outbox = createDevOutboxEmailProvider(db);
const welcomes = async (email: string) => db.select().from(devOutboxMessages).where(and(eq(devOutboxMessages.to, email), eq(devOutboxMessages.tag, 'welcome')));

describe('the welcome email', () => {
  it('goes out once, with the welcome gift card and its three checks', async () => {
    const id = await throwawayClient(db, 'usr_welcome_once');
    const email = `${id}@example.test`;
    const offer = await welcomeOfferFor(db, 'mkt_austin');
    expect(offer).toEqual({ amountCents: 5000, redeemWithinDays: 90 });

    expect(await sendWelcomeEmail(db, outbox, id, new Date())).toBe('sent');
    expect(await sendWelcomeEmail(db, outbox, id, new Date())).toBe('already_sent');
    const [sent, ...more] = await welcomes(email);
    expect(more).toHaveLength(0);
    expect(sent?.subject).toBe('Welcome, Ruth! Get verified and get a $50 gift card');
    expect(sent?.html).toContain('Pass a background check');
    expect(sent?.body).toContain('Get verified: http');
    expect((await db.select({ at: users.welcomedAt }).from(users).where(eq(users.id, id)))[0]?.at).toBeInstanceOf(Date);
  });

  it('tries again after a failed send, and gives up quietly after the last try', async () => {
    const flaky = await throwawayClient(db, 'usr_welcome_flaky');
    let failures = 2;
    const sometimes: EmailProvider = {
      name: 'sometimes',
      async send(message) {
        if (failures-- > 0) throw new Error('provider unavailable');
        await outbox.send(message);
      },
    };
    expect(await sendWelcomeEmail(db, sometimes, flaky, new Date(), { retryDelaysMs: [5, 5] })).toBe('sent');
    expect(await welcomes(`${flaky}@example.test`)).toHaveLength(1);

    const broken = await throwawayClient(db, 'usr_welcome_broken');
    const never: EmailProvider = { name: 'never', send: async () => { throw new Error('provider unavailable'); } };
    expect(await sendWelcomeEmail(db, never, broken, new Date(), { retryDelaysMs: [5, 5] })).toBe('failed');
    // Marked anyway: no second batch of attempts later.
    expect(await sendWelcomeEmail(db, outbox, broken, new Date())).toBe('already_sent');
  });
});
