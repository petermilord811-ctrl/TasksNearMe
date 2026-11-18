import { createTranslator } from 'next-intl';
import { DEFAULT_LOCALE, routes, type AppLocale } from '@/contracts';
import { messagesFor, perLocale } from '@/i18n/catalog';
import { formatMoney } from '@/shared/format';
import { EMAIL_COLORS, EMAIL_DISPLAY_FONT, EMAIL_FONT, emailButton, emailLayout, esc } from '@/platform/email/layout';

/**
 * The welcome email, sent once when someone finishes signing up. The welcome gift card leads it while the program
 * is on (blueprint 05 §2, 2026-11-14: every helper whose phone, ID and background checks pass): the gift card
 * with its three checks, the steps to earn it with the first one already done, and a button to start. Then a way
 * in for people who came to book help: one link per kind of task. Every link is absolute.
 */

const tFor = perLocale((locale) => createTranslator({ locale, messages: messagesFor(locale), namespace: 'server.emails' }));

/** The landing page's category colors, for the task links. */
const CATEGORY_COLORS: Record<string, string> = {
  'furniture-assembly': '#f07a2b',
  'moving-help': '#8b5cf6',
  'yard-cleanup': '#2e9e68',
  'light-cleaning': '#e5508a',
  'computer-help': '#3b7bf6',
};

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
  /** "Austin, TX". */
  market: string;
  /** The welcome gift card, while the program is on in the person's market. */
  offer?: WelcomeOffer;
  /** Kinds of task to start a post from, in display order. */
  categories: { slug: string; name: string }[];
  /** The recipient's language (English when left out). */
  locale?: AppLocale;
}

export interface RenderedEmail {
  subject: string;
  preheader: string;
  html: string;
  text: string;
}

const ink = `color:${EMAIL_COLORS.ink};`;
const muted = `color:${EMAIL_COLORS.muted};`;
const body = `font-family:${EMAIL_FONT};font-size:16px;line-height:24px;`;

const CSS = `
  .gift-amount { animation: tnm-pop 900ms cubic-bezier(.22,1,.36,1) both; }
  @keyframes tnm-pop { 0% { transform: scale(.86); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
  .chip { transition: border-color 160ms ease, background-color 160ms ease; }
  .chip:hover { border-color: ${EMAIL_COLORS.ink} !important; background: ${EMAIL_COLORS.softOrange} !important; }
  .step-done { background: ${EMAIL_COLORS.success} !important; }
  @media (prefers-color-scheme: dark) {
    .chip { background: #181511 !important; border-color: #2e2822 !important; }
    .chip-text { color: #f7f1ea !important; }
    .step-num { background: #2e2822 !important; color: #f7f1ea !important; }
    .reward-box { background: #2c1e16 !important; border-color: #4a3324 !important; }
  }
  @media (prefers-reduced-motion: reduce) { .gift-amount { animation: none !important; } }
`;

function stepRow(marker: string, title: string, text: string, state: 'done' | 'next' | 'reward', last = false, doneLabel = ''): string {
  const circle =
    state === 'done'
      ? `<td class="step-done" width="36" height="36" align="center" valign="middle" style="width:36px;height:36px;border-radius:999px;background:${EMAIL_COLORS.success};color:#ffffff;font-family:${EMAIL_FONT};font-size:18px;font-weight:700;">&#10003;</td>`
      : state === 'reward'
        ? `<td width="36" height="36" align="center" valign="middle" style="width:36px;height:36px;border-radius:999px;background:#f5b544;color:${EMAIL_COLORS.ink};font-family:${EMAIL_FONT};font-size:18px;">&#127873;</td>`
        : `<td class="step-num" width="36" height="36" align="center" valign="middle" style="width:36px;height:36px;border-radius:999px;background:#f1ebe3;${ink}font-family:${EMAIL_FONT};font-size:15px;font-weight:700;">${esc(marker)}</td>`;
  return `<tr>
<td width="36" valign="top" style="width:36px;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>${circle}</tr></table>
${last ? '' : `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="36"><tr><td align="center"><div class="rule" style="width:2px;height:22px;background:${EMAIL_COLORS.border};margin:4px auto 4px;"></div></td></tr></table>`}
</td>
<td valign="top" style="padding:6px 0 0 14px;">
<p class="ink" style="margin:0;${body}font-weight:700;${ink}">${esc(title)}${state === 'done' ? ` <span style="display:inline-block;margin-left:6px;padding:1px 9px;border-radius:999px;background:#e3f3e8;color:${EMAIL_COLORS.success};font-size:12px;line-height:20px;font-weight:700;vertical-align:1px;">${esc(doneLabel)}</span>` : ''}</p>
<p class="muted" style="margin:2px 0 ${last ? '0' : '10px'};font-family:${EMAIL_FONT};font-size:14px;line-height:21px;${muted}">${esc(text)}</p>
</td>
</tr>`;
}

export function renderWelcomeEmail(input: WelcomeEmailInput): RenderedEmail {
  const locale = input.locale ?? DEFAULT_LOCALE;
  const t = tFor(locale);
  const url = (path: string) => `${input.appUrl}${path}`;
  const offer = input.offer;
  const amount = offer ? formatMoney(offer.amountCents).replace(/\.00$/, '') : '';
  const onboarding = url(routes.app.helperOnboarding());
  const subject = offer ? t('welcome.subjectOffer', { firstName: input.firstName, amount }) : t('welcome.subject', { firstName: input.firstName });
  const preheader = offer ? t('welcome.preheaderOffer', { amount }) : t('welcome.preheader');
  // The phone step only where texts work (plan 9.2: the offer's checks leave it out otherwise).
  const withPhone = (offer?.checks ?? ['phone']).includes('phone');
  // The checks that earn the gift card, as chips on it.
  const checkChips = offer
    ? (offer.checks ?? (['phone', 'identity', 'background'] as const))
        .map((check) => `<span style="display:inline-block;margin:0 6px 6px 0;padding:5px 12px;border-radius:999px;background:rgba(255,255,255,0.22);font-size:13px;line-height:18px;font-weight:700;color:#ffffff;">&#10003; ${esc(t(`welcome.gift.checks.${check}`))}</span>`)
        .join('')
    : '';

  const hero = `<tr><td class="card-pad" style="padding:40px 40px 8px;">
<h1 class="h1 ink" style="margin:0;font-family:${EMAIL_DISPLAY_FONT};font-size:36px;line-height:42px;font-weight:800;letter-spacing:-1px;${ink}">${esc(t('welcome.greeting', { firstName: input.firstName }))}</h1>
<p class="muted" style="margin:12px 0 0;${body}${muted}">${esc(t('welcome.intro', { market: input.market }))}</p>
</td></tr>`;

  const gift = offer
    ? `<tr><td class="card-pad" style="padding:24px 40px 8px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-radius:24px;background:${EMAIL_COLORS.violet};background-image:linear-gradient(135deg,#ff8a5b 0%,#ff5fa2 42%,#8b5cf6 100%);">
<tr><td style="padding:28px 28px 26px;font-family:${EMAIL_FONT};color:#ffffff;">
<p style="margin:0;font-size:12px;line-height:16px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#ffffff;opacity:0.9;">${esc(t('welcome.gift.eyebrow'))}</p>
<p class="gift-amount" style="margin:10px 0 0;font-family:${EMAIL_DISPLAY_FONT};font-size:72px;line-height:72px;font-weight:800;letter-spacing:-3px;color:#ffffff;">${esc(amount)}</p>
<p style="margin:2px 0 0;font-size:20px;line-height:26px;font-weight:700;color:#ffffff;">${esc(t('welcome.gift.label'))}</p>
<p style="margin:10px 0 0;font-size:15px;line-height:22px;color:#ffffff;">${esc(t('welcome.gift.for'))}</p>
<p style="margin:14px 0 0;">${checkChips}</p>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:16px;"><tr><td>${emailButton({ href: onboarding, label: t('welcome.gift.cta'), variant: 'light' })}</td></tr></table>
<p style="margin:14px 0 0;font-size:14px;line-height:20px;"><a class="link" href="${esc(url(routes.becomeAHelper()))}" target="_blank" style="color:#ffffff;text-decoration:underline;">${esc(t('welcome.gift.learn'))}</a></p>
</td></tr>
</table>
</td></tr>`
    : '';

  const steps = offer
    ? `<tr><td class="card-pad" style="padding:28px 40px 4px;">
<h2 class="ink" style="margin:0 0 16px;font-family:${EMAIL_DISPLAY_FONT};font-size:22px;line-height:28px;font-weight:800;letter-spacing:-0.5px;${ink}">${esc(t('welcome.steps.title', { amount }))}</h2>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
${stepRow('1', t('welcome.steps.account.title'), t('welcome.steps.account.body'), 'done', false, t('welcome.steps.done'))}
${stepRow('2', t('welcome.steps.profile.title'), t('welcome.steps.profile.body'), 'next')}
${withPhone ? stepRow('3', t('welcome.steps.phone.title'), t('welcome.steps.phone.body'), 'next') : ''}
${stepRow(withPhone ? '4' : '3', t('welcome.steps.identity.title'), t('welcome.steps.identity.body'), 'next')}
${stepRow(withPhone ? '5' : '4', t('welcome.steps.background.title'), t('welcome.steps.background.body'), 'next')}
${stepRow('', t('welcome.steps.reward.title', { amount }), t('welcome.steps.reward.body', { redeemDays: offer.redeemWithinDays }), 'reward', true)}
</table>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:20px;"><tr><td>${emailButton({ href: onboarding, label: t('welcome.gift.cta') })}</td></tr></table>
</td></tr>`
    : `<tr><td class="card-pad" style="padding:24px 40px 4px;">
<h2 class="ink" style="margin:0;font-family:${EMAIL_DISPLAY_FONT};font-size:22px;line-height:28px;font-weight:800;${ink}">${esc(t('welcome.helper.title'))}</h2>
<p class="muted" style="margin:8px 0 18px;${body}${muted}">${esc(t('welcome.helper.body'))}</p>
${emailButton({ href: url(routes.becomeAHelper()), label: t('welcome.helper.cta'), variant: 'dark' })}
</td></tr>`;

  const chips = input.categories
    .map(
      (category) =>
        `<a class="chip" href="${esc(url(routes.app.newTask({ category: category.slug as never })))}" target="_blank" style="display:inline-block;margin:0 8px 10px 0;padding:9px 14px;border:1px solid ${EMAIL_COLORS.border};border-radius:999px;background:#ffffff;text-decoration:none;font-family:${EMAIL_FONT};font-size:14px;line-height:18px;font-weight:600;">`
        + `<span style="display:inline-block;width:9px;height:9px;margin-right:8px;border-radius:999px;background:${CATEGORY_COLORS[category.slug] ?? EMAIL_COLORS.violet};vertical-align:1px;"></span><span class="chip-text" style="${ink}">${esc(category.name)}</span></a>`,
    )
    .join('');

  const client = `<tr><td class="card-pad" style="padding:30px 40px 6px;">
<div class="rule" style="height:1px;background:${EMAIL_COLORS.border};margin:0 0 26px;"></div>
<h2 class="ink" style="margin:0;font-family:${EMAIL_DISPLAY_FONT};font-size:22px;line-height:28px;font-weight:800;letter-spacing:-0.5px;${ink}">${esc(t('welcome.client.title'))}</h2>
<p class="muted" style="margin:8px 0 16px;${body}${muted}">${esc(t('welcome.client.body'))}</p>
<div>${chips}</div>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:8px;"><tr><td>${emailButton({ href: url(routes.app.newTask()), label: t('welcome.client.cta'), variant: 'dark' })}</td></tr></table>
</td></tr>`;

  const signoff = `<tr><td class="card-pad" style="padding:28px 40px 36px;">
<p class="muted" style="margin:0;${body}${muted}">${esc(t('welcome.signoff'))}</p>
<p class="ink" style="margin:2px 0 0;${body}font-weight:700;${ink}">${esc(t('welcome.team'))}</p>
</td></tr>`;

  const link = (href: string, label: string) => `<a class="link" href="${esc(href)}" target="_blank" style="color:${EMAIL_COLORS.muted};text-decoration:underline;">${esc(label)}</a>`;
  const footer = `<p style="margin:0;">${esc(t('footer.why', { email: input.email }))}</p>
<p style="margin:8px 0 0;">${link(url(routes.app.account()), t('footer.preferences'))} &nbsp;·&nbsp; ${link(url(routes.help()), t('footer.help'))}${offer ? ` &nbsp;·&nbsp; ${link(url(routes.legal('rewards-terms')), t('footer.rewardsTerms'))}` : ''}</p>
<p style="margin:8px 0 0;">${esc(t('footer.place', { market: input.market }))}</p>`;

  const html = emailLayout({ title: t('welcome.title'), preheader, appUrl: input.appUrl, body: hero + gift + steps + client + signoff, footer, css: CSS, lang: locale });

  const lines = [
    t('welcome.greeting', { firstName: input.firstName }),
    '',
    t('welcome.intro', { market: input.market }),
    '',
  ];
  if (offer) {
    lines.push(
      `${t('welcome.gift.eyebrow').toUpperCase()}: ${amount} ${t('welcome.gift.label')}`,
      t('welcome.gift.for'),
      '',
      t('welcome.steps.title', { amount }),
      `[x] ${t('welcome.steps.account.title')}`,
      `[ ] ${t('welcome.steps.profile.title')}: ${t('welcome.steps.profile.body')}`,
      ...(withPhone ? [`[ ] ${t('welcome.steps.phone.title')}: ${t('welcome.steps.phone.body')}`] : []),
      `[ ] ${t('welcome.steps.identity.title')}: ${t('welcome.steps.identity.body')}`,
      `[ ] ${t('welcome.steps.background.title')}: ${t('welcome.steps.background.body')}`,
      `${t('welcome.steps.reward.title', { amount })} ${t('welcome.steps.reward.body', { redeemDays: offer.redeemWithinDays })}`,
      '',
      `${t('welcome.gift.cta')}: ${onboarding}`,
      `${t('footer.rewardsTerms')}: ${url(routes.legal('rewards-terms'))}`,
    );
  } else {
    lines.push(t('welcome.helper.title'), t('welcome.helper.body'), `${t('welcome.helper.cta')}: ${url(routes.becomeAHelper())}`);
  }
  lines.push(
    '',
    t('welcome.client.title'),
    t('welcome.client.body'),
    ...input.categories.map((category) => `- ${category.name}: ${url(routes.app.newTask({ category: category.slug as never }))}`),
    '',
    t('welcome.signoff'),
    t('welcome.team'),
    '',
    t('footer.why', { email: input.email }),
    `${t('footer.preferences')}: ${url(routes.app.account())}`,
  );
  return { subject, preheader, html, text: lines.join('\n') };
}
