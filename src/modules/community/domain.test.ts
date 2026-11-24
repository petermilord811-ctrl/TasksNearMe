import { describe, expect, it } from 'vitest';
import { marketDayKey, marketLocalToUtc } from '@/shared/format';
import {
  answerExcerpt,
  askAlertsOn,
  askAlertTypeFor,
  isHomeMove,
  WELCOME_DAYS,
  welcomeDue,
  authorRole,
  bodyFits,
  bodyRequired,
  communityLimits,
  digestDue,
  digestSendFrom,
  followNoticeKey,
  helpfulMilestone,
  initialsOf,
  isSafetyOrCrimePost,
  milesBetween,
  HOT_SECONDS,
  hotScore,
  parsePortalQuery,
  portalSince,
  postTaskState,
  reportsHide,
  searchWords,
  soundsUnkind,
  startersFor,
  untitledPostTitle,
} from './domain';
import { communityPostInputSchema } from '@/contracts/community';
import { neighborsRowScope, shownUnder } from './samples';

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
    expect(parsePortalQuery({})).toEqual({ saved: false, unanswered: false, sort: 'hot', view: 'feed', group: 'area', page: 1 });
    expect(parsePortalQuery({ area: 'windsor-park', category: 'yard-cleanup', type: 'question', time: '7d', q: '  leaf   bags ', saved: '1', sort: 'top', view: 'list', group: 'day', page: '3' })).toEqual({
      area: 'windsor-park', category: 'yard-cleanup', type: 'question', time: '7d', q: 'leaf bags', saved: true, unanswered: false, sort: 'top', view: 'list', group: 'day', page: 3,
    });
    expect(parsePortalQuery({ area: '../etc', category: 'pottery', type: 'event', time: '1y', sort: 'best', view: 'map', page: '-2' })).toEqual({ saved: false, unanswered: false, sort: 'hot', view: 'feed', group: 'area', page: 1 });
    expect(parsePortalQuery({ area: 'all', category: 'general' })).toMatchObject({ area: 'all', category: 'general' });
  });

  it('opens Open tasks as the board does, with its own sorts and the board’s filters (2026-11-23)', () => {
    // The tab's defaults: the List, the soonest window first.
    expect(parsePortalQuery({ type: 'task' })).toEqual({ type: 'task', saved: false, unanswered: false, sort: 'soonest', view: 'list', group: 'area', page: 1 });
    // Its sorts are the board's; Neighbors' Hot and Top fall back to Soonest there, and Soonest means nothing on Neighbors.
    expect(parsePortalQuery({ type: 'task', sort: 'price_high', view: 'feed' })).toMatchObject({ sort: 'price_high', view: 'feed' });
    expect(parsePortalQuery({ type: 'task', sort: 'top' }).sort).toBe('soonest');
    expect(parsePortalQuery({ type: 'task', sort: 'active' }).sort).toBe('soonest');
    expect(parsePortalQuery({ sort: 'soonest' }).sort).toBe('hot');
    // The board's filters under the board's names: the price in whole dollars (the wrong way round, swapped), fixed or
    // hourly, when, the times of day (the board's order) and few offers.
    expect(parsePortalQuery({ type: 'task', min: '120', max: '40', pricing: 'hourly', when: 'this_weekend', slot: 'evening,brunch,morning', few: '1' })).toMatchObject({
      minPrice: 40, maxPrice: 120, pricing: 'hourly', when: 'this_weekend', slots: ['morning', 'evening'], few: true,
    });
    // Nonsense is dropped: a price that isn't whole dollars, a minimum of 0, when "any", an unknown kind of price.
    const loose = parsePortalQuery({ type: 'task', min: '0', max: '12.5', pricing: 'barter', when: 'any', slot: 'noon' });
    for (const key of ['minPrice', 'maxPrice', 'pricing', 'when', 'slots', 'few']) expect(loose).not.toHaveProperty(key);
    // On Neighbors they mean nothing: tasks there are mixed in with posts.
    const neighbors = parsePortalQuery({ min: '50', pricing: 'fixed', when: 'today', slot: 'morning', few: '1' });
    for (const key of ['minPrice', 'pricing', 'when', 'slots', 'few']) expect(neighbors).not.toHaveProperty(key);
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
    expect(postTaskState({ status: 'open', windowStart: later, hiddenAt: null }, now)).toBe('open');
    expect(postTaskState({ status: 'open', windowStart: new Date('2026-11-16T15:00:00.000Z'), hiddenAt: null }, now)).toBe('closed');
    // Offers close when the window starts, though it hasn't ended (2026-11-24).
    expect(postTaskState({ status: 'open', windowStart: now, hiddenAt: null }, now)).toBe('closed');
    expect(postTaskState({ status: 'open', windowStart: later, hiddenAt: now }, now)).toBe('closed');
    expect(postTaskState({ status: 'assigned', windowStart: later, hiddenAt: null }, now)).toBe('booked');
    expect(postTaskState({ status: 'completed', windowStart: now, hiddenAt: null }, now)).toBe('done');
    expect(postTaskState({ status: 'canceled', windowStart: later, hiddenAt: null }, now)).toBe('closed');
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

describe('Neighbors, plan 10', () => {
  it('takes an ask without details, and wants them for a tip or a thanks', () => {
    expect(bodyRequired('recommendation')).toBe(false);
    expect(bodyRequired('question')).toBe(false);
    expect(bodyFits('question', '')).toBe(true);
    expect(bodyFits('tip', 'short')).toBe(false);
    expect(bodyFits('thanks', 'Thanks for the careful work!')).toBe(true);
  });

  it('reminds about name-calling and profanity, in English and Spanish, but not about words a job needs', () => {
    expect(soundsUnkind('The last crew were idiots')).toBe(true);
    expect(soundsUnkind('what a pathetic excuse')).toBe(true);
    expect(soundsUnkind('eres un imbécil')).toBe(true);
    expect(soundsUnkind('Cállate')).toBe(true);
    expect(soundsUnkind('Who can take the trash bags to the curb?')).toBe(false);
    expect(soundsUnkind('The oven was disgusting before the deep clean')).toBe(false);
    expect(soundsUnkind('Necesito ayuda con la computadora')).toBe(false);
    expect(soundsUnkind('Una disputa con el casero')).toBe(false);
  });

  it('keys follow notices by post and hour, so a busy thread tells followers once an hour', () => {
    const at = new Date('2026-11-22T15:10:00.000Z');
    expect(followNoticeKey('cpo_a', at)).toBe(followNoticeKey('cpo_a', new Date('2026-11-22T15:59:59.000Z')));
    expect(followNoticeKey('cpo_a', at)).not.toBe(followNoticeKey('cpo_a', new Date('2026-11-22T16:00:00.000Z')));
    expect(followNoticeKey('cpo_a', at)).not.toBe(followNoticeKey('cpo_b', at));
  });

  it('hides after reports only from three different accounts at least a week old', () => {
    const now = new Date('2026-11-22T12:00:00.000Z');
    const old = new Date('2026-10-01T12:00:00.000Z');
    const fresh = new Date('2026-11-20T12:00:00.000Z');
    expect(reportsHide([{ userId: 'a', createdAt: old }, { userId: 'b', createdAt: old }], now)).toBe(false);
    expect(reportsHide([{ userId: 'a', createdAt: old }, { userId: 'a', createdAt: old }, { userId: 'b', createdAt: old }], now)).toBe(false);
    expect(reportsHide([{ userId: 'a', createdAt: old }, { userId: 'b', createdAt: old }, { userId: 'c', createdAt: fresh }], now)).toBe(false);
    expect(reportsHide([{ userId: 'a', createdAt: old }, { userId: 'b', createdAt: old }, { userId: 'c', createdAt: old }], now)).toBe(true);
  });

  it('sends the digest from Sunday 9 am on the market’s clock, for 36 hours, once a week', () => {
    const zone = 'America/New_York';
    const sunday = digestSendFrom(new Date('2026-11-22T15:00:00.000Z'), zone, marketLocalToUtc, (at, z) => marketDayKey(at, z));
    expect(sunday.toISOString()).toBe('2026-11-22T14:00:00.000Z');
    // Sunday before 9 am: last week's moment.
    expect(digestSendFrom(new Date('2026-11-22T12:00:00.000Z'), zone, marketLocalToUtc, (at, z) => marketDayKey(at, z)).toISOString()).toBe('2026-11-15T14:00:00.000Z');
    // Wednesday: this week's Sunday, but past the window.
    const wednesday = new Date('2026-11-25T15:00:00.000Z');
    const from = digestSendFrom(wednesday, zone, marketLocalToUtc, (at, z) => marketDayKey(at, z));
    expect(from.toISOString()).toBe('2026-11-22T14:00:00.000Z');
    expect(digestDue(null, from, wednesday)).toBe(false);
    expect(digestDue(null, sunday, new Date('2026-11-22T15:00:00.000Z'))).toBe(true);
    expect(digestDue(new Date('2026-11-22T14:30:00.000Z'), sunday, new Date('2026-11-22T16:00:00.000Z'))).toBe(false);
    expect(digestDue(new Date('2026-11-15T14:30:00.000Z'), sunday, new Date('2026-11-22T16:00:00.000Z'))).toBe(true);
  });

  it('offers this month’s starters in the page’s language, at most three, real services only', () => {
    const prompts = [
      { months: [11, 12], kind: 'recommendation' as const, category: 'yard-cleanup', en: 'Who rakes leaves?', es: '¿Quién recoge hojas?' },
      { months: [5], kind: 'question' as const, en: 'Moving out soon?', es: '¿Te mudas pronto?' },
      { months: [11], kind: 'tip' as const, category: 'not-a-service', en: 'Clean gutters from the ground', es: 'Limpia canaletas desde el suelo' },
      { months: [11], kind: 'recommendation' as const, en: 'Who assembles cribs?', es: '¿Quién arma cunas?' },
      { months: [11], kind: 'question' as const, en: 'Best day for bulk pickup?', es: '¿Mejor día para recolección?' },
    ];
    expect(startersFor(prompts, 11, 'es').map((starter) => starter.title)).toEqual(['¿Quién recoge hojas?', 'Limpia canaletas desde el suelo', '¿Quién arma cunas?']);
    expect(startersFor(prompts, 11, 'en')[1]).toEqual({ kind: 'tip', title: 'Clean gutters from the ground' });
    expect(startersFor(prompts, 5, 'en')).toEqual([{ kind: 'question', title: 'Moving out soon?' }]);
    expect(startersFor(null, 11, 'en')).toEqual([]);
  });

  it('reads Unanswered from the address', () => {
    expect(parsePortalQuery({ unanswered: '1' }).unanswered).toBe(true);
    expect(parsePortalQuery({}).unanswered).toBe(false);
  });
});

describe('any social post (2026-11-22)', () => {
  it('names a general post by its first line, cut at a word', () => {
    expect(untitledPostTitle('Sunset over Lake Alice tonight.\nThe cranes are back!')).toBe('Sunset over Lake Alice tonight.');
    expect(untitledPostTitle('\n\n  Two   spaces  inside  \n')).toBe('Two spaces inside');
    const long = untitledPostTitle('A very long first line about the sandhill cranes that come back to Paynes Prairie every November, worth a drive.');
    expect(long.length).toBeLessThanOrEqual(80);
    expect(long.endsWith('…')).toBe(true);
    expect(long).toBe('A very long first line about the sandhill cranes that come back to Paynes…');
  });

  it('takes a general post without a title, and its words are what it needs', () => {
    expect(communityPostInputSchema.safeParse({ kind: 'general', body: 'Hi neighbors!' }).success).toBe(true);
    const empty = communityPostInputSchema.safeParse({ kind: 'general', body: '' });
    expect(empty.success).toBe(false);
    expect(empty.error?.issues.map((issue) => [issue.path.join('.'), issue.message])).toEqual([['body', 'required']]);
    expect(communityPostInputSchema.safeParse({ kind: 'general', body: 'x' }).error?.issues[0]?.message).toBe('too_short');
    expect(bodyFits('general', 'ok')).toBe(true);
    expect(bodyFits('general', ' ')).toBe(false);
  });

  it('still asks the other kinds for a title', () => {
    expect(communityPostInputSchema.safeParse({ kind: 'question', body: '' }).error?.issues.map((issue) => [issue.path.join('.'), issue.message])).toEqual([['title', 'required']]);
    expect(communityPostInputSchema.safeParse({ kind: 'tip', title: 'Abc', body: 'Ten characters at least.' }).error?.issues[0]?.message).toBe('too_short');
    expect(communityPostInputSchema.safeParse({ kind: 'question', title: 'Is it weekly?' }).success).toBe(true);
  });

  it('filters the portal by general posts', () => {
    expect(parsePortalQuery({ type: 'general' }).type).toBe('general');
  });
});

describe('the demo marketplace on Neighbors (plan 10, D1)', () => {
  it('hides it from real accounts where samples are hidden, unless staff switch it on', () => {
    const real = 'usr_0123456789abcdef0123456789abcdef';
    expect(neighborsRowScope({ id: real, staff: false }, undefined, true)).toBe('real');
    expect(neighborsRowScope({ id: real, staff: true }, '1', true)).toBe('all');
    expect(neighborsRowScope({ id: real, staff: false }, '1', true)).toBe('real');
    expect(neighborsRowScope({ id: 'usr_maya', staff: false }, undefined, true)).toBe('all');
    expect(neighborsRowScope({ id: real, staff: false }, undefined, false)).toBe('all');
    expect(shownUnder('real', 'cpo_demo_1')).toBe(false);
    expect(shownUnder('real', 'cpo_0123456789abcdef0123456789abcdef')).toBe(true);
    expect(shownUnder(undefined, 'cpo_demo_1')).toBe(true);
  });
});

describe('helpers answer on Neighbors (2026-11-24)', () => {
  it('alerts helpers about a recommendation request or a question with a service, nothing else', () => {
    expect(askAlertTypeFor({ kind: 'recommendation', categorySlug: 'moving-help' })).toBe('community_ask_match');
    expect(askAlertTypeFor({ kind: 'question', categorySlug: 'moving-help' })).toBe('community_question_match');
    expect(askAlertTypeFor({ kind: 'question', categorySlug: null })).toBeNull();
    expect(askAlertTypeFor({ kind: 'tip', categorySlug: 'moving-help' })).toBeNull();
    expect(askAlertTypeFor({ kind: 'general', categorySlug: 'moving-help' })).toBeNull();
  });

  it('keeps ask alerts on until a helper turns them off', () => {
    expect(askAlertsOn(undefined)).toBe(true);
    expect(askAlertsOn('true')).toBe(true);
    expect(askAlertsOn('false')).toBe(false);
  });

  it('shortens an answer on whole words', () => {
    expect(answerExcerpt('  Short   answer.\nThanks! ')).toBe('Short answer. Thanks!');
    const long = 'Call the county first, they pick up bulky items on Tuesdays if you book by Friday, and the fee is small. '.repeat(3);
    const excerpt = answerExcerpt(long, 80);
    expect(excerpt.length).toBeLessThanOrEqual(80);
    expect(excerpt.endsWith('…')).toBe(true);
    expect(long.startsWith(excerpt.slice(0, -1))).toBe(true);
    expect(excerpt).not.toMatch(/[ ,]…$/);
  });
});

describe('the welcome for new movers (2026-11-24)', () => {
  const now = new Date('2026-11-24T15:00:00Z');
  const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);
  const moved = (patch: Partial<{ marketId: string; areaId: string | null; movedAt: Date; dismissedAt: Date | null }> = {}) => ({ marketId: 'mkt_gainesville', areaId: 'are_duckpond', movedAt: daysAgo(2), dismissedAt: null, ...patch });

  it('welcomes a new account to its market, not an old one', () => {
    expect(welcomeDue({ record: null, marketId: 'mkt_gainesville', accountCreatedAt: daysAgo(1), now })).toEqual({ id: 'mkt_gainesville:joined' });
    expect(welcomeDue({ record: null, marketId: 'mkt_gainesville', accountCreatedAt: daysAgo(WELCOME_DAYS + 1), now })).toBeNull();
  });

  it('shows a move until it is closed or old', () => {
    expect(welcomeDue({ record: moved(), marketId: 'mkt_gainesville', accountCreatedAt: daysAgo(400), now })).toEqual({ id: `mkt_gainesville:${daysAgo(2).toISOString()}` });
    expect(welcomeDue({ record: moved({ dismissedAt: daysAgo(1) }), marketId: 'mkt_gainesville', accountCreatedAt: daysAgo(400), now })).toBeNull();
    expect(welcomeDue({ record: moved({ movedAt: daysAgo(WELCOME_DAYS + 1) }), marketId: 'mkt_gainesville', accountCreatedAt: daysAgo(400), now })).toBeNull();
  });

  it('welcomes someone whose market changed since their last welcome, even one they closed', () => {
    expect(welcomeDue({ record: moved({ dismissedAt: daysAgo(1) }), marketId: 'mkt_austin', accountCreatedAt: daysAgo(400), now })).toEqual({ id: 'mkt_austin:moved' });
  });

  it('counts a new market or another neighborhood as a move, never forgetting one', () => {
    const before = { marketId: 'mkt_gainesville', areaId: 'are_duckpond' };
    expect(isHomeMove(before, { marketId: 'mkt_gainesville', areaId: 'are_springhill' })).toBe(true);
    expect(isHomeMove({ ...before, areaId: null }, before)).toBe(true);
    expect(isHomeMove(before, { marketId: 'mkt_austin', areaId: null })).toBe(true);
    expect(isHomeMove(before, before)).toBe(false);
    expect(isHomeMove(before, { marketId: 'mkt_gainesville', areaId: null })).toBe(false);
  });
});
