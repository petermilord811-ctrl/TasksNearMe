import { describe, expect, it } from 'vitest';
import { chatViewHref, chatViewOfHref } from './chat-links';

const origin = 'https://tasksnearme.com';

describe('chat window links', () => {
  it('opens conversations and Help, in any language', () => {
    expect(chatViewOfHref('/app/messages/thr_1', origin)).toEqual({ kind: 'thread', threadId: 'thr_1' });
    expect(chatViewOfHref('/es/app/messages/thr_1/', origin)).toEqual({ kind: 'thread', threadId: 'thr_1' });
    expect(chatViewOfHref(`${origin}/app/messages/help`, origin)).toEqual({ kind: 'help' });
    expect(chatViewOfHref('/app/messages/thr_1#latest', origin)).toEqual({ kind: 'thread', threadId: 'thr_1' });
  });

  it('leaves other links to their pages', () => {
    expect(chatViewOfHref('/app/messages', origin)).toBeNull();
    expect(chatViewOfHref('/app/messages/new?to=usr_sam', origin)).toBeNull();
    expect(chatViewOfHref('/app/messages/thr_1?from=msg_9', origin)).toBeNull();
    expect(chatViewOfHref('/app/messages/thr_1/extra', origin)).toBeNull();
    expect(chatViewOfHref('https://example.com/app/messages/thr_1', origin)).toBeNull();
    expect(chatViewOfHref('/app/bookings/bkg_1', origin)).toBeNull();
  });

  it('knows each view’s own page', () => {
    expect(chatViewHref({ kind: 'list' })).toBe('/app/messages');
    expect(chatViewHref({ kind: 'help' })).toBe('/app/messages/help');
    expect(chatViewHref({ kind: 'thread', threadId: 'thr_1' })).toBe('/app/messages/thr_1');
  });
});
