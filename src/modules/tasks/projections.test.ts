import { describe, expect, it } from 'vitest';
import { deskPublicTask } from '@/fixtures';
import { parseTaskBoardQuery, toTaskPublicView, whenRange, type PublicTaskRow } from './projections';

const deskRow: PublicTaskRow = {
  id: 'tsk_desk',
  slug: 'assemble-a-desk-mueller-7f3k',
  title: 'Assemble a desk (flat-pack, 1 item)',
  description: 'Flat-pack desk, about 40 parts, still in the box in my living room. 2nd floor with an elevator.',
  categorySlug: 'furniture-assembly',
  mode: 'local',
  status: 'open',
  pricingType: 'fixed',
  budgetCents: 6000,
  hourlyRateCents: null,
  estimatedHours: null,
  hoursCap: null,
  windowStart: new Date(deskPublicTask.schedule.windowStart),
  windowEnd: new Date(deskPublicTask.schedule.windowEnd),
  flexible: false,
  publicLat: 30.2993,
  publicLng: -97.7036,
  offerCount: 3,
  publishedAt: new Date(deskPublicTask.postedAt),
  createdAt: new Date(deskPublicTask.postedAt),
  areaName: 'Mueller',
  marketSlug: 'austin',
  marketName: 'Austin',
  poster: {
    name: 'Maya R.',
    firstName: 'Maya',
    lastName: 'Rivera',
    createdAt: new Date(deskPublicTask.poster.memberSince),
    phoneVerifiedAt: new Date('2026-09-04T15:00:00.000Z'),
  },
};

const AUSTIN = 'America/Chicago';

describe('toTaskPublicView', () => {
  it('matches the canonical public desk task', () => {
    expect(toTaskPublicView(deskRow)).toEqual({ ...deskPublicTask, poster: { ...deskPublicTask.poster, ratingAsClient: undefined } });
  });

  it('never exposes the last name, and masks contacts in the excerpt', () => {
    const view = toTaskPublicView({ ...deskRow, description: 'Desk build. Text me at 512-555-0101.' });
    expect(JSON.stringify(view)).not.toContain('Rivera');
    expect(view.excerpt).toContain('[hidden]');
    expect(view.excerpt).not.toContain('555');
  });

  it('shows remote tasks without any point', () => {
    expect(toTaskPublicView({ ...deskRow, mode: 'remote', publicLat: null, publicLng: null }).location).toEqual({ kind: 'remote' });
  });

  it('maps hourly budgets', () => {
    expect(
      toTaskPublicView({ ...deskRow, pricingType: 'hourly', budgetCents: null, hourlyRateCents: 3500, estimatedHours: 3.5, hoursCap: 4 }).budget,
    ).toEqual({ type: 'hourly', rateCents: 3500, estimatedHours: 3.5, hoursCap: 4 });
  });
});

describe('board query', () => {
  const defaults = { areas: [], times: [], few: false, when: 'any', remoteOnly: false, sort: 'soonest', page: 1, view: 'list', group: 'area' };

  it('fills defaults and ignores unknown values', () => {
    expect(parseTaskBoardQuery({})).toEqual(defaults);
    expect(parseTaskBoardQuery({ category: 'moving-help', when: 'today', remote: '1', sort: 'newest', page: '3' })).toEqual({
      ...defaults,
      category: 'moving-help',
      when: 'today',
      remoteOnly: true,
      sort: 'newest',
      page: 3,
    });
    expect(parseTaskBoardQuery({ category: 'plumbing', when: 'someday', sort: 'cheap', page: '-2', view: 'grid', group: 'zip' })).toEqual(defaults);
  });

  it('reads the Craigslist-style filters (completion plan 7.4) and drops what doesn’t fit', () => {
    expect(
      parseTaskBoardQuery({ category: 'furniture-assembly', type: 'desk', q: '  flat   pack desk ', area: 'mueller,hyde-park,mueller,Bad Slug!', min: '150', max: '50', pricing: 'fixed', posted: '3d', time: 'evening,morning,noon', few: '1', view: 'cards', group: 'day' }),
    ).toEqual({
      ...defaults,
      category: 'furniture-assembly',
      type: 'desk',
      q: 'flat pack desk',
      areas: ['hyde-park', 'mueller'],
      minPrice: 50,
      maxPrice: 150,
      pricing: 'fixed',
      posted: '3d',
      times: ['morning', 'evening'],
      few: true,
      view: 'cards',
      group: 'day',
    });
    // A type needs its category; unknown pricing, posted windows and prices are ignored.
    expect(parseTaskBoardQuery({ type: 'desk', pricing: 'free', posted: '1y', min: 'cheap', max: '9999999' })).toEqual(defaults);
    expect(parseTaskBoardQuery({ category: 'yard-cleanup', type: 'desk' })).toEqual({ ...defaults, category: 'yard-cleanup' });
    expect(parseTaskBoardQuery({ q: 'x'.repeat(120) }).q).toHaveLength(80);
  });

  it('turns "when" into market-calendar ranges', () => {
    // Tuesday, Nov 17, 2026, 9:00 am in Austin.
    const now = new Date('2026-11-17T15:00:00.000Z');
    expect(whenRange('any', now, AUSTIN)).toBeNull();
    expect(whenRange('today', now, AUSTIN)).toEqual({ from: now, to: new Date('2026-11-18T06:00:00.000Z') });
    expect(whenRange('this_week', now, AUSTIN)).toEqual({ from: now, to: new Date('2026-11-23T06:00:00.000Z') });
    expect(whenRange('this_weekend', now, AUSTIN)).toEqual({
      from: new Date('2026-11-21T06:00:00.000Z'),
      to: new Date('2026-11-23T06:00:00.000Z'),
    });
    // On Sunday the weekend is what's left of today.
    const sunday = new Date('2026-11-22T18:00:00.000Z');
    expect(whenRange('this_weekend', sunday, AUSTIN)).toEqual({ from: sunday, to: new Date('2026-11-23T06:00:00.000Z') });
  });
});
