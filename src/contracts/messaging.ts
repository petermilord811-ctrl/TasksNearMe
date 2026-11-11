/**
 * Message text arrives already split into segments. Contact details are detected and masked by the
 * app before a booking is confirmed; the UI only renders segments (MaskedText) and never re-detects.
 */
export type MessageSegment =
  | { kind: 'text'; text: string }
  | {
      kind: 'masked';
      detail: 'phone' | 'email';
      /** Safe hint the UI may show, e.g. last 4 digits of a phone number ("0134"). */
      hint?: string;
    };
