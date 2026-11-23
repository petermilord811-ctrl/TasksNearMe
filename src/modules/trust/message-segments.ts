import type { MentionSegment, MessageSegment } from '@/contracts';
import { findContactDetails, MASK } from './contact-masking';

/**
 * Message text → segments for the UI (src/contracts/messaging.ts). Before a booking is confirmed,
 * phone numbers, email addresses, links and payment or social usernames become masked segments (a phone keeps its last 4
 * digits as a hint); afterwards the text is shown as written. Links were readable before a booking until the abuse
 * rehearsal (J-AB2): that's how a phishing page or a payment request arrives. tasksnearme.com's own stay readable.
 */

/** Where a quote or preview is cut: its first 157 characters and "…", for anything longer than 160. */
export const QUOTE_LENGTH = 160;

/** The people "@name"s in a text may be: lowercase @usernames, without "@", to the person (`mentionedUsernames`). */
export type Mentions = ReadonlyMap<string, Omit<MentionSegment, 'kind'>>;

/** "@name" as the patterns find it ("@Minh"), as usernames are kept: lowercase, without "@". */
const usernameOf = (folded: string) => folded.slice(1).toLowerCase();

/**
 * The @usernames a text may name (2026-11-23): every "@name" the handle pattern finds, lowercase, without "@". The app
 * looks them up once for a whole conversation (`mentionsOf` in messaging) and passes what it found to `toMessageSegments`.
 */
export function mentionedUsernames(text: string): string[] {
  return findContactDetails(text, ['handle']).map((match) => usernameOf(match.folded));
}

/**
 * `mentions`: TasksNearMe @usernames found in the text, which show as the person (`MentionSegment`), masked or not (2026-11-23).
 * Any other "@name" is a payment or social handle: hidden before a booking, as written after.
 */
export function toMessageSegments(text: string, options: { mask: boolean; mentions?: Mentions }): MessageSegment[] {
  if (text === '') return [];
  const mentions = options.mentions;
  if (!options.mask && !mentions?.size) return [{ kind: 'text', text }];

  // The same patterns as task text (contact-masking.ts); unmasked, only "@name"s, for the people among them.
  const segments: MessageSegment[] = [];
  let cursor = 0;
  for (const match of findContactDetails(text, options.mask ? undefined : ['handle'])) {
    const person = match.detail === 'handle' ? mentions?.get(usernameOf(match.folded)) : undefined;
    if (!person && !options.mask) continue;
    if (match.start > cursor) segments.push({ kind: 'text', text: text.slice(cursor, match.start) });
    const digits = match.folded.replace(/\D/g, '');
    segments.push(person ? { kind: 'mention', ...person } : match.detail === 'phone' && digits.length >= 4 ? { kind: 'masked', detail: 'phone', hint: digits.slice(-4) } : { kind: 'masked', detail: match.detail });
    cursor = match.end;
  }
  if (cursor < text.length) segments.push({ kind: 'text', text: text.slice(cursor) });
  // Consecutive text pieces (an unmasked handle kept as written) read as one.
  return segments.reduce<MessageSegment[]>((out, segment) => {
    const last = out[out.length - 1];
    if (segment.kind === 'text' && last?.kind === 'text') out[out.length - 1] = { kind: 'text', text: last.text + segment.text };
    else out.push(segment);
    return out;
  }, []);
}

/** How long a segment reads: a masked detail as "[hidden]", a person as "@" and their name. */
function lengthOf(segment: MessageSegment): number {
  return segment.kind === 'text' ? segment.text.length : segment.kind === 'mention' ? segment.name.length + 1 : MASK.length;
}

/**
 * Segments cut to `maxLength` characters with "…", a masked detail counting as "[hidden]". Cut after masking, so a
 * phone number at the cut never shows its first digits (sweep MN4): a masked detail that doesn't fit is left out whole.
 */
export function shortenSegments(segments: MessageSegment[], maxLength = QUOTE_LENGTH): MessageSegment[] {
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
