import { describe, expect, it } from 'vitest';
import { neighborhoodDayInputSchema } from '@/contracts';
import { canCancelDay, dayStateOf, visitStateOf } from './neighborhood-day-domain';

const now = new Date('2026-12-08T16:00:00.000Z');
const later = new Date('2026-12-12T15:00:00.000Z');
const earlier = new Date('2026-12-05T15:00:00.000Z');

describe('neighborhood day states', () => {
  it('reads a visit from its slot and the clock', () => {
    expect(visitStateOf('active', later, now)).toBe('open');
    expect(visitStateOf('held', later, now)).toBe('taken');
    expect(visitStateOf('booked', earlier, now)).toBe('taken');
    expect(visitStateOf('active', earlier, now)).toBe('closed');
    expect(visitStateOf('expired', later, now)).toBe('closed');
  });

  it('reads the day: open, filling, full, past, canceled', () => {
    expect(dayStateOf('open', [{ state: 'open', start: later }, { state: 'open', start: later }], now)).toBe('open');
    expect(dayStateOf('open', [{ state: 'taken', start: later }, { state: 'open', start: later }], now)).toBe('filling');
    expect(dayStateOf('open', [{ state: 'taken', start: later }, { state: 'closed', start: later }], now)).toBe('full');
    expect(dayStateOf('open', [{ state: 'taken', start: earlier }, { state: 'closed', start: earlier }], now)).toBe('past');
    expect(dayStateOf('open', [], now)).toBe('past');
    expect(dayStateOf('canceled', [{ state: 'taken', start: later }], now)).toBe('canceled');
  });

  it('lets the helper cancel while a visit ahead is open or requested, never a booked-only day', () => {
    expect(canCancelDay('open', [{ status: 'active', end: later }], now)).toBe(true);
    expect(canCancelDay('open', [{ status: 'held', end: later }], now)).toBe(true);
    expect(canCancelDay('open', [{ status: 'booked', end: later }], now)).toBe(false);
    expect(canCancelDay('open', [{ status: 'active', end: earlier }], now)).toBe(false);
    expect(canCancelDay('canceled', [{ status: 'active', end: later }], now)).toBe(false);
  });
});

describe('neighborhood day input', () => {
  const base = { areaSlug: 'hyde-park', categorySlug: 'furniture-assembly' as const, date: '2026-12-12', priceCents: 6500, visits: [{ startTime: '09:00', endTime: '10:00' }, { startTime: '10:30', endTime: '11:30' }] };
  const errors = (value: unknown) => {
    const parsed = neighborhoodDayInputSchema.safeParse(value);
    return parsed.success ? [] : parsed.error.issues.map((issue) => `${issue.path.join('.')}:${issue.message}`);
  };

  it('takes 2 to 8 visits that end after they start and do not overlap', () => {
    expect(errors(base)).toEqual([]);
    expect(errors({ ...base, visits: base.visits.slice(0, 1) })).toEqual(['visits:too_short']);
    expect(errors({ ...base, visits: Array.from({ length: 9 }, (_, index) => ({ startTime: `1${index}:00`, endTime: `1${index}:30` })) })).toEqual(['visits:too_long']);
    expect(errors({ ...base, visits: [{ startTime: '09:00', endTime: '08:00' }, base.visits[1]] })).toEqual(['visits.0.endTime:out_of_range']);
    expect(errors({ ...base, visits: [{ startTime: '10:00', endTime: '11:00' }, { startTime: '09:30', endTime: '10:30' }] })).toEqual(['visits.0.startTime:out_of_range']);
  });

  it('takes a neighbor price only when it is lower than the usual price', () => {
    expect(errors({ ...base, neighborPriceCents: 5000 })).toEqual([]);
    expect(errors({ ...base, neighborPriceCents: 6500 })).toEqual(['neighborPriceCents:out_of_range']);
    expect(errors({ ...base, neighborPriceCents: -1 })).toEqual(['neighborPriceCents:invalid']);
  });
});
