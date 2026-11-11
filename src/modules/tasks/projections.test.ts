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
  it('fills defaults and ignores unknown values', () => {
    expect(parseTaskBoardQuery({})).toEqual({ when: 'any', remoteOnly: false, sort: 'soonest', page: 1 });
    expect(parseTaskBoardQuery({ category: 'moving-help', when: 'today', remote: '1', sort: 'newest', page: '3' })).toEqual({
      category: 'moving-help',
      when: 'today',
      remoteOnly: true,
      sort: 'newest',
      page: 3,
    });
    expect(parseTaskBoardQuery({ category: 'plumbing', when: 'someday', sort: 'cheap', page: '-2' })).toEqual({
      when: 'any',
      remoteOnly: false,
      sort: 'soonest',
      page: 1,
    });
  });

  it('turns "when" into market-calendar ranges', () => {
    // Tuesday, Nov 17, 2026, 9:00 am in Austin.
    const now = new Date('2026-11-17T15:00:00.000Z');
    expect(whenRange('any', now)).toBeNull();
    expect(whenRange('today', now)).toEqual({ from: now, to: new Date('2026-11-18T06:00:00.000Z') });
    expect(whenRange('this_week', now)).toEqual({ from: now, to: new Date('2026-11-23T06:00:00.000Z') });
    expect(whenRange('this_weekend', now)).toEqual({
      from: new Date('2026-11-21T06:00:00.000Z'),
      to: new Date('2026-11-23T06:00:00.000Z'),
    });
    // On Sunday the weekend is what's left of today.
    const sunday = new Date('2026-11-22T18:00:00.000Z');
    expect(whenRange('this_weekend', sunday)).toEqual({ from: sunday, to: new Date('2026-11-23T06:00:00.000Z') });
  });
});
