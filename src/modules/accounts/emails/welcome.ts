import { createTranslator } from 'next-intl';
import { DEFAULT_LOCALE, routes, type AppLocale, type Mode } from '@/contracts';
import { messagesFor, perLocale } from '@/i18n/catalog';
import { localizedPath } from '@/shared/locale';
import { formatMoney } from '@/shared/format';
import {
  emailButton,
  emailFooter,
  emailFooterLink,
  emailFooterLinks,
  emailLayout,
  emailOpening,
  emailParagraph,
  emailSection,
  emailSignoff,
  emailSteps,
  esc,
} from '@/platform/email/layout';

/**
 * The welcome email, sent once when someone finishes signing up. It reads like a short note from a service, not a
 * campaign (the owner's report, 2026-11-22: the gift-card-led welcome landed in Gmail's Promotions tab): a subject
 * and preview line without money or offers, the side of the app the person chose (`side`, users.mode) with its one
 * next step as the only button, and the welcome gift card, while the program is on (blueprint 05 §2), as one plain
 * sentence for helpers. No category links, banners or second buttons; the footer keeps the help center and, with the
 * gift card, its terms. Every link is absolute and in the reader's language.
 */

const tFor = perLocale((locale) => createTranslator({ locale, messages: messagesFor(locale), namespace: 'server.emails' }));

export interface WelcomeOffer {
  amountCents: number;
  redeemWithinDays: number;
  /** The checks that earn it (no phone where texts don't work, plan 9.2). Default: phone, ID and background. */
  checks?: readonly ('phone' | 'identity' | 'background')[];
}

export interface WelcomeEmailInput {
  firstName: string;
  email: string;
  appUrl: string;
  /** "Gainesville, FL" (empty when the market is unknown). */
  market: string;
  /** The welcome gift card, while the program is on in the person's market. */
  offer?: WelcomeOffer;
  /**
   * The side of the app the person chose at sign-up (users.mode): helper setup, or posting a task. Left out: one
   * neutral way into the app.
   */
  side?: Mode;
  /** The recipient's language (English when left out). */
  locale?: AppLocale;
}

export interface RenderedEmail {
  subject: string;
  preheader: string;
  html: string;
  text: string;
}

export function renderWelcomeEmail(input: WelcomeEmailInput): RenderedEmail {
  const locale = input.locale ?? DEFAULT_LOCALE;
  const t = tFor(locale);
  // In the reader's language (sweep MN12, messages pass J-M1).
  const url = (path: string) => `${input.appUrl}${localizedPath(path, locale)}`;
  const side = input.side ?? 'neutral';
  // The gift card is a helper's: a poster's welcome doesn't sell them on it.
  const offer = side === 'helper' ? input.offer : undefined;
  const amount = offer ? formatMoney(offer.amountCents).replace(/\.00$/, '') : '';
  // The phone check only where texts work (plan 9.2: the offer's checks leave it out otherwise).
  const withPhone = (input.offer?.checks ?? ['phone']).includes('phone') ? 'yes' : 'no';

  const action =
    side === 'helper'
      ? { href: url(routes.app.helperOnboarding()), label: t('welcome.helper.cta') }
      : side === 'poster'
        ? { href: url(routes.app.newTask()), label: t('welcome.poster.cta') }
        : { href: url(routes.app.home()), label: t('welcome.neutral.cta') };
  const steps = (['profile', 'checks', 'offers'] as const).map((step) => ({ title: t(`welcome.helper.steps.${step}.title`), body: t(`welcome.helper.steps.${step}.body`, { withPhone }) }));
  const gift = offer ? t('welcome.helper.gift', { withPhone, amount }) : '';
  const greeting = t('welcome.greeting', { firstName: input.firstName });
  const preheader = t('welcome.preheader', { side });

  const main =
    side === 'helper'
      ? emailParagraph(t('welcome.helper.body')) + emailSteps(steps) + emailButton(action) + (gift ? emailParagraph(gift, { tone: 'muted', size: 15, top: 22 }) : '')
      : side === 'poster'
        ? emailParagraph(t('welcome.poster.body')) + emailButton(action) + emailParagraph(t('welcome.poster.alsoHelp'), { tone: 'muted', size: 15, top: 22 })
        : emailParagraph(t('welcome.neutral.body')) + emailButton(action);

  const body = emailSection(
    emailOpening(greeting) + emailParagraph(t('welcome.ready'), { tone: 'ink', size: 17, top: 12, weight: 600 }) + main + emailSignoff(t('welcome.signoff'), t('welcome.team'), { top: 30 }),
    { top: 40, bottom: 38 },
  );

  const footer = emailFooter([
    esc(t('footer.why', { email: input.email })),
    emailFooterLinks([emailFooterLink(url(routes.help()), t('footer.help')), offer ? emailFooterLink(url(routes.legal('rewards-terms')), t('footer.rewardsTerms')) : '']),
    input.market ? esc(t('footer.place', { market: input.market })) : '',
  ]);

  const html = emailLayout({ title: t('welcome.title'), preheader, appUrl: input.appUrl, body, footer, lang: locale });

  const lines = [greeting, '', t('welcome.ready'), ''];
  if (side === 'helper') {
    lines.push(t('welcome.helper.body'), '', ...steps.map((step, index) => `${index + 1}. ${step.title}\n   ${step.body}`), '');
  } else {
    lines.push(t(side === 'poster' ? 'welcome.poster.body' : 'welcome.neutral.body'), '');
  }
  lines.push(`${action.label}: ${action.href}`, '');
  if (gift) lines.push(gift, '');
  if (side === 'poster') lines.push(t('welcome.poster.alsoHelp'), '');
  lines.push(
    t('welcome.signoff'),
    t('welcome.team'),
    '',
    t('footer.why', { email: input.email }),
    `${t('footer.help')}: ${url(routes.help())}`,
    ...(offer ? [`${t('footer.rewardsTerms')}: ${url(routes.legal('rewards-terms'))}`] : []),
  );
  return { subject: t('welcome.subject', { firstName: input.firstName }), preheader, html, text: lines.join('\n') };
}
