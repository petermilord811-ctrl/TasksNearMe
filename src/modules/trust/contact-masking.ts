/**
 * Contact details are hidden before a booking is confirmed (blueprint 01 §5, 06 §2): in public
 * task text and in pre-booking messages. Masking is best-effort; it removes the common ways to
 * write emails, phone numbers, and links.
 */

export const MASK = '[hidden]';

const PATTERNS: RegExp[] = [
  // Emails, including "name at domain dot com".
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gi,
  /\b[\w.+-]+\s*(?:\(|\[)?\s*at\s*(?:\)|\])?\s*[\w-]+\s*(?:\(|\[)?\s*dot\s*(?:\)|\])?\s*(?:com|net|org|edu|io|co)\b/gi,
  // Links.
  /\bhttps?:\/\/\S+/gi,
  /\bwww\.\S+/gi,
  /\b[\w-]+\.(?:com|net|org|io|co|me|app)(?:\/\S*)?\b/gi,
  // US phone numbers: 10 digits with common separators, optional +1.
  /(?:\+?1[\s.-]*)?\(?\b\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{4}\b/g,
];

export function maskContactDetails(text: string): { text: string; masked: boolean } {
  let masked = false;
  let result = text;
  for (const pattern of PATTERNS) {
    result = result.replace(pattern, () => {
      masked = true;
      return MASK;
    });
  }
  return { text: result, masked };
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
