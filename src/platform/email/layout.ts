import { DEFAULT_LOCALE, type AppLocale } from '@/contracts/locale';
import { localizedPath } from '@/shared/locale';
/**
 * TasksNearMe's email layout: plain tables and inline styles, so it reads the same in Gmail, Apple Mail and
 * Outlook. Hover effects, dark mode and small animations sit in the <style> block for the apps that support
 * them; everywhere else the inline styles carry the design. Every value put into HTML goes through `esc`.
 */

export const EMAIL_COLORS = {
  page: '#fbf7f2',
  card: '#ffffff',
  ink: '#17120e',
  muted: '#6a6158',
  border: '#e9e0d4',
  primary: '#c13f12',
  violet: '#6d4ef5',
  success: '#217a46',
  softOrange: '#ffebdd',
} as const;

export const EMAIL_FONT = "'DM Sans', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
export const EMAIL_DISPLAY_FONT = "'Bricolage Grotesque', 'DM Sans', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

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

/** A link that survives every email app: a table cell with the color, the link inside it. */
export function emailButton({ href, label, variant = 'primary', arrow = true }: { href: string; label: string; variant?: 'primary' | 'light' | 'dark'; arrow?: boolean }): string {
  const look = {
    primary: { background: EMAIL_COLORS.primary, color: '#ffffff', border: EMAIL_COLORS.primary },
    dark: { background: EMAIL_COLORS.ink, color: '#ffffff', border: EMAIL_COLORS.ink },
    light: { background: '#ffffff', color: EMAIL_COLORS.ink, border: '#ffffff' },
  }[variant];
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:separate;"><tr><td class="btn-cell btn-${variant}" style="border-radius:999px;background:${look.background};border:1px solid ${look.border};">`
    + `<a class="btn" href="${esc(href)}" target="_blank" style="display:inline-block;padding:14px 26px;font-family:${EMAIL_FONT};font-size:16px;line-height:20px;font-weight:700;color:${look.color};text-decoration:none;border-radius:999px;">${esc(label)}${arrow ? '&nbsp;&rarr;' : ''}</a>`
    + `</td></tr></table>`;
}

export interface EmailLayoutInput {
  /** The document title (shown by some apps). */
  title: string;
  /** The preview line inbox lists show after the subject. */
  preheader: string;
  /** The app's address, for the logo link. */
  appUrl: string;
  /** Rows of the main card (each a `<tr>`). */
  body: string;
  /** Lines under the card: why they got it, links (already HTML). */
  footer: string;
  /** Extra CSS for this email's own pieces. */
  css?: string;
  /** The language it's written in (the recipient's), for mail apps and screen readers. */
  lang?: AppLocale;
}

const BASE_CSS = `
  body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
  a { color: ${EMAIL_COLORS.primary}; }
  .btn-cell { transition: transform 160ms ease, box-shadow 160ms ease; }
  .btn-cell:hover { transform: translateY(-1px); box-shadow: 0 10px 24px -12px rgba(193, 63, 18, 0.7); }
  .btn-primary:hover { background: #a93610 !important; }
  .link:hover { text-decoration: underline !important; }
  @media (max-width: 620px) {
    .container { width: 100% !important; }
    .card-pad { padding: 28px 22px !important; }
    .h1 { font-size: 30px !important; line-height: 36px !important; }
  }
  @media (prefers-color-scheme: dark) {
    .bg-page { background: #0f0d0b !important; }
    .bg-card { background: #181511 !important; border-color: #2e2822 !important; }
    .ink { color: #f7f1ea !important; }
    .muted { color: #b8aea2 !important; }
    .rule { border-color: #2e2822 !important; background: #3a332c !important; }
    .btn-light { background: #f7f1ea !important; }
    .btn-dark { background: #f7f1ea !important; border-color: #f7f1ea !important; }
    .btn-dark .btn { color: #17120e !important; }
  }
`;

/** The whole document: the page color, the logo, one card with the body rows, and the footer. */
export function emailLayout({ title, preheader, appUrl, body, footer, css = '', lang = 'en' }: EmailLayoutInput): string {
  // The logo opens the home page in the reader's language, like every other link (sweep MN12, messages pass J-M1).
  const home = lang === DEFAULT_LOCALE ? appUrl : `${appUrl.replace(/\/+$/, '')}${localizedPath('/', lang)}`;
  // Spacer after the preheader, so inbox previews don't run on into the body text.
  const spacer = '&#8204;&nbsp;'.repeat(60);
  return `<!doctype html>
<html lang="${lang}" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(title)}</title>
<style>${BASE_CSS}${css}</style>
</head>
<body class="bg-page" style="margin:0;padding:0;background:${EMAIL_COLORS.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(preheader)}${spacer}</div>
<table role="presentation" class="bg-page" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${EMAIL_COLORS.page};">
<tr><td align="center" style="padding:28px 12px 40px;">
<table role="presentation" class="container" width="600" cellspacing="0" cellpadding="0" border="0" style="width:600px;max-width:600px;">
<tr><td style="padding:0 8px 18px;">
<a href="${esc(home)}" target="_blank" style="text-decoration:none;font-family:${EMAIL_DISPLAY_FONT};font-size:24px;line-height:28px;font-weight:800;letter-spacing:-0.5px;">`
    + `<img src="${esc(appUrl.replace(/\/+$/, '') + EMAIL_ICON_PATH)}" width="34" height="34" alt="TasksNearMe" style="display:inline-block;width:34px;height:34px;margin-right:9px;border:0;border-radius:10px;vertical-align:middle;">`
    + `<span class="ink" style="color:${EMAIL_COLORS.ink};vertical-align:middle;">tasks</span><span style="color:#e5508a;vertical-align:middle;">near</span><span class="ink" style="color:${EMAIL_COLORS.ink};vertical-align:middle;">me</span></a>
</td></tr>
<tr><td class="bg-card" style="background:${EMAIL_COLORS.card};border:1px solid ${EMAIL_COLORS.border};border-radius:28px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${body}</table>
</td></tr>
<tr><td class="muted" style="padding:24px 12px 0;font-family:${EMAIL_FONT};font-size:13px;line-height:20px;color:${EMAIL_COLORS.muted};text-align:center;">${footer}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
