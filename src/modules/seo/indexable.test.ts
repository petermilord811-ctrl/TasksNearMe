import { describe, expect, it } from 'vitest';
import { helperProfileIndexable, marketPagesIndexable } from './indexable';

describe('marketPagesIndexable', () => {
  it('indexes the launch market from the start and any market once it is live', () => {
    expect(marketPagesIndexable({ slug: 'austin', status: 'prelaunch' }, 'austin')).toBe(true);
    expect(marketPagesIndexable({ slug: 'chicago', status: 'live' }, 'austin')).toBe(true);
  });

  it('keeps other prelaunch markets out until they open', () => {
    expect(marketPagesIndexable({ slug: 'chicago', status: 'prelaunch' }, 'austin')).toBe(false);
    expect(marketPagesIndexable({ slug: 'pretty-prairie', status: 'prelaunch' }, 'austin')).toBe(false);
  });
});

describe('helperProfileIndexable', () => {
  it('indexes a profile with a completed task or a published review', () => {
    expect(helperProfileIndexable({ completedCount: 1 })).toBe(true);
    expect(helperProfileIndexable({ completedCount: 0, rating: { count: 2 } })).toBe(true);
  });

  it('keeps an empty profile out', () => {
    expect(helperProfileIndexable({ completedCount: 0 })).toBe(false);
    expect(helperProfileIndexable({ completedCount: 0, rating: { count: 0 } })).toBe(false);
  });
});
