import { eq } from 'drizzle-orm';
import { createTranslator } from 'next-intl';
import { DEFAULT_LOCALE, localeOrDefault, routes, type AppLocale } from '@/contracts';
import { messagesFor, perLocale } from '@/i18n/catalog';
import { localizedPath } from '@/shared/locale';
import type { EmailProvider } from '@/integrations/email';
import { users } from '@/modules/accounts/schema';
import type { RenderedEmail } from '@/modules/accounts/emails/welcome';
import type { Db } from '@/platform/db/connect';
import { emailButton, emailCallout, emailFooter, emailFooterLink, emailFooterLinks, emailLayout, emailOpening, emailParagraph, emailSection, esc } from '@/platform/email/layout';
import { formatMoney } from '@/shared/format';

/**
 * The gift card email (backlog B-051: "LINK delivery in-app plus email fallback"): when a reward's gift
 * card is delivered, its link also goes to the helper's email. The link works like cash, so the email says
 * not to forward it. The Rewards page keeps it too.
 */

const tFor = perLocale((locale) => createTranslator({ locale, messages: messagesFor(locale), namespace: 'server.emails.giftCard' }));

type Program = 'welcome' | 'repeat' | 'acceptance' | 'completion';
const isProgram = (value: string): value is Program => ['welcome', 'repeat', 'acceptance', 'completion'].includes(value);

export function renderGiftCardEmail(input: { firstName: string; amountCents: number; program: string; url: string; appUrl: string; locale?: AppLocale }): RenderedEmail {
  const locale = input.locale ?? DEFAULT_LOCALE;
  const t = tFor(locale);
  const amount = formatMoney(input.amountCents);
  const programKey: Program = isProgram(input.program) ? input.program : 'welcome';
  const program = t(`programs.${programKey}`);
  // A welcome card can come before any task (no "thanks for helping"), and a name may be missing: no stand-in word.
  const greeting = { greeting: programKey === 'welcome' ? 'welcome' : 'other', hasName: input.firstName ? 'yes' : 'no', firstName: input.firstName };
  const rewardsUrl = `${input.appUrl}${localizedPath(routes.app.rewards(), locale)}`;
  const preheader = t('preheader');
  const body = emailSection(
    emailOpening(t('heading', { amount }))
      + emailParagraph(t('body', { ...greeting, program }), { top: 12 })
      + emailButton({ href: input.url, label: t('cta'), top: 26 })
      + emailCallout(esc(t('safety')), { tone: 'warm', top: 26 }),
    { top: 40, bottom: 36 },
  );
  const footer = emailFooter([emailFooterLinks([emailFooterLink(rewardsUrl, t('rewards')), emailFooterLink(`${input.appUrl}${localizedPath(routes.app.support(), locale)}`, t('help'))])]);
  return {
    subject: t('subject', { amount }),
    preheader,
    html: emailLayout({ title: t('title'), preheader, appUrl: input.appUrl, body, footer, lang: locale }),
    text: t('text', { ...greeting, amount, program, url: input.url, rewardsUrl }),
  };
}

/** Sends the gift card's link to the helper. A failed email never undoes the delivery (the page has it). */
export async function sendGiftCardEmail(
  { db, email, appUrl }: { db: Db; email: EmailProvider; appUrl: string },
  grant: { id: string; helperUserId: string; program: string; amountCents: number; deliveryUrl: string | null },
): Promise<void> {
  if (!grant.deliveryUrl) return;
  try {
    const [helper] = await db.select({ email: users.email, firstName: users.firstName, locale: users.locale }).from(users).where(eq(users.id, grant.helperUserId)).limit(1);
    if (!helper?.email) return;
    const locale = localeOrDefault(helper.locale);
    const url = grant.deliveryUrl.startsWith('/') ? `${appUrl}${localizedPath(grant.deliveryUrl, locale)}` : grant.deliveryUrl;
    const rendered = renderGiftCardEmail({ firstName: helper.firstName ?? '', amountCents: grant.amountCents, program: grant.program, url, appUrl, locale });
    await email.send({ to: helper.email, subject: rendered.subject, text: rendered.text, html: rendered.html, tag: 'gift-card' });
  } catch (error) {
    console.error('[gift-card-email]', error);
  }
}
