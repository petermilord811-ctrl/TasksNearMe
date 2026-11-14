import { describe, expect, it } from 'vitest';
import { liveStateOf } from './board';

describe('a task’s live state on the board', () => {
  it('is open only while it takes offers and isn’t hidden', () => {
    expect(liveStateOf({ status: 'open', hiddenAt: null })).toBe('open');
    expect(liveStateOf({ status: 'open', hiddenAt: new Date() })).toBe('closed');
  });

  it('says booked once a helper is booked, and closed for the other ends', () => {
    expect(liveStateOf({ status: 'assigned', hiddenAt: null })).toBe('booked');
    expect(liveStateOf({ status: 'completed', hiddenAt: null })).toBe('booked');
    expect(liveStateOf({ status: 'canceled', hiddenAt: null })).toBe('closed');
    expect(liveStateOf({ status: 'expired', hiddenAt: null })).toBe('closed');
  });
});
