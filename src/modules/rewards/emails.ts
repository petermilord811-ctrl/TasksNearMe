import { eq } from 'drizzle-orm';
import { createTranslator } from 'next-intl';
import { DEFAULT_LOCALE, localeOrDefault, routes, type AppLocale } from '@/contracts';
import { messagesFor, perLocale } from '@/i18n/catalog';
import type { EmailProvider } from '@/integrations/email';
import { users } from '@/modules/accounts/schema';
import type { RenderedEmail } from '@/modules/accounts/emails/welcome';
import type { Db } from '@/platform/db/connect';
import { EMAIL_COLORS, EMAIL_DISPLAY_FONT, EMAIL_FONT, emailButton, emailLayout, esc } from '@/platform/email/layout';
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
  const program = t(`programs.${isProgram(input.program) ? input.program : 'welcome'}`);
  const rewardsUrl = `${input.appUrl}${routes.app.rewards()}`;
  const preheader = t('preheader');
  const body = `<tr><td class="card-pad" style="padding:40px 40px 36px;">
<h1 class="h1 ink" style="margin:0;font-family:${EMAIL_DISPLAY_FONT};font-size:30px;line-height:36px;font-weight:800;letter-spacing:-0.8px;color:${EMAIL_COLORS.ink};">${esc(t('heading', { amount }))}</h1>
<p class="muted" style="margin:10px 0 0;font-family:${EMAIL_FONT};font-size:16px;line-height:24px;color:${EMAIL_COLORS.muted};">${esc(t('body', { firstName: input.firstName, program }))}</p>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:24px;"><tr><td>${emailButton({ href: input.url, label: t('cta') })}</td></tr></table>
<p class="ink" style="margin:22px 0 0;padding:14px 16px;border-radius:14px;background:${EMAIL_COLORS.softOrange};font-family:${EMAIL_FONT};font-size:14px;line-height:21px;color:${EMAIL_COLORS.ink};">${esc(t('safety'))}</p>
</td></tr>`;
  const link = (href: string, label: string) => `<a class="link" href="${esc(href)}" target="_blank" style="color:${EMAIL_COLORS.muted};text-decoration:underline;">${esc(label)}</a>`;
  const footer = `<p style="margin:0;">${link(rewardsUrl, t('rewards'))} &nbsp;·&nbsp; ${link(`${input.appUrl}${routes.app.support()}`, t('help'))}</p>`;
  return {
    subject: t('subject', { amount }),
    preheader,
    html: emailLayout({ title: t('title'), preheader, appUrl: input.appUrl, body, footer }),
    text: t('text', { firstName: input.firstName, amount, program, url: input.url, rewardsUrl }),
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
    const url = grant.deliveryUrl.startsWith('/') ? `${appUrl}${grant.deliveryUrl}` : grant.deliveryUrl;
    const rendered = renderGiftCardEmail({ firstName: helper.firstName || 'there', amountCents: grant.amountCents, program: grant.program, url, appUrl, locale: localeOrDefault(helper.locale) });
    await email.send({ to: helper.email, subject: rendered.subject, text: rendered.text, html: rendered.html, tag: 'gift-card' });
  } catch (error) {
    console.error('[gift-card-email]', error);
  }
}
