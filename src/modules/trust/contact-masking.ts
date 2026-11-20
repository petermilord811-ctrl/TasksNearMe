/**
 * Contact details are hidden before a booking is confirmed (blueprint 01 §5, 06 §2): in public
 * task text and in pre-booking messages. Masking is best-effort; it removes the common ways to
 * write emails, phone numbers, and links.
 */

export const MASK = '[hidden]';

/** What a pattern finds: messages mask emails and phones (src/contracts/messaging.ts); task text also hides links. */
export type ContactDetail = 'email' | 'link' | 'phone';

/**
 * These patterns also live in Postgres: contact-masking-sql.ts ports them for `tasks.search_text`, the generated column
 * task search reads (migration 0066, redefined in 0068). Change one here and the same change needs a migration that
 * redefines that column; tests/integration/task-search-masking.test.ts fails until the two agree.
 *
 * They run on the text's NFKC form, so full-width or styled digits (３５２, 𝟑𝟓𝟐) count as digits, while what's kept
 * is the text as written (a Spanish "1º" stays). Phones are bounded by other digits, not by words, so a number run into
 * a word ("is3525550101") or written with its country code ("+13525550101") is found too; a longer run of digits
 * (a 12-digit tracking number) isn't a phone. Security review and sweep MN4, 2026-11-20.
 */
export const CONTACT_PATTERNS: readonly { detail: ContactDetail; pattern: RegExp }[] = [
  // Emails, including "name at domain dot com", "name (at) domain (dot) com" and "name at domain.com".
  { detail: 'email', pattern: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gi },
  {
    detail: 'email',
    pattern: /\b[\w.+-]+\s*(?:\(|\[)?\s*at\s*(?:\)|\])?\s*[\w-]+(?:\s*(?:\(|\[)?\s*dot\s*(?:\)|\])?\s*|\.)(?:com|net|org|edu|io|co)\b/gi,
  },
  // Links.
  { detail: 'link', pattern: /\bhttps?:\/\/\S+/gi },
  { detail: 'link', pattern: /\bwww\.\S+/gi },
  { detail: 'link', pattern: /\b[\w-]+\.(?:com|net|org|io|co|me|app)(?:\/\S*)?\b/gi },
  // Phone numbers: any country's in E.164 (+447700900123), and US numbers, 10 digits with common separators
  // (352-555-0101, (352) 555 0101, 352/555/0101, 352 555 01 01), with an optional +1 or 1.
  { detail: 'phone', pattern: /\+[1-9]\d{7,14}(?!\d)/g },
  { detail: 'phone', pattern: /(?<!\d)(?:\+?1[\s./-]*)?\(?\d{3}\)?[\s./-]*\d{3}[\s./-]*\d{2}[\s./-]?\d{2}(?!\d)/g },
];

/** Where a contact detail is in the text as written, and what it reads as (NFKC: its digits as 0-9). */
export interface ContactDetailMatch {
  start: number;
  end: number;
  detail: ContactDetail;
  /** The match in NFKC form, e.g. for a phone's last 4 digits. */
  folded: string;
}

/**
 * The text in NFKC form, character by character, with the span of the original each folded character came from: a
 * match in the folded text is replaced in the original, so nothing else the person wrote changes.
 */
function fold(text: string): { folded: string; from: number[]; to: number[] } {
  let folded = '';
  const from: number[] = [];
  const to: number[] = [];
  let index = 0;
  for (const char of text) {
    const normal = char.normalize('NFKC');
    for (let k = 0; k < normal.length; k += 1) {
      from.push(index);
      to.push(index + char.length);
    }
    folded += normal;
    index += char.length;
  }
  return { folded, from, to };
}

/**
 * Every contact detail in `text` (only `details`, if given), earliest first. Overlapping matches merge into one that
 * covers both, under the earlier one's kind, so no part of either shows; touching ones stay apart, as Postgres's
 * replacements one pattern after another leave them.
 */
export function findContactDetails(text: string, details?: readonly ContactDetail[]): ContactDetailMatch[] {
  if (text === '') return [];
  const { folded, from, to } = fold(text);
  /** Spans in the folded text; folded and original positions rise together, so a union in one is a union in both. */
  const found: { at: number; until: number; detail: ContactDetail }[] = [];
  for (const { detail, pattern } of CONTACT_PATTERNS) {
    if (details && !details.includes(detail)) continue;
    for (const m of folded.matchAll(pattern)) {
      if (m[0].length > 0) found.push({ at: m.index, until: m.index + m[0].length, detail });
    }
  }
  found.sort((a, b) => a.at - b.at || b.until - a.until);
  const merged: typeof found = [];
  for (const span of found) {
    const last = merged[merged.length - 1];
    if (last && from[span.at]! < to[last.until - 1]!) last.until = Math.max(last.until, span.until);
    else merged.push({ ...span });
  }
  return merged.map(({ at, until, detail }) => ({ start: from[at]!, end: to[until - 1]!, detail, folded: folded.slice(at, until) }));
}

export function maskContactDetails(text: string): { text: string; masked: boolean } {
  const matches = findContactDetails(text);
  if (matches.length === 0) return { text, masked: false };
  let result = '';
  let cursor = 0;
  for (const match of matches) {
    result += text.slice(cursor, match.start) + MASK;
    cursor = match.end;
  }
  return { text: result + text.slice(cursor), masked: true };
}

/** The public excerpt of a task description: contact details hidden, about two lines long. */
export function publicExcerpt(description: string, maxLength = 160): string {
  const { text } = maskContactDetails(description.replace(/\s+/g, ' ').trim());
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:!?-]+$/, '')}…`;
}

/** Whole-word, case-insensitive phrase match for prohibited-task keywords. */
export function findProhibitedPhrase(text: string, phrases: readonly string[]): string | null {
  const haystack = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  for (const phrase of phrases) {
    const needle = ` ${phrase.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
    if (needle.trim() && haystack.includes(needle)) return phrase;
  }
  return null;
}
