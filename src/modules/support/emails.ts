import { createTranslator } from 'next-intl';
import { DEFAULT_LOCALE, routes, type AppLocale, type CaseEventView, type SupportCasePageData } from '@/contracts';
import { messagesFor, perLocale } from '@/i18n/catalog';
import { formatDateTime, timeZoneName } from '@/shared/format';
import { localizedPath } from '@/shared/locale';
import type { RenderedEmail } from '@/modules/accounts/emails/welcome';
import { EMAIL_COLORS, emailButton, emailCallout, emailLayout, emailOpening, emailParagraph, emailSection, esc } from '@/platform/email/layout';

/**
 * Emails to a public request's address (completion plan 5.22, ./public-requests.ts): the confirmation, and
 * support's answers. Neither says whether an account uses the address. Replies to them aren't read: the
 * person writes again through the contact form with the same address, which adds to the open case.
 */

const tFor = perLocale((locale) => createTranslator({ locale, messages: messagesFor(locale), namespace: 'server.emails' }));

/** Right after the form is sent. It doesn't repeat the message. */
export function renderPublicSupportReceived({ appUrl, locale = DEFAULT_LOCALE }: { appUrl: string; locale?: AppLocale }): RenderedEmail {
  const t = tFor(locale);
  const contactUrl = `${appUrl}${localizedPath(routes.helpContact(), locale)}`;
  const preheader = t('supportReceived.preheader');
  const body = emailSection(
    emailOpening(t('supportReceived.heading'))
      + emailParagraph(t('supportReceived.body'), { top: 12 })
      + emailParagraph(t('supportReceived.more'), { top: 14 })
      + emailButton({ href: contactUrl, label: t('supportReceived.contact'), variant: 'dark', top: 26 })
      + emailParagraph(t('supportReceived.notYou'), { tone: 'muted', size: 14, top: 22 }),
    { top: 40, bottom: 36 },
  );
  return {
    subject: t('supportReceived.subject'),
    preheader,
    html: emailLayout({ title: t('supportReceived.title'), preheader, appUrl, body, footer: '', lang: locale }),
    text: t('supportReceived.text', { contactUrl }),
  };
}

/** Support's answer, as staff wrote it (paragraphs kept), signed with their first name. */
export function renderSupportEmailReply({ body: reply, staffName, appUrl, locale = DEFAULT_LOCALE }: { body: string; staffName: string; appUrl: string; locale?: AppLocale }): RenderedEmail {
  const t = tFor(locale);
  const contactUrl = `${appUrl}${localizedPath(routes.helpContact(), locale)}`;
  const preheader = reply.replace(/\s+/g, ' ').trim().slice(0, 90);
  const paragraphs = reply
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block, index) => `<p style="margin:${index === 0 ? 0 : 12}px 0 0;">${esc(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
  const body = emailSection(
    emailOpening(t('supportReply.heading'))
      + emailCallout(`${paragraphs}<p style="margin:14px 0 0;font-weight:700;">${esc(t('supportReply.signature', { name: staffName }))}</p>`, { tone: 'quote', top: 22 })
      + emailButton({ href: contactUrl, label: t('supportReply.contact'), variant: 'dark', top: 26 })
      + emailParagraph(t('supportReply.replyHow'), { tone: 'muted', size: 14, top: 18 }),
    { top: 40, bottom: 36 },
  );
  return {
    subject: t('supportReply.subject'),
    preheader,
    html: emailLayout({ title: t('supportReply.title'), preheader, appUrl, body, footer: '', lang: locale }),
    text: t('supportReply.text', { reply: reply.trim(), name: staffName, contactUrl }),
  };
}

/**
 * How much of a conversation an email carries, the newest lines: the designed version stays well under Gmail's clipping
 * size with the layout; the plain one keeps up to 200 lines.
 */
const TRANSCRIPT_HTML_BUDGET = 30_000;
const TRANSCRIPT_TEXT_EVENTS = 200;

/** A paragraph block of someone's words: paragraphs kept, lines kept, everything escaped. */
function wordsHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block, index) => `<p style="margin:${index === 0 ? 4 : 10}px 0 0;">${esc(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/**
 * "Email me this conversation" (2026-11-23, ./transcripts.ts): the case's conversation as the member sees it in the app
 * (`SupportCasePageData`: their own messages with support, the assistant's chat before them, status changes and the live
 * chat's lines), oldest first, with times in their home market's zone and a link back to the case. Photos are named,
 * not attached (they stay behind sign-in).
 */
export function renderSupportTranscript({ page, firstName, appUrl, locale = DEFAULT_LOCALE, timeZone, now }: { page: SupportCasePageData; firstName: string; appUrl: string; locale?: AppLocale; timeZone: string; now: Date }): RenderedEmail {
  const t = tFor(locale);
  const caseUrl = `${appUrl}${localizedPath(routes.app.supportCase(page.case.id), locale)}`;
  // A request's subject is its topic (staff's English label otherwise): said in the reader's language.
  const about = page.case.kind === 'request' && page.case.topic && !page.case.bookingId ? t(`supportTranscript.topics.${page.case.topic}`) : page.case.subject;
  const when = (at: string) => formatDateTime(at, locale, timeZone);
  const senderOf = (event: CaseEventView) =>
    event.from === 'me' ? t('supportTranscript.you') : event.from === 'assistant' ? t('supportTranscript.assistant') : event.from === 'support' ? (event.agent ? t('supportTranscript.agent', { name: event.agent.name }) : t('supportTranscript.support')) : t('supportTranscript.update');
  const lineOf = (event: CaseEventView) =>
    event.kind === 'status'
      ? t('supportTranscript.status', { status: t(`supportTranscript.statuses.${event.status ?? 'open'}`) })
      : event.kind === 'live'
        ? event.live === 'ended' ? t('supportTranscript.liveEnded') : t('supportTranscript.liveJoined', { name: event.agentName ?? t('supportTranscript.support') })
        : '';
  const photosOf = (event: CaseEventView) => (event.photos?.length ? t('supportTranscript.photos', { count: event.photos.length }) : '');

  const intro = firstName ? t('supportTranscript.intro', { name: firstName, subject: about, date: when(now.toISOString()) }) : t('supportTranscript.introNoName', { subject: about, date: when(now.toISOString()) });
  const zone = t('supportTranscript.zone', { zone: timeZoneName(timeZone, locale) });
  const block = (event: CaseEventView) => {
    if (event.kind !== 'message') return emailParagraph(`${lineOf(event)} · ${when(event.at)}`, { tone: 'muted', size: 14, top: 14 });
    const photos = photosOf(event);
    return emailCallout(
      `<p style="margin:0;font-weight:700;">${esc(senderOf(event))} <span style="font-weight:400;color:${EMAIL_COLORS.muted};">· ${esc(when(event.at))}</span></p>${wordsHtml(event.body ?? '')}${photos ? `<p style="margin:8px 0 0;font-style:italic;">${esc(photos)}</p>` : ''}`,
      { tone: event.from === 'me' ? 'warm' : 'quote', top: 14 },
    );
  };
  // The newest lines that fit when there are many (Gmail clips a long email): the case keeps the whole conversation.
  const blocks: string[] = [];
  let size = 0;
  for (const event of [...page.events].reverse()) {
    const next = block(event);
    if (blocks.length > 0 && size + next.length > TRANSCRIPT_HTML_BUDGET) break;
    blocks.unshift(next);
    size += next.length;
  }
  const cut = page.events.length - blocks.length;
  const html = (cut > 0 ? emailParagraph(t('supportTranscript.earlier', { count: cut }), { tone: 'muted', size: 14, top: 18 }) : '') + blocks.join('');
  const text = page.events
    .slice(-TRANSCRIPT_TEXT_EVENTS)
    .map((event) => (event.kind === 'message' ? `${senderOf(event)} · ${when(event.at)}\n${(event.body ?? '').trim()}${photosOf(event) ? `\n${photosOf(event)}` : ''}` : `${lineOf(event)} · ${when(event.at)}`))
    .join('\n\n');
  const preheader = t('supportTranscript.preheader', { subject: about });
  const body = emailSection(
    emailOpening(t('supportTranscript.heading'))
      + emailParagraph(intro, { top: 12 })
      + emailParagraph(zone, { tone: 'muted', size: 14, top: 8 })
      + (html || emailParagraph(t('supportTranscript.empty'), { tone: 'muted', top: 18 }))
      + emailButton({ href: caseUrl, label: t('supportTranscript.open'), variant: 'dark', top: 26 })
      + emailParagraph(t('supportTranscript.why'), { tone: 'muted', size: 14, top: 18 }),
    { top: 40, bottom: 36 },
  );
  return {
    subject: t('supportTranscript.subject', { subject: about }),
    preheader,
    html: emailLayout({ title: t('supportTranscript.title'), preheader, appUrl, body, footer: '', lang: locale }),
    text: [t('supportTranscript.heading'), intro, zone, text || t('supportTranscript.empty'), `${t('supportTranscript.open')}: ${caseUrl}`, t('supportTranscript.why')].join('\n\n'),
  };
}
