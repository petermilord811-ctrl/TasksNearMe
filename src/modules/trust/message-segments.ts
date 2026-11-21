import type { MessageSegment } from '@/contracts';
import { findContactDetails, MASK } from './contact-masking';

/**
 * Message text → segments for the UI (src/contracts/messaging.ts). Before a booking is confirmed,
 * phone numbers, email addresses, links and payment or social usernames become masked segments (a phone keeps its last 4
 * digits as a hint); afterwards the text is shown as written. Links were readable before a booking until the abuse
 * rehearsal (J-AB2): that's how a phishing page or a payment request arrives. tasksnearme.com's own stay readable.
 */

/** Where a quote or preview is cut: its first 157 characters and "…", for anything longer than 160. */
export const QUOTE_LENGTH = 160;

export function toMessageSegments(text: string, options: { mask: boolean }): MessageSegment[] {
  if (!options.mask || text === '') return text === '' ? [] : [{ kind: 'text', text }];

  // The same patterns as task text (contact-masking.ts).
  const segments: MessageSegment[] = [];
  let cursor = 0;
  for (const match of findContactDetails(text)) {
    if (match.start > cursor) segments.push({ kind: 'text', text: text.slice(cursor, match.start) });
    const digits = match.folded.replace(/\D/g, '');
    segments.push(match.detail === 'phone' && digits.length >= 4 ? { kind: 'masked', detail: 'phone', hint: digits.slice(-4) } : { kind: 'masked', detail: match.detail });
    cursor = match.end;
  }
  if (cursor < text.length) segments.push({ kind: 'text', text: text.slice(cursor) });
  return segments;
}

/**
 * Segments cut to `maxLength` characters with "…", a masked detail counting as "[hidden]". Cut after masking, so a
 * phone number at the cut never shows its first digits (sweep MN4): a masked detail that doesn't fit is left out whole.
 */
export function shortenSegments(segments: MessageSegment[], maxLength = QUOTE_LENGTH): MessageSegment[] {
  const lengthOf = (segment: MessageSegment) => (segment.kind === 'text' ? segment.text.length : MASK.length);
  if (segments.reduce((sum, segment) => sum + lengthOf(segment), 0) <= maxLength) return segments;
  const room = maxLength - 3;
  const kept: MessageSegment[] = [];
  let used = 0;
  for (const segment of segments) {
    if (used + lengthOf(segment) <= room) {
      kept.push(segment);
      used += lengthOf(segment);
      continue;
    }
    if (segment.kind === 'text' && used < room) kept.push({ kind: 'text', text: segment.text.slice(0, room - used) });
    break;
  }
  const last = kept[kept.length - 1];
  if (last?.kind === 'text') kept[kept.length - 1] = { kind: 'text', text: `${last.text}…` };
  else kept.push({ kind: 'text', text: '…' });
  return kept;
}
