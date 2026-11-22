import type { AppLocale } from '@/contracts/locale';

/**
 * TasksNearMe's email layout and the pieces every email is built from (the owner's email upgrade, 2026-11-22).
 *
 * - **Holds everywhere.** Plain tables and inline styles, so Gmail (web and apps), Apple Mail, Yahoo and Outlook show
 *   the same design. The column is fluid up to 600 px; Outlook on Windows, which ignores max-width, gets a fixed 600 px
 *   "ghost" table in MSO comments, its own font stack and 96 dpi. Buttons are a colored cell with the link inside, so
 *   Outlook shows the color and the padding (`mso-padding-alt`) although it ignores padding on links.
 * - **Dark mode.** Apple Mail and iOS Mail follow `prefers-color-scheme`; Outlook.com marks what it recolors with
 *   `data-ogsc` (text) and `data-ogsb` (backgrounds) and gets the same palette through those. Gmail's apps invert
 *   colors on their own: the light palette is chosen to survive that.
 * - **Reads with images off.** The wordmark is text; the app icon beside it is the only image.
 * - **Accessible.** One `role="article"` region named by the title, the reader's `lang`, one h1 per email, AA contrast
 *   in both palettes, links underlined in running text, buttons at least 48 px tall that fill the column on phones.
 * - **Calm, with few links.** Transactional mail (codes, notices, the welcome) carries no unsubscribe headers and only
 *   the links it needs: mail that reads like a note from a service, not a campaign, is what inboxes keep out of
 *   Promotions. The brand at the top isn't a link for the same reason.
 *
 * Every value put into HTML goes through `esc`: the pieces that take text escape it, the ones that take `html` expect it
 * escaped already.
 */

export const EMAIL_COLORS = {
  page: '#fbf7f2',
  card: '#ffffff',
  ink: '#17120e',
  /** Running text: a little softer than headings, still about 11:1 on white. */
  body: '#3b332c',
  /** Secondary text: 5.9:1 on white, 5.5:1 on the page. */
  muted: '#6a6158',
  border: '#ebe2d6',
  primary: '#c13f12',
  primaryHover: '#a93610',
  violet: '#6d4ef5',
  success: '#217a46',
  softOrange: '#fff1e7',
  softOrangeBorder: '#f6d6c2',
  note: '#f6f1ea',
  pink: '#e5508a',
} as const;

/** The same roles in the dark palette (Apple Mail, iOS Mail, Outlook.com). */
const DARK = {
  page: '#0f0d0b',
  card: '#1a1613',
  ink: '#f7f1ea',
  body: '#e4dbd0',
  muted: '#b8aea2',
  border: '#2e2822',
  primary: '#ff8a5b',
  softOrange: '#2a1d15',
  softOrangeBorder: '#4a3324',
  note: '#221d18',
} as const;

export const EMAIL_FONT = "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
export const EMAIL_DISPLAY_FONT = "'Bricolage Grotesque', 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO_FONT = "'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', 'Courier New', monospace";

/** Escapes text for HTML (element content and attribute values). */
export function esc(value: string | number): string {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * The app icon at the top of every email, as an absolute https URL (mail apps don't show SVG or relative
 * paths). It's the app's own PNG icon, so a new icon in public/icons reaches every email; raise the `v` when it
 * changes, because Gmail and Outlook cache images by URL.
 */
export const EMAIL_ICON_PATH = '/icons/icon-192.png?v=2';

export type EmailButtonVariant = 'primary' | 'dark' | 'light';

/**
 * A button that survives every email app: a colored, rounded cell (Outlook shows its color and padding) with the link
 * inside (everyone else gets the padded link, so the whole button is the tap target), 48 px tall; on phones it fills
 * the column. `top`: the space above it.
 */
export function emailButton({ href, label, variant = 'primary', arrow = false, top = 28, align = 'left' }: { href: string; label: string; variant?: EmailButtonVariant; arrow?: boolean; top?: number; align?: 'left' | 'center' }): string {
  const look = {
    primary: { background: EMAIL_COLORS.primary, color: '#ffffff', border: EMAIL_COLORS.primary },
    dark: { background: EMAIL_COLORS.ink, color: '#ffffff', border: EMAIL_COLORS.ink },
    light: { background: '#ffffff', color: EMAIL_COLORS.ink, border: EMAIL_COLORS.border },
  }[variant];
  return `<table role="presentation" class="btn-table" cellspacing="0" cellpadding="0" border="0"${align === 'center' ? ' align="center"' : ''} style="margin:${top}px ${align === 'center' ? 'auto' : '0'} 0;border-collapse:separate;"><tr>`
    + `<td class="btn-cell btn-${variant}" align="center" bgcolor="${look.background}" style="border-radius:999px;background-color:${look.background};border:1px solid ${look.border};mso-padding-alt:14px 30px;">`
    + `<a class="btn-link btn-link-${variant}" href="${esc(href)}" target="_blank" style="display:inline-block;padding:14px 30px;font-family:${EMAIL_FONT};font-size:16px;line-height:20px;font-weight:700;color:${look.color};text-decoration:none;border-radius:999px;mso-padding-alt:0;">${esc(label)}${arrow ? '&nbsp;&rarr;' : ''}</a>`
    + `</td></tr></table>`;
}

/** A row of the card: its content with the card's side padding (24 px on phones). */
export function emailSection(content: string, { top = 0, bottom = 0 }: { top?: number; bottom?: number } = {}): string {
  return `<tr><td class="pad" style="padding:${top}px 40px ${bottom}px;">${content}</td></tr>`;
}

/**
 * The opening of the card: a short brand-colored rule, then the eyebrow (optional) and the email's one h1.
 * `size: 'sentence'` for a heading that is a whole sentence (notifications).
 */
export function emailOpening(heading: string, { eyebrow, size = 'title' }: { eyebrow?: string; size?: 'title' | 'sentence' } = {}): string {
  const [fontSize, lineHeight, tracking] = size === 'title' ? [30, 37, -0.8] : [24, 31, -0.4];
  // The brand's three colors as one short rule: the same mark on every email, with no image to load.
  const segment = (width: number, color: string, radius: string) =>
    `<td width="${width}" height="4" bgcolor="${color}" style="width:${width}px;height:4px;line-height:4px;font-size:4px;mso-line-height-rule:exactly;border-radius:${radius};background-color:${color};">&nbsp;</td>`;
  const rule = `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 22px;"><tr>`
    + segment(28, EMAIL_COLORS.primary, '4px 0 0 4px') + segment(14, EMAIL_COLORS.pink, '0') + segment(8, EMAIL_COLORS.violet, '0 4px 4px 0')
    + `</tr></table>`;
  const label = eyebrow ? `<p class="eyebrow" style="margin:0 0 10px;font-family:${EMAIL_FONT};font-size:12px;line-height:16px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${EMAIL_COLORS.primary};">${esc(eyebrow)}</p>` : '';
  return `${rule}${label}<h1 class="h1 h1-${size} ink" style="margin:0;font-family:${EMAIL_DISPLAY_FONT};font-size:${fontSize}px;line-height:${lineHeight}px;font-weight:800;letter-spacing:${tracking}px;color:${EMAIL_COLORS.ink};mso-line-height-rule:exactly;">${esc(heading)}</h1>`;
}

type Tone = 'body' | 'muted' | 'ink';
const TONE_COLOR: Record<Tone, string> = { body: EMAIL_COLORS.body, muted: EMAIL_COLORS.muted, ink: EMAIL_COLORS.ink };
const TONE_CLASS: Record<Tone, string> = { body: 'body-text', muted: 'muted', ink: 'ink' };
const LINE_HEIGHT = { 13: 20, 14: 21, 15: 23, 16: 26, 17: 27 } as const;

export interface EmailParagraphOptions {
  tone?: Tone;
  size?: keyof typeof LINE_HEIGHT;
  top?: number;
  weight?: 400 | 600 | 700;
  align?: 'left' | 'center';
}

/** A paragraph of already-escaped HTML (text with a link in it). */
export function emailParagraphHtml(html: string, { tone = 'body', size = 16, top = 14, weight = 400, align = 'left' }: EmailParagraphOptions = {}): string {
  return `<p class="${TONE_CLASS[tone]}" style="margin:${top}px 0 0;font-family:${EMAIL_FONT};font-size:${size}px;line-height:${LINE_HEIGHT[size]}px;font-weight:${weight};color:${TONE_COLOR[tone]};${align === 'center' ? 'text-align:center;' : ''}">${html}</p>`;
}

/** A paragraph of plain text. */
export function emailParagraph(text: string, options?: EmailParagraphOptions): string {
  return emailParagraphHtml(esc(text), options);
}

/** A link inside running text: underlined, in the brand color. */
export function emailTextLink(href: string, label: string): string {
  return `<a class="link" href="${esc(href)}" target="_blank" style="color:${EMAIL_COLORS.primary};text-decoration:underline;">${esc(label)}</a>`;
}

/**
 * A one-time code, large, spaced and selectable with one tap (`user-select: all`), with its caption ("Works for 10
 * minutes, once") under it.
 */
export function emailCode(code: string, caption: string, { top = 26 }: { top?: number } = {}): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:${top}px;"><tr>`
    + `<td class="code-box" align="center" bgcolor="${EMAIL_COLORS.softOrange}" style="padding:26px 16px 22px;border-radius:20px;background-color:${EMAIL_COLORS.softOrange};border:1px solid ${EMAIL_COLORS.softOrangeBorder};">`
    + `<div class="code ink" style="font-family:${MONO_FONT};font-size:42px;line-height:50px;font-weight:700;letter-spacing:12px;padding-left:12px;color:${EMAIL_COLORS.ink};-webkit-user-select:all;user-select:all;mso-line-height-rule:exactly;">${esc(code)}</div>`
    + `<div class="muted" style="margin-top:8px;font-family:${EMAIL_FONT};font-size:14px;line-height:20px;font-weight:600;color:${EMAIL_COLORS.muted};">${esc(caption)}</div>`
    + `</td></tr></table>`;
}

/**
 * A boxed aside: `note` (a calm reminder, a violet edge), `warm` (something to be careful with, soft orange), or
 * `quote` (someone's own words: support's reply, a reason).
 */
export function emailCallout(html: string, { tone = 'note', top = 24 }: { tone?: 'note' | 'warm' | 'quote'; top?: number } = {}): string {
  const look = {
    note: { background: EMAIL_COLORS.note, edge: EMAIL_COLORS.violet },
    warm: { background: EMAIL_COLORS.softOrange, edge: EMAIL_COLORS.primary },
    quote: { background: EMAIL_COLORS.note, edge: '#d9cdbd' },
  }[tone];
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:${top}px;"><tr>`
    + `<td class="callout callout-${tone} ink" bgcolor="${look.background}" style="padding:16px 18px;border-radius:4px 14px 14px 4px;background-color:${look.background};border-left:4px solid ${look.edge};font-family:${EMAIL_FONT};font-size:15px;line-height:23px;color:${EMAIL_COLORS.ink};">${html}</td>`
    + `</tr></table>`;
}

/**
 * Facts as label and value rows (a role and who granted it): quiet labels, strong values, a hairline between rows.
 * Values are plain text.
 */
export function emailFacts(rows: readonly { label: string; value: string }[], { top = 24 }: { top?: number } = {}): string {
  const cells = rows
    .map((row, index) => `<tr>`
      + `<td class="muted" valign="top" style="padding:${index === 0 ? 0 : 12}px 16px 12px 0;${index < rows.length - 1 ? `border-bottom:1px solid ${EMAIL_COLORS.border};` : ''}font-family:${EMAIL_FONT};font-size:14px;line-height:21px;color:${EMAIL_COLORS.muted};white-space:nowrap;">${esc(row.label)}</td>`
      + `<td class="ink divider" valign="top" style="padding:${index === 0 ? 0 : 12}px 0 12px;${index < rows.length - 1 ? `border-bottom:1px solid ${EMAIL_COLORS.border};` : ''}font-family:${EMAIL_FONT};font-size:15px;line-height:21px;font-weight:600;color:${EMAIL_COLORS.ink};">${esc(row.value)}</td>`
      + `</tr>`)
    .join('');
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:${top}px;">${cells}</table>`;
}

/** Numbered steps (what happens next): a small number, a title and a line under it. */
export function emailSteps(steps: readonly { title: string; body: string }[], { top = 22 }: { top?: number } = {}): string {
  const rows = steps
    .map((step, index) => `<tr>`
      + `<td width="40" valign="top" style="width:40px;padding:${index === 0 ? 0 : 16}px 0 0;">`
      + `<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td class="step-num ink" width="28" height="28" align="center" valign="middle" bgcolor="${EMAIL_COLORS.note}" style="width:28px;height:28px;border-radius:999px;background-color:${EMAIL_COLORS.note};font-family:${EMAIL_FONT};font-size:13px;line-height:28px;font-weight:700;color:${EMAIL_COLORS.ink};mso-line-height-rule:exactly;">${index + 1}</td></tr></table>`
      + `</td>`
      + `<td valign="top" style="padding:${index === 0 ? 0 : 16}px 0 0;">`
      + `<p class="ink" style="margin:3px 0 0;font-family:${EMAIL_FONT};font-size:16px;line-height:22px;font-weight:700;color:${EMAIL_COLORS.ink};">${esc(step.title)}</p>`
      + `<p class="muted" style="margin:2px 0 0;font-family:${EMAIL_FONT};font-size:14px;line-height:21px;color:${EMAIL_COLORS.muted};">${esc(step.body)}</p>`
      + `</td></tr>`)
    .join('');
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:${top}px;">${rows}</table>`;
}

/** A thin rule between parts of the card. */
export function emailDivider({ top = 28, bottom = 0 }: { top?: number; bottom?: number } = {}): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:${top}px 0 ${bottom}px;"><tr><td class="divider" style="height:1px;line-height:1px;font-size:1px;border-top:1px solid ${EMAIL_COLORS.border};">&nbsp;</td></tr></table>`;
}

/** The sign-off at the end of a letter-like email: a line, then who it's from. */
export function emailSignoff(closing: string, from: string, { top = 28 }: { top?: number } = {}): string {
  return emailParagraph(closing, { tone: 'body', top }) + emailParagraph(from, { tone: 'ink', top: 2, weight: 700 });
}

/** A link in the footer, quiet and underlined. */
export function emailFooterLink(href: string, label: string): string {
  return `<a class="footer-link" href="${esc(href)}" target="_blank" style="color:${EMAIL_COLORS.muted};text-decoration:underline;">${esc(label)}</a>`;
}

/** The footer's lines (each already HTML) as paragraphs; empty lines are left out. */
export function emailFooter(lines: readonly string[]): string {
  return lines.filter(Boolean).map((line, index) => `<p style="margin:${index === 0 ? 0 : 8}px 0 0;">${line}</p>`).join('');
}

/** Footer links on one line, separated by dots. */
export function emailFooterLinks(links: readonly string[]): string {
  return links.filter(Boolean).join(' &nbsp;&middot;&nbsp; ');
}

export interface EmailLayoutInput {
  /** The document title (shown by some apps, and the name of the email's region for screen readers). */
  title: string;
  /** The preview line inbox lists show after the subject. */
  preheader: string;
  /** The app's address, for the icon's absolute URL. */
  appUrl: string;
  /** Rows of the main card (each a `<tr>`; build them with `emailSection`). */
  body: string;
  /** Lines under the card: why they got it, links (already HTML; `emailFooter`). */
  footer: string;
  /** Extra CSS for this email's own pieces. */
  css?: string;
  /** The language it's written in (the recipient's), for mail apps and screen readers. */
  lang?: AppLocale;
}

/**
 * Three style blocks, so a mail app that can't read one (Gmail drops a whole block it can't parse) keeps the others: the
 * base and phone rules, dark mode, and Outlook.com's recolor hooks. Everything also has inline styles, for the apps
 * that read no style block at all.
 */
const BASE_CSS = `
  body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
  body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
  a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; font-size: inherit !important; font-family: inherit !important; font-weight: inherit !important; line-height: inherit !important; }
  u + #body a { color: inherit; text-decoration: none; font-size: inherit; font-family: inherit; font-weight: inherit; line-height: inherit; }
  .btn-cell { transition: background-color 160ms ease, box-shadow 160ms ease; }
  .btn-primary:hover { background-color: ${EMAIL_COLORS.primaryHover} !important; border-color: ${EMAIL_COLORS.primaryHover} !important; box-shadow: 0 10px 24px -14px rgba(193, 63, 18, 0.75); }
  .btn-dark:hover { background-color: #2c241d !important; }
  .link:hover, .footer-link:hover { text-decoration: none !important; }
  @media (max-width: 620px) {
    .outer { padding: 20px 10px 32px !important; }
    .pad { padding-left: 24px !important; padding-right: 24px !important; }
    .h1-title { font-size: 26px !important; line-height: 32px !important; }
    .h1-sentence { font-size: 22px !important; line-height: 29px !important; }
    .btn-table { width: 100% !important; }
    .btn-link { display: block !important; text-align: center !important; }
    .code { font-size: 34px !important; line-height: 42px !important; letter-spacing: 8px !important; padding-left: 8px !important; }
    .footer { padding-left: 24px !important; padding-right: 24px !important; }
  }
`;

const DARK_CSS = `
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  @media (prefers-color-scheme: dark) {
    .bg-page { background-color: ${DARK.page} !important; }
    .card { background-color: ${DARK.card} !important; border-color: ${DARK.border} !important; }
    .ink { color: ${DARK.ink} !important; }
    .body-text { color: ${DARK.body} !important; }
    .muted, .footer, .footer-link { color: ${DARK.muted} !important; }
    .eyebrow, .link { color: ${DARK.primary} !important; }
    .divider { border-color: ${DARK.border} !important; }
    .code-box, .callout-warm { background-color: ${DARK.softOrange} !important; border-color: ${DARK.softOrangeBorder} !important; }
    .callout-warm { border-left-color: ${DARK.primary} !important; }
    .callout-note, .callout-quote, .step-num { background-color: ${DARK.note} !important; }
    .callout-quote { border-left-color: #4a3f35 !important; }
    .btn-dark { background-color: ${DARK.ink} !important; border-color: ${DARK.ink} !important; }
    .btn-link-dark { color: ${EMAIL_COLORS.ink} !important; }
    .btn-light { background-color: ${DARK.card} !important; border-color: ${DARK.border} !important; }
    .btn-link-light { color: ${DARK.ink} !important; }
    .wordmark-ink { color: ${DARK.ink} !important; }
  }
`;

const OUTLOOK_DARK_CSS = `
  [data-ogsb] .bg-page { background-color: ${DARK.page} !important; }
  [data-ogsb] .card { background-color: ${DARK.card} !important; border-color: ${DARK.border} !important; }
  [data-ogsb] .code-box, [data-ogsb] .callout-warm { background-color: ${DARK.softOrange} !important; }
  [data-ogsb] .callout-note, [data-ogsb] .callout-quote, [data-ogsb] .step-num { background-color: ${DARK.note} !important; }
  [data-ogsb] .btn-dark { background-color: ${DARK.ink} !important; }
  [data-ogsc] .ink, [data-ogsc] .wordmark-ink { color: ${DARK.ink} !important; }
  [data-ogsc] .body-text { color: ${DARK.body} !important; }
  [data-ogsc] .muted, [data-ogsc] .footer, [data-ogsc] .footer-link { color: ${DARK.muted} !important; }
  [data-ogsc] .eyebrow, [data-ogsc] .link { color: ${DARK.primary} !important; }
  [data-ogsc] .btn-link-dark { color: ${EMAIL_COLORS.ink} !important; }
`;

/**
 * The whole document: the page color, the brand (the app icon and the text wordmark), one card with the body rows, and
 * the footer under it.
 */
export function emailLayout({ title, preheader, appUrl, body, footer, css = '', lang = 'en' }: EmailLayoutInput): string {
  const icon = `${appUrl.replace(/\/+$/, '')}${EMAIL_ICON_PATH}`;
  // Spacer after the preheader, so inbox previews don't run on into the body text.
  const spacer = '&#8199;&#65279;&#847; '.repeat(40);
  const wordmark = `<span class="wordmark-ink" style="color:${EMAIL_COLORS.ink};">tasks</span><span style="color:${EMAIL_COLORS.pink};">near</span><span class="wordmark-ink" style="color:${EMAIL_COLORS.ink};">me</span>`;
  return `<!doctype html>
<html lang="${lang}" dir="ltr" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(title)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<!--[if mso]><style>table, td, div, h1, p, a, span { font-family: 'Segoe UI', Arial, sans-serif !important; }</style><![endif]-->
<style>${BASE_CSS}${css}</style>
<style>${DARK_CSS}</style>
<style>${OUTLOOK_DARK_CSS}</style>
</head>
<body id="body" class="bg-page" style="margin:0;padding:0;word-spacing:normal;background-color:${EMAIL_COLORS.page};">
<div role="article" aria-roledescription="email" aria-label="${esc(title)}" lang="${lang}" dir="ltr" style="font-size:16px;">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${EMAIL_COLORS.page};">${esc(preheader)}${spacer}</div>
<table role="presentation" class="bg-page" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${EMAIL_COLORS.page}" style="background-color:${EMAIL_COLORS.page};">
<tr><td class="outer" align="center" style="padding:32px 16px 44px;">
<!--[if mso]><table role="presentation" align="center" width="600" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
<table role="presentation" class="container" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;margin:0 auto;">
<tr><td style="padding:0 6px 20px;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
<td style="padding-right:10px;vertical-align:middle;"><img src="${esc(icon)}" width="32" height="32" alt="TasksNearMe" style="display:block;width:32px;height:32px;border:0;border-radius:9px;"></td>
<td aria-hidden="true" style="vertical-align:middle;font-family:${EMAIL_DISPLAY_FONT};font-size:23px;line-height:28px;font-weight:800;letter-spacing:-0.5px;mso-line-height-rule:exactly;">${wordmark}</td>
</tr></table>
</td></tr>
<tr><td class="card" bgcolor="${EMAIL_COLORS.card}" style="background-color:${EMAIL_COLORS.card};border:1px solid ${EMAIL_COLORS.border};border-radius:24px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${body}</table>
</td></tr>
${footer ? `<tr><td class="footer muted" style="padding:22px 40px 0;font-family:${EMAIL_FONT};font-size:13px;line-height:20px;color:${EMAIL_COLORS.muted};">${footer}</td></tr>` : ''}
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</div>
</body>
</html>`;
}
