import { describe, expect, it } from 'vitest';
import { canInviteTeam, cancelChoiceOpen, partnerRefusal, showsPartnerPrice, teamActions, teamInPlay, teamStatusNow, type TeamFacts } from './domain';

const now = new Date('2026-11-24T12:00:00Z');
const later = new Date('2026-11-26T15:00:00Z');
const earlier = new Date('2026-11-24T09:00:00Z');
const lead = { status: 'confirmed', startAt: later };
const team = (extra: Partial<TeamFacts> = {}): TeamFacts => ({ status: 'invited', lead, ...extra });

describe('who may invite', () => {
  const booking = { status: 'confirmed', startAt: later, seriesId: null, teamPartOf: null };
  it('the lead of a confirmed booking, before it starts, with none in play', () => {
    expect(canInviteTeam(booking, false, now)).toBe(true);
  });
  it.each([
    ['not confirmed yet', { ...booking, status: 'pending_funding' }, false],
    ['under way', { ...booking, status: 'in_progress' }, false],
    ['started', { ...booking, startAt: earlier }, false],
    ['a visit of regular visits', { ...booking, seriesId: 'ser_1' }, false],
    ["a partner's own part", { ...booking, teamPartOf: 'bkg_lead' }, false],
    ['a team already in play', booking, true],
  ])('not on %s', (_label, facts, inPlay) => {
    expect(canInviteTeam(facts, inPlay, now)).toBe(false);
  });
});

describe('whom', () => {
  const ok = { partnerId: 'usr_sam', leadId: 'usr_jordan', clientId: 'usr_chris', bookable: true, blocked: false };
  it('a bookable helper with no block', () => expect(partnerRefusal(ok)).toBeNull());
  it('not themselves or the client', () => {
    expect(partnerRefusal({ ...ok, partnerId: 'usr_jordan' })).toBe('self');
    expect(partnerRefusal({ ...ok, partnerId: 'usr_chris' })).toBe('self');
  });
  it('not someone who cannot be booked for it', () => expect(partnerRefusal({ ...ok, bookable: false })).toBe('not_bookable'));
  it('not across a block', () => expect(partnerRefusal({ ...ok, blocked: true })).toBe('blocked'));
});

describe('the invite as it stands', () => {
  it('lapses once the lead booking starts or is no longer confirmed', () => {
    expect(teamStatusNow(team(), now)).toBe('invited');
    expect(teamStatusNow(team({ lead: { status: 'confirmed', startAt: earlier } }), now)).toBe('expired');
    expect(teamStatusNow(team({ status: 'accepted', lead: { status: 'canceled', startAt: later } }), now)).toBe('expired');
  });
  it('a confirmed part never booked lapses with its offer; a booked one stays', () => {
    expect(teamStatusNow(team({ status: 'confirmed', offerOpen: true }), now)).toBe('confirmed');
    expect(teamStatusNow(team({ status: 'confirmed', offerOpen: false }), now)).toBe('expired');
    expect(teamStatusNow(team({ status: 'confirmed', partnerBooking: { status: 'confirmed' }, lead: { status: 'canceled', startAt: later } }), now)).toBe('confirmed');
  });
  it('holds the place while in play, frees it once the partner booking is canceled', () => {
    expect(teamInPlay(team(), now)).toBe(true);
    expect(teamInPlay(team({ status: 'declined' }), now)).toBe(false);
    expect(teamInPlay(team({ status: 'confirmed', offerOpen: true }), now)).toBe(true);
    expect(teamInPlay(team({ status: 'confirmed', partnerBooking: { status: 'confirmed' } }), now)).toBe(true);
    expect(teamInPlay(team({ status: 'confirmed', partnerBooking: { status: 'canceled' } }), now)).toBe(false);
  });
});

describe('who does what', () => {
  it.each([
    ['invited', 'partner', ['accept', 'decline']],
    ['invited', 'lead', ['cancel']],
    ['invited', 'client', []],
    ['accepted', 'partner', ['withdraw']],
    ['accepted', 'lead', ['cancel']],
    ['accepted', 'client', ['confirm', 'refuse']],
    ['declined', 'partner', []],
    ['refused', 'client', []],
  ] as const)('%s: the %s can %j', (status, role, actions) => {
    expect(teamActions(team({ status }), role, now)).toEqual(actions);
  });
  it('a confirmed part not booked: the client books it, the partner can step back, the lead nothing', () => {
    const confirmed = team({ status: 'confirmed', offerOpen: true });
    expect(teamActions(confirmed, 'client', now)).toEqual(['book']);
    expect(teamActions(confirmed, 'partner', now)).toEqual(['withdraw']);
    expect(teamActions(confirmed, 'lead', now)).toEqual([]);
  });
  it('once booked, each booking is canceled through its own page', () => {
    const booked = team({ status: 'confirmed', partnerBooking: { status: 'confirmed' } });
    expect(teamActions(booked, 'client', now)).toEqual([]);
    expect(teamActions(booked, 'partner', now)).toEqual([]);
  });
  it('nothing on an expired invite', () => {
    expect(teamActions(team({ lead: { status: 'confirmed', startAt: earlier } }), 'partner', now)).toEqual([]);
  });
});

describe('money per role', () => {
  it("the lead sees the partner's price only while asking", () => {
    expect(showsPartnerPrice('lead', 'invited')).toBe(true);
    expect(showsPartnerPrice('lead', 'accepted')).toBe(true);
    expect(showsPartnerPrice('lead', 'confirmed')).toBe(false);
    expect(showsPartnerPrice('partner', 'confirmed')).toBe(true);
    expect(showsPartnerPrice('client', 'confirmed')).toBe(true);
  });
});

describe("the client's choice on the lead's canceled booking", () => {
  it('while the partner booking can still be canceled before the work, until they keep them', () => {
    expect(cancelChoiceOpen('canceled', 'confirmed', false)).toBe(true);
    expect(cancelChoiceOpen('canceled', 'pending_funding', false)).toBe(true);
    expect(cancelChoiceOpen('canceled', 'confirmed', true)).toBe(false);
    expect(cancelChoiceOpen('canceled', 'in_progress', false)).toBe(false);
    expect(cancelChoiceOpen('canceled', 'canceled', false)).toBe(false);
    expect(cancelChoiceOpen('confirmed', 'confirmed', false)).toBe(false);
    expect(cancelChoiceOpen('canceled', undefined, false)).toBe(false);
  });
});
