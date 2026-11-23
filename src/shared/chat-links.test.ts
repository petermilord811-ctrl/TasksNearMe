import { describe, expect, it } from 'vitest';
import { chatViewHref, chatViewOfHref, directChatTargetKey, directChatTargetOf } from './chat-links';

const origin = 'https://tasksnearme.com';

describe('chat window links', () => {
  it('opens conversations and Help, in any language', () => {
    expect(chatViewOfHref('/app/messages/thr_1', origin)).toEqual({ kind: 'thread', threadId: 'thr_1' });
    expect(chatViewOfHref('/es/app/messages/thr_1/', origin)).toEqual({ kind: 'thread', threadId: 'thr_1' });
    expect(chatViewOfHref(`${origin}/app/messages/help`, origin)).toEqual({ kind: 'help' });
    expect(chatViewOfHref('/app/messages/thr_1#latest', origin)).toEqual({ kind: 'thread', threadId: 'thr_1' });
  });

  it('opens New message there too, with the person a profile’s or a post’s Message names (2026-11-23)', () => {
    expect(chatViewOfHref('/app/messages/new', origin)).toEqual({ kind: 'new' });
    expect(chatViewOfHref('/es/app/messages/new?to=usr_sam', origin)).toEqual({ kind: 'new', to: { userId: 'usr_sam' } });
    expect(chatViewOfHref('/app/messages/new?helper=jordan-t', origin)).toEqual({ kind: 'new', to: { helper: 'jordan-t' } });
    expect(chatViewOfHref('/app/messages/new?u=%40Minh', origin)).toEqual({ kind: 'new', to: { username: '@Minh' } });
    // Blank or too long names nobody: the box asks.
    expect(chatViewOfHref('/app/messages/new?u=%20', origin)).toEqual({ kind: 'new' });
    expect(chatViewOfHref(`/app/messages/new?to=${'x'.repeat(81)}`, origin)).toEqual({ kind: 'new' });
  });

  it('leaves other links to their pages', () => {
    expect(chatViewOfHref('/app/messages', origin)).toBeNull();
    expect(chatViewOfHref('/app/messages/thr_1?from=msg_9', origin)).toBeNull();
    expect(chatViewOfHref('/app/messages/thr_1/extra', origin)).toBeNull();
    expect(chatViewOfHref('/app/messages/new/extra', origin)).toBeNull();
    expect(chatViewOfHref('https://example.com/app/messages/thr_1', origin)).toBeNull();
    expect(chatViewOfHref('https://example.com/app/messages/new?to=usr_sam', origin)).toBeNull();
    expect(chatViewOfHref('/app/bookings/bkg_1', origin)).toBeNull();
  });

  it('knows each view’s own page', () => {
    expect(chatViewHref({ kind: 'list' })).toBe('/app/messages');
    expect(chatViewHref({ kind: 'help' })).toBe('/app/messages/help');
    expect(chatViewHref({ kind: 'thread', threadId: 'thr_1' })).toBe('/app/messages/thr_1');
    expect(chatViewHref({ kind: 'new' })).toBe('/app/messages/new');
    expect(chatViewHref({ kind: 'new', to: { username: 'minh' } })).toBe('/app/messages/new?u=minh');
    expect(chatViewHref({ kind: 'new', to: { helper: 'jordan-t' } })).toBe('/app/messages/new?helper=jordan-t');
  });
});

describe('who a New message link names', () => {
  it('reads a handle, then an account id, then an @username, from a URL or a page’s params', () => {
    expect(directChatTargetOf(new URLSearchParams('helper=jordan-t&to=usr_sam'))).toEqual({ helper: 'jordan-t' });
    expect(directChatTargetOf(new URLSearchParams('to=usr_sam&u=sam'))).toEqual({ userId: 'usr_sam' });
    expect(directChatTargetOf({ u: [' minh ', 'other'] })).toEqual({ username: 'minh' });
    expect(directChatTargetOf({})).toBeNull();
    expect(directChatTargetOf({ u: '' })).toBeNull();
  });

  it('keys the same person the same way, whatever the case of an @username', () => {
    expect(directChatTargetKey({ username: 'Minh' })).toBe(directChatTargetKey({ username: 'minh' }));
    expect(directChatTargetKey({ userId: 'usr_1' })).not.toBe(directChatTargetKey({ helper: 'usr_1' }));
  });
});
