import type { MessageSegment } from '@/contracts';

/**
 * Message text → segments for the UI (src/contracts/messaging.ts). Before a booking is confirmed,
 * phone numbers and email addresses become masked segments (a phone keeps its last 4 digits as a
 * hint); afterwards the text is shown as written.
 */

const PATTERNS: { detail: 'phone' | 'email'; pattern: RegExp }[] = [
  { detail: 'email', pattern: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gi },
  {
    detail: 'email',
    pattern: /\b[\w.+-]+\s*[([]?\s*at\s*[)\]]?\s*[\w-]+\s*[([]?\s*dot\s*[)\]]?\s*(?:com|net|org|edu|io|co)\b/gi,
  },
  { detail: 'phone', pattern: /(?:\+?1[\s.-]*)?\(?\b\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{4}\b/g },
];

interface Match {
  start: number;
  end: number;
  detail: 'phone' | 'email';
  text: string;
}

export function toMessageSegments(text: string, options: { mask: boolean }): MessageSegment[] {
  if (!options.mask || text === '') return text === '' ? [] : [{ kind: 'text', text }];

  const matches: Match[] = [];
  for (const { detail, pattern } of PATTERNS) {
    for (const m of text.matchAll(pattern)) {
      const start = m.index ?? 0;
      matches.push({ start, end: start + m[0].length, detail, text: m[0] });
    }
  }
  // Earliest first; when two overlap, keep the longer one.
  matches.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: Match[] = [];
  for (const match of matches) {
    const last = kept[kept.length - 1];
    if (!last || match.start >= last.end) kept.push(match);
  }

  const segments: MessageSegment[] = [];
  let cursor = 0;
  for (const match of kept) {
    if (match.start > cursor) segments.push({ kind: 'text', text: text.slice(cursor, match.start) });
    const digits = match.text.replace(/\D/g, '');
    segments.push(
      match.detail === 'phone' && digits.length >= 4
        ? { kind: 'masked', detail: 'phone', hint: digits.slice(-4) }
        : { kind: 'masked', detail: match.detail },
    );
    cursor = match.end;
  }
  if (cursor < text.length) segments.push({ kind: 'text', text: text.slice(cursor) });
  return segments;
}
