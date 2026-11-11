import type { MessageSegment } from '@/contracts';

/** Jordan's pre-booking message with a phone number, as the app delivers it (masked). */
export const maskedPhoneMessage: MessageSegment[] = [
  { kind: 'text', text: 'Happy to help! Text me at ' },
  { kind: 'masked', detail: 'phone', hint: '0134' },
  { kind: 'text', text: ' if that’s easier.' },
];

/** A message with an email address, masked. */
export const maskedEmailMessage: MessageSegment[] = [
  { kind: 'text', text: 'You can also email me at ' },
  { kind: 'masked', detail: 'email' },
  { kind: 'text', text: '.' },
];

/** After the booking is confirmed, nothing is masked. */
export const unmaskedMessage: MessageSegment[] = [{ kind: 'text', text: 'See you Saturday at 10:30!' }];
