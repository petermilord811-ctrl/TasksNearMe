import { describe, expect, it } from 'vitest';
import { POSTER_ID_RULES, posterIdReason, type PosterRiskFacts } from './poster-risk';

const now = new Date('2026-11-20T15:00:00.000Z');
const DAY = 86_400_000;
const facts = (over: Partial<PosterRiskFacts> = {}): PosterRiskFacts => ({
  cleared: false,
  staffRequested: false,
  recentReports: 0,
  recentFailedPayments: 0,
  accountCreatedAt: new Date(now.getTime() - 90 * DAY),
  ...over,
});

describe('when a client has to verify their ID', () => {
  it('asks nothing of an ordinary client, whatever they pay', () => {
    expect(posterIdReason(facts(), now)).toBeNull();
    expect(posterIdReason(facts(), now, 250_000)).toBeNull();
    expect(posterIdReason(facts({ recentReports: POSTER_ID_RULES.reports - 1, recentFailedPayments: POSTER_ID_RULES.failedPayments - 1 }), now)).toBeNull();
  });

  it('asks after reports, declined cards, or when our team asks (in that order)', () => {
    expect(posterIdReason(facts({ recentReports: 2 }), now)).toBe('reports');
    expect(posterIdReason(facts({ recentFailedPayments: 5 }), now)).toBe('failed_payments');
    expect(posterIdReason(facts({ staffRequested: true, recentReports: 5, recentFailedPayments: 9 }), now)).toBe('staff_request');
    expect(posterIdReason(facts({ recentReports: 2, recentFailedPayments: 5 }), now)).toBe('reports');
  });

  it('asks a new account only before a large booking', () => {
    const fresh = facts({ accountCreatedAt: new Date(now.getTime() - 2 * DAY) });
    expect(posterIdReason(fresh, now)).toBeNull();
    expect(posterIdReason(fresh, now, POSTER_ID_RULES.largeBookingCents - 1)).toBeNull();
    expect(posterIdReason(fresh, now, POSTER_ID_RULES.largeBookingCents)).toBe('new_account_large_booking');
    // A week old: no longer new.
    expect(posterIdReason(facts({ accountCreatedAt: new Date(now.getTime() - POSTER_ID_RULES.newAccountDays * DAY) }), now, 90_000)).toBeNull();
  });

  it('stops asking once the ID check has cleared', () => {
    expect(posterIdReason(facts({ cleared: true, recentReports: 4, recentFailedPayments: 5, accountCreatedAt: now }), now, 90_000)).toBeNull();
  });
});
