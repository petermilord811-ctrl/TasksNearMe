import { describe, expect, it } from 'vitest';
import { authorRole, communityLimits, helpfulMilestone, initialsOf, isSafetyOrCrimePost, milesBetween, HOT_SECONDS, hotScore, parsePortalQuery, portalSince, postTaskState, searchWords } from './domain';

describe('community rules', () => {
  it('limits accounts in their first week more tightly', () => {
    const now = new Date('2026-11-17T15:00:00.000Z');
    expect(communityLimits(new Date('2026-11-14T15:00:00.000Z'), now).posts.limit).toBe(2);
    expect(communityLimits(new Date('2026-10-01T15:00:00.000Z'), now).posts.limit).toBe(8);
  });

  it('tells the author at 1, 5 and 25 Helpful, once each', () => {
    expect(helpfulMilestone(0, 1)).toBe(1);
    expect(helpfulMilestone(1, 2)).toBeNull();
    expect(helpfulMilestone(4, 5)).toBe(5);
    expect(helpfulMilestone(24, 25)).toBe(25);
    expect(helpfulMilestone(25, 26)).toBeNull();
  });

  it('labels people by what they do here', () => {
    expect(authorRole({ activeHelper: true, hasPostedTask: true })).toBe('helper');
    expect(authorRole({ activeHelper: false, hasPostedTask: true })).toBe('poster');
    expect(authorRole({ activeHelper: false, hasPostedTask: false })).toBe('neighbor');
  });

  it('spots posts about crime or suspicious people, in English and Spanish, and leaves ordinary words alone', () => {
    for (const text of ['Suspicious person on Elm', 'Another break-in last night', 'Porch pirates again', 'Hubo un robo en mi calle', 'Persona sospechosa en el parque']) expect(isSafetyOrCrimePost(text), text).toBe(true);
    for (const text of ['Who can fix my robot vacuum?', 'Recommend a mover for Saturday', 'Is the robotics club open?']) expect(isSafetyOrCrimePost(text), text).toBe(false);
  });

  it('makes initials and measures miles', () => {
    expect(initialsOf('Maya R.')).toBe('MR');
    expect(initialsOf('Lee')).toBe('L');
    expect(milesBetween({ lat: 30.2993, lng: -97.7036 }, { lat: 30.3479, lng: -97.7254 })).toBeCloseTo(3.6, 0);
  });
});

describe('the portal (plan 9.10)', () => {
  it('reads its filters from the address, with defaults, and drops what it does not know', () => {
    expect(parsePortalQuery({})).toEqual({ saved: false, sort: 'hot', view: 'feed', group: 'area', page: 1 });
    expect(parsePortalQuery({ area: 'windsor-park', category: 'yard-cleanup', type: 'task', time: '7d', q: '  leaf   bags ', saved: '1', sort: 'top', view: 'list', group: 'day', page: '3' })).toEqual({
      area: 'windsor-park', category: 'yard-cleanup', type: 'task', time: '7d', q: 'leaf bags', saved: true, sort: 'top', view: 'list', group: 'day', page: 3,
    });
    expect(parsePortalQuery({ area: '../etc', category: 'pottery', type: 'event', time: '1y', sort: 'best', view: 'map', page: '-2' })).toEqual({ saved: false, sort: 'hot', view: 'feed', group: 'area', page: 1 });
    expect(parsePortalQuery({ area: 'all', category: 'general' })).toMatchObject({ area: 'all', category: 'general' });
  });

  it('still opens the older feed addresses: the whole market, Active as Hot, a kind as the type', () => {
    expect(parsePortalQuery({ scope: 'market', sort: 'active', kind: 'tip' })).toMatchObject({ area: 'all', sort: 'hot', type: 'tip' });
    expect(parsePortalQuery({ scope: 'nearby' })).not.toHaveProperty('area');
  });

  it('ranks Hot like Reddit with positives only: a tenfold engagement buys 12.5 hours', () => {
    const at = new Date('2026-11-17T12:00:00.000Z');
    const later = new Date(at.getTime() + HOT_SECONDS * 1000);
    expect(hotScore(9, at)).toBeCloseTo(hotScore(0, later), 10);
    expect(hotScore(20, at)).toBeGreaterThan(hotScore(0, later));
    expect(hotScore(-5, at)).toBe(hotScore(0, at));
  });

  it('names a post task’s state as the post shows it', () => {
    const now = new Date('2026-11-17T15:00:00.000Z');
    const later = new Date('2026-11-20T15:00:00.000Z');
    expect(postTaskState({ status: 'open', windowEnd: later, hiddenAt: null }, now)).toBe('open');
    expect(postTaskState({ status: 'open', windowEnd: new Date('2026-11-16T15:00:00.000Z'), hiddenAt: null }, now)).toBe('closed');
    expect(postTaskState({ status: 'open', windowEnd: later, hiddenAt: now }, now)).toBe('closed');
    expect(postTaskState({ status: 'assigned', windowEnd: later, hiddenAt: null }, now)).toBe('booked');
    expect(postTaskState({ status: 'completed', windowEnd: now, hiddenAt: null }, now)).toBe('done');
    expect(postTaskState({ status: 'canceled', windowEnd: later, hiddenAt: null }, now)).toBe('closed');
  });

  it('searches every word of two letters or more, at most six', () => {
    expect(searchWords('Who fixes a FENCE, a gate & the latch?')).toEqual(['who', 'fixes', 'fence', 'gate', 'the', 'latch']);
    expect(searchWords('a b')).toEqual([]);
    expect(searchWords(undefined)).toEqual([]);
    expect(searchWords('jardín árbol')).toEqual(['jardín', 'árbol']);
  });

  it('counts the time filters back from now', () => {
    const now = new Date('2026-11-17T15:00:00.000Z');
    expect(portalSince('24h', now)?.toISOString()).toBe('2026-11-16T15:00:00.000Z');
    expect(portalSince('7d', now)?.toISOString()).toBe('2026-11-10T15:00:00.000Z');
    expect(portalSince(undefined, now)).toBeUndefined();
  });
});
