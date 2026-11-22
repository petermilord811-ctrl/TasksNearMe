import { createTranslator } from 'next-intl';
import { DEFAULT_LOCALE, routes, type AppLocale, type StaffRole } from '@/contracts';
import { messagesFor, perLocale } from '@/i18n/catalog';
import { emailButton, emailCallout, emailLayout, emailOpening, emailParagraph, emailSection, esc } from '@/platform/email/layout';
import type { RenderedEmail } from './welcome';

/**
 * To every admin, when a staff role takes effect (security review SEC19): who has which role now, who granted it, who
 * approved it when a second admin had to, and why (as they wrote it). Nobody grants power quietly.
 */

const tFor = perLocale((locale) => createTranslator({ locale, messages: messagesFor(locale), namespace: 'server.emails.staffRoleGranted' }));

export function renderStaffRoleGrantedEmail({
  person,
  email,
  role,
  grantedBy,
  approvedBy,
  reason,
  appUrl,
  locale = DEFAULT_LOCALE,
}: {
  person: string;
  email: string;
  role: StaffRole;
  grantedBy: string;
  approvedBy?: string;
  reason: string;
  appUrl: string;
  locale?: AppLocale;
}): RenderedEmail {
  const t = tFor(locale);
  const values = { person, email, role: t(`roles.${role}`), grantedBy, approvedBy: approvedBy ?? '', reason };
  const who = approvedBy ? t('approved', values) : t('granted', values);
  const preheader = t('preheader', values);
  const staffUrl = `${appUrl}${routes.admin.staff()}`;
  const body = emailSection(
    emailOpening(t('heading', values), { eyebrow: t('eyebrow') })
      + emailParagraph(who, { top: 12 })
      + emailCallout(esc(t('reason', values)), { tone: 'quote', top: 20 })
      + emailParagraph(t('notYou'), { tone: 'muted', size: 15, top: 20 })
      + emailButton({ href: staffUrl, label: t('open'), variant: 'dark', top: 24 }),
    { top: 40, bottom: 36 },
  );
  return {
    subject: t('subject', values),
    preheader,
    html: emailLayout({ title: t('title'), preheader, appUrl, body, footer: '', lang: locale }),
    text: t('text', { ...values, who, staffUrl }),
  };
}
