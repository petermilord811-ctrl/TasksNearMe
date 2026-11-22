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
  it('goes out once, written for the side the person chose: posting a task, with no gift card for a poster', async () => {
    const id = await throwawayClient(db, 'usr_welcome_once');
    const email = `${id}@example.test`;
    const offer = await welcomeOfferFor(db, 'mkt_austin');
    expect(offer).toEqual({ amountCents: 5000, redeemWithinDays: 90, checks: ['phone', 'identity', 'background'] });

    expect(await sendWelcomeEmail(db, outbox, id, new Date())).toBe('sent');
    expect(await sendWelcomeEmail(db, outbox, id, new Date())).toBe('already_sent');
    const [sent, ...more] = await welcomes(email);
    expect(more).toHaveLength(0);
    // No money or offer in the subject (the owner's report, 2026-11-22: the old one landed in Gmail's Promotions tab).
    expect(sent?.subject).toBe('Welcome to TasksNearMe, Ruth');
    expect(sent?.html).toContain('>Post a task</a>');
    expect(sent?.html).not.toContain('gift card');
    expect(sent?.body).toContain('Post a task: http');
    expect((await db.select({ at: users.welcomedAt }).from(users).where(eq(users.id, id)))[0]?.at).toBeInstanceOf(Date);
  });

  it('gives a helper helper setup as its one button, and the welcome gift card as one sentence', async () => {
    const id = await throwawayClient(db, 'usr_welcome_helper');
    await db.update(users).set({ mode: 'helper' }).where(eq(users.id, id));
    expect(await sendWelcomeEmail(db, outbox, id, new Date())).toBe('sent');
    const [sent] = await welcomes(`${id}@example.test`);
    expect(sent?.subject).toBe('Welcome to TasksNearMe, Ruth');
    expect(sent?.html).toContain('>Set up your helper profile</a>');
    expect(sent?.html).toContain('a $50 gift card as a thank-you');
    expect(sent?.body).toContain('Set up your helper profile: http');
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
