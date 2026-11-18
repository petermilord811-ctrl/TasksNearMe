import { and, asc, eq, isNull } from 'drizzle-orm';
import { localeOrDefault } from '@/contracts';
import type { EmailProvider } from '@/integrations/email';
import { appUrl } from '@/integrations/oauth';
import { getFlags } from '@/modules/markets/queries';
import { categories, markets } from '@/modules/markets/schema';
import { smsAvailable } from '@/integrations/sms';
import { welcomeChecksFor } from '@/modules/rewards/domain';
import { WELCOME_PROGRAM } from '@/modules/rewards/programs';
import type { Db } from '@/platform/db/connect';
import { renderWelcomeEmail, type WelcomeOffer } from './emails/welcome';
import { users } from './schema';

/** The welcome gift card while the program is on in this market: the same rule as the become-a-helper page. */
export async function welcomeOfferFor(db: Db, marketId: string): Promise<WelcomeOffer | undefined> {
  const flags = await getFlags(marketId, db);
  if (flags['reward.welcome'] !== true) return undefined;
  return { amountCents: WELCOME_PROGRAM.amountCents, redeemWithinDays: WELCOME_PROGRAM.redeemWithinDays, checks: welcomeChecksFor(smsAvailable()) };
}

/**
 * The welcome email, once per account, when sign-up finishes (names, age and terms saved), whether the
 * person used an email code, Google or Microsoft. The first caller marks the account (`welcomed_at`) and
 * sends; a later or concurrent call finds it marked and does nothing. A failed send is tried again after
 * `retryDelaysMs`, then logged (sign-up never fails because of it).
 */
export async function sendWelcomeEmail(
  db: Db,
  email: EmailProvider,
  userId: string,
  now: Date,
  options: { retryDelaysMs?: number[] } = {},
): Promise<'sent' | 'already_sent' | 'failed'> {
  const [user] = await db
    .update(users)
    .set({ welcomedAt: now })
    .where(and(eq(users.id, userId), isNull(users.welcomedAt)))
    .returning({ email: users.email, firstName: users.firstName, marketId: users.homeMarketId, locale: users.locale });
  if (!user) return 'already_sent';

  const [[market], categoryRows, offer] = await Promise.all([
    db.select({ name: markets.name, state: markets.state }).from(markets).where(eq(markets.id, user.marketId)).limit(1),
    db.select({ slug: categories.slug, name: categories.name }).from(categories).where(eq(categories.status, 'active')).orderBy(asc(categories.sortOrder)),
    welcomeOfferFor(db, user.marketId),
  ]);
  const content = renderWelcomeEmail({
    firstName: user.firstName,
    email: user.email,
    appUrl: appUrl(),
    market: market ? `${market.name}, ${market.state}` : '',
    ...(offer ? { offer } : {}),
    categories: categoryRows,
    locale: localeOrDefault(user.locale),
  });

  let lastError: unknown;
  for (const delay of [0, ...(options.retryDelaysMs ?? [1_000, 4_000])]) {
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      await email.send({ to: user.email, subject: content.subject, text: content.text, html: content.html, tag: 'welcome' });
      return 'sent';
    } catch (error) {
      lastError = error;
    }
  }
  console.error('[welcome] the welcome email could not be sent', lastError);
  return 'failed';
}
