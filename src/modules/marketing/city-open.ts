import { and, asc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
import { createTranslator } from 'next-intl';
import { DEFAULT_LOCALE, localeOrDefault, routes, WAITLIST_INTERESTS, type AppLocale, type WaitlistInterest } from '@/contracts';
import { messagesFor, perLocale } from '@/i18n/catalog';
import type { EmailProvider } from '@/integrations/email';
import { users } from '@/modules/accounts/schema';
import type { RenderedEmail } from '@/modules/accounts/emails/welcome';
import { BETA_FLAGS } from '@/modules/beta/rules';
import { featureFlags, markets } from '@/modules/markets/schema';
import { RETRY_MINUTES } from '@/modules/notifications/delivery-domain';
import { emailSuppressions } from '@/modules/notifications/schema';
import type { Db } from '@/platform/db/connect';
import { emailButton, emailFooter, emailFooterLink, emailFooterLinks, emailLayout, emailOpening, emailParagraph, emailParagraphHtml, emailSection, emailTextLink, esc } from '@/platform/email/layout';
import { localizedPath } from '@/shared/locale';
import { waitlistEntries } from './schema';
import { waitlistOneClickUrl, waitlistUnsubscribePageUrl } from './waitlist-unsubscribe';

/**
 * Telling the waitlist its city opened (completion plan 8.3; decisions.md, 2026-11-17). When a market goes live (open
 * to everyone, blueprint 10 §7), every waitlist entry whose ZIP it covers and that was never told is queued for it, in
 * the status change's own transaction (`queueCityOpenEmails`). Pre-launch tells nobody on the waitlist (clients can post
 * then, but the city isn't announced yet), and waiting helpers hear through `city_open`. The job runner sends the queued emails in batches
 * (`sendCityOpenEmails`), one email per entry, ever, in the language they joined in, with copy for what they asked
 * for (help, helping, or both) and an unsubscribe link with the one-click headers.
 *
 * At send time an entry is skipped when the address bounced or complained (email_suppressions, as for notifications),
 * when they unsubscribed, or when an account with the address already lives in that market (it hears through the
 * app). Emails wait while the market isn't live (paused again) or while sign-up there is invite-only (`beta.sign_up`):
 * "we're open" must be true when it arrives. A failed send is tried again 5, 30 and 120 minutes later, then stays failed.
 */

/** Entries emailed per run of the job runner (every minute): about 6,000 an hour. */
export const CITY_OPEN_BATCH = 100;
/**
 * How long one run may spend sending. The job runner's lock is held meanwhile, and every other job (notifications,
 * charges, payouts) waits on it: with a provider answering slowly (each send may take its 15 s timeout, sweep MN7),
 * 100 sends could hold it for 25 minutes. The rest wait for the next run (launch rehearsal J-L3, as deliveries do).
 */
export const CITY_OPEN_BUDGET_MS = 30_000;
/** A send that never finished (the process stopped mid-send) is tried again after this. */
const LEASE_MS = 10 * 60_000;
const DUE_STATUSES = ['queued', 'sending'];

/**
 * Queues the market's untold entries for its "we're open" email. Run inside the transaction that makes the market
 * live; entries told (or queued) for another market before keep that one. Returns how many it queued.
 */
export async function queueCityOpenEmails(tx: Pick<Db, 'update'>, market: { id: string; zipPrefixes: readonly string[] }, now: Date): Promise<number> {
  const prefixes = market.zipPrefixes.filter((prefix) => /^\d{3}$/.test(prefix));
  if (prefixes.length === 0) return 0;
  const queued = await tx
    .update(waitlistEntries)
    .set({ toldMarketId: market.id, tellStatus: 'queued', tellReason: null, tellAfter: now, updatedAt: now })
    .where(and(isNull(waitlistEntries.toldMarketId), isNull(waitlistEntries.unsubscribedAt), inArray(sql`left(${waitlistEntries.zip}, 3)`, prefixes)))
    .returning({ id: waitlistEntries.id });
  return queued.length;
}

const tFor = perLocale((locale) => createTranslator({ locale, messages: messagesFor(locale), namespace: 'server.emails' }));

export interface CityOpenEmailInput {
  /** The market's name ("Gainesville") and slug (its city page). */
  city: string;
  marketSlug: string;
  /** The ZIP and address they joined with. */
  zip: string;
  email: string;
  interest: WaitlistInterest;
  appUrl: string;
  /** The entry's unsubscribe page, and what mail apps post to for one-click unsubscribe. */
  unsubscribeUrl: string;
  oneClickUrl: string;
  locale?: AppLocale;
}

export type CityOpenEmail = RenderedEmail & { headers: Record<string, string> };

const isInterest = (value: string): value is WaitlistInterest => (WAITLIST_INTERESTS as readonly string[]).includes(value);

export function renderCityOpenEmail(input: CityOpenEmailInput): CityOpenEmail {
  const locale = input.locale ?? DEFAULT_LOCALE;
  const t = tFor(locale);
  const interest = isInterest(input.interest) ? input.interest : 'need_help';
  const { city, zip } = input;
  // Links open in the language they joined in.
  const url = (path: string) => `${input.appUrl}${localizedPath(path, locale)}`;
  const primary = { href: url(interest === 'give_help' ? routes.becomeAHelper() : routes.app.newTask()), label: t('cityOpen.cta', { interest }) };
  const secondary = { href: url(interest === 'both' ? routes.becomeAHelper() : routes.market(input.marketSlug)), label: t('cityOpen.secondary', { interest, city }) };
  const heading = t('cityOpen.heading', { city });
  const preheader = t('cityOpen.preheader', { interest });
  const intro = t('cityOpen.intro', { zip });
  const body = t('cityOpen.body', { interest });
  const why = t('cityOpen.why', { email: input.email, zip });

  // A one-off to a list they joined: one button, one quieter link, and the unsubscribe link with its one-click headers.
  const html = emailSection(
    emailOpening(heading)
      + emailParagraph(intro, { tone: 'ink', size: 17, top: 12, weight: 600 })
      + emailParagraph(body, { top: 12 })
      + emailButton({ href: primary.href, label: primary.label, top: 26 })
      + emailParagraphHtml(emailTextLink(secondary.href, secondary.label), { size: 15, top: 18, weight: 600 }),
    { top: 40, bottom: 36 },
  );
  const footer = emailFooter([esc(why), emailFooterLinks([emailFooterLink(input.unsubscribeUrl, t('cityOpen.unsubscribe')), emailFooterLink(url(routes.help()), t('footer.help'))])]);

  const text = [
    heading,
    `${intro} ${body}`,
    `${primary.label}: ${primary.href}`,
    `${secondary.label}: ${secondary.href}`,
    `${why} ${t('cityOpen.unsubscribe')}: ${input.unsubscribeUrl}`,
  ].join('\n\n');

  return {
    subject: t('cityOpen.subject', { city }),
    preheader,
    html: emailLayout({ title: heading, preheader, appUrl: input.appUrl, body: html, footer, lang: locale }),
    text,
    headers: { 'List-Unsubscribe': `<${input.oneClickUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
}

export interface CityOpenMailer {
  email: EmailProvider;
  appUrl: string;
}

export type CityOpenSkipReason = 'email_suppressed' | 'unsubscribed' | 'has_account';

/** Why an entry isn't emailed after all, or null to send. Pure, for the job and its tests. */
export function cityOpenSkipReason(entry: { unsubscribedAt: Date | null }, facts: { suppressed: boolean; accountInMarket: boolean }): CityOpenSkipReason | null {
  if (entry.unsubscribedAt) return 'unsubscribed';
  if (facts.suppressed) return 'email_suppressed';
  if (facts.accountInMarket) return 'has_account';
  return null;
}

/** Sign-up in the market needs an invite (the private beta's `beta.sign_up`; the market's own flag wins over the global one). */
async function signUpInviteOnly(db: Db, marketId: string): Promise<boolean> {
  const rows = await db
    .select({ marketId: featureFlags.marketId, enabled: featureFlags.enabled })
    .from(featureFlags)
    .where(and(eq(featureFlags.key, BETA_FLAGS.signUp), inArray(featureFlags.marketId, ['global', marketId])));
  return (rows.find((row) => row.marketId === marketId) ?? rows.find((row) => row.marketId === 'global'))?.enabled === true;
}

/** Live markets with entries due whose sign-up isn't invite-only: the only ones whose emails go out now. */
async function marketsToTell(db: Db, now: Date) {
  const due = and(inArray(waitlistEntries.tellStatus, DUE_STATUSES), lte(waitlistEntries.tellAfter, now));
  const candidates = await db
    .selectDistinct({ id: markets.id, name: markets.name, slug: markets.slug })
    .from(waitlistEntries)
    .innerJoin(markets, eq(markets.id, waitlistEntries.toldMarketId))
    .where(and(due, eq(markets.status, 'live')));
  const open: typeof candidates = [];
  for (const market of candidates) if (!(await signUpInviteOnly(db, market.id))) open.push(market);
  return open;
}

/**
 * The job (src/modules/jobs/runner.ts): sends up to `limit` due emails, oldest first, for up to `budgetMs`. Each entry is claimed by moving
 * it to `sending` (only if nobody moved it meanwhile), so two runs never send the same email; the provider also gets
 * an idempotency key per entry.
 */
export async function sendCityOpenEmails(db: Db, mailer: CityOpenMailer, now: Date, limit = CITY_OPEN_BATCH, budgetMs = CITY_OPEN_BUDGET_MS): Promise<{ sent: number; skipped: number; failed: number }> {
  const counts = { sent: 0, skipped: 0, failed: 0 };
  const open = await marketsToTell(db, now);
  if (open.length === 0) return counts;
  const marketOf = new Map(open.map((market) => [market.id, market]));
  const rows = await db
    .select()
    .from(waitlistEntries)
    .where(and(inArray(waitlistEntries.tellStatus, DUE_STATUSES), lte(waitlistEntries.tellAfter, now), inArray(waitlistEntries.toldMarketId, [...marketOf.keys()])))
    .orderBy(asc(waitlistEntries.tellAfter), asc(waitlistEntries.createdAt))
    .limit(limit);
  if (rows.length === 0) return counts;

  const addresses = [...new Set(rows.map((row) => row.email.trim().toLowerCase()))];
  const [suppressedRows, accounts] = await Promise.all([
    db.select({ email: emailSuppressions.email }).from(emailSuppressions).where(inArray(emailSuppressions.email, addresses)),
    db
      .select({ email: sql<string>`lower(${users.email})`, marketId: users.homeMarketId })
      .from(users)
      .where(and(inArray(sql`lower(${users.email})`, addresses), eq(users.status, 'active'))),
  ]);
  const suppressed = new Set(suppressedRows.map((row) => row.email));
  const inMarket = new Set(accounts.map((row) => `${row.email}|${row.marketId}`));

  const started = performance.now();
  let handled = 0;
  for (const row of rows) {
    // Between entries, after at least one so every run moves on: the rest stay queued for the next run.
    if (handled > 0 && performance.now() - started > budgetMs) break;
    const market = marketOf.get(row.toldMarketId ?? '');
    if (!market) continue;
    const [claimed] = await db
      .update(waitlistEntries)
      .set({ tellStatus: 'sending', tellAfter: new Date(now.getTime() + LEASE_MS), tellAttempts: sql`${waitlistEntries.tellAttempts} + 1`, updatedAt: now })
      .where(and(eq(waitlistEntries.id, row.id), eq(waitlistEntries.tellStatus, row.tellStatus ?? ''), lte(waitlistEntries.tellAfter, now)))
      .returning();
    if (!claimed) continue;
    handled += 1;
    const address = claimed.email.trim().toLowerCase();
    const skip = cityOpenSkipReason(claimed, { suppressed: suppressed.has(address), accountInMarket: inMarket.has(`${address}|${market.id}`) });
    if (skip) {
      await db.update(waitlistEntries).set({ tellStatus: 'skipped', tellReason: skip, tellAfter: null, updatedAt: now }).where(eq(waitlistEntries.id, claimed.id));
      counts.skipped += 1;
      continue;
    }
    const locale = localeOrDefault(claimed.locale);
    try {
      const email = renderCityOpenEmail({
        city: market.name,
        marketSlug: market.slug,
        zip: claimed.zip,
        email: claimed.email,
        interest: claimed.interest as WaitlistInterest,
        appUrl: mailer.appUrl,
        unsubscribeUrl: waitlistUnsubscribePageUrl(mailer.appUrl, claimed.id, locale, now),
        oneClickUrl: waitlistOneClickUrl(mailer.appUrl, claimed.id, now),
        locale,
      });
      await mailer.email.send({ to: claimed.email, subject: email.subject, text: email.text, html: email.html, tag: 'waitlist-city-open', headers: email.headers, idempotencyKey: `waitlist-city-open-${claimed.id}` });
      await db.update(waitlistEntries).set({ tellStatus: 'sent', tellReason: null, tellAfter: null, toldAt: now, updatedAt: now }).where(eq(waitlistEntries.id, claimed.id));
      counts.sent += 1;
    } catch (error) {
      const retryIn = RETRY_MINUTES[claimed.tellAttempts - 1];
      const reason = (error instanceof Error ? error.message : String(error)).slice(0, 300);
      await db
        .update(waitlistEntries)
        .set(retryIn === undefined ? { tellStatus: 'failed', tellReason: reason, tellAfter: null, updatedAt: now } : { tellStatus: 'queued', tellReason: reason, tellAfter: new Date(now.getTime() + retryIn * 60_000), updatedAt: now })
        .where(eq(waitlistEntries.id, claimed.id));
      counts.failed += 1;
    }
  }
  return counts;
}
