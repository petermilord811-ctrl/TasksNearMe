import { describe, expect, it } from 'vitest';
import { marketStatusChange } from './coverage';
import { canChangeMarketStatus, marketStatusActions, openingRefusal } from './status-actions';

const facts = { helpersWaiting: 7, waitlistToTell: 40 };
// Europe/London: a zone no US market's dates are shown in, refused before and after plan 8.1.
const ZONES = ['America/Chicago', 'America/New_York', 'America/Denver', 'Pacific/Honolulu', 'Europe/London'];

describe('the Markets section’s buttons (plan 8.2)', () => {
  it('are for admins only: every other staff role reads', () => {
    expect(canChangeMarketStatus(['admin'])).toBe(true);
    expect(canChangeMarketStatus(['support_lead', 'finance'])).toBe(false);
    expect(marketStatusActions(['support_agent'], { status: 'paused', timeZone: 'America/Chicago', ...facts })).toEqual([]);
    expect(marketStatusActions(['support_lead', 'trust_safety', 'finance'], { status: 'live', timeZone: 'America/Chicago', ...facts })).toEqual([]);
  });

  it('offer the two other statuses in order, each confirmed, and say what opening a paused market does', () => {
    expect(marketStatusActions(['admin'], { status: 'paused', timeZone: 'America/Chicago', ...facts })).toEqual([
      { id: 'prelaunch', kind: 'secondary', enabled: true, confirm: true, helpersIn: 7, waitlistEmails: 0 },
      { id: 'live', kind: 'primary', enabled: true, confirm: true, helpersIn: 7, waitlistEmails: 40 },
    ]);
  });

  it('bring nobody in between pre-launch and live, and email the waitlist only when going live', () => {
    expect(marketStatusActions(['admin'], { status: 'prelaunch', timeZone: 'America/Chicago', ...facts })).toEqual([
      { id: 'live', kind: 'primary', enabled: true, confirm: true, helpersIn: 0, waitlistEmails: 40 },
      { id: 'paused', kind: 'destructive', enabled: true, confirm: true, helpersIn: 0, waitlistEmails: 0 },
    ]);
    expect(marketStatusActions(['admin'], { status: 'live', timeZone: 'America/Chicago', ...facts }).map(({ id, helpersIn, waitlistEmails }) => ({ id, helpersIn, waitlistEmails }))).toEqual([
      { id: 'prelaunch', helpersIn: 0, waitlistEmails: 0 },
      { id: 'paused', helpersIn: 0, waitlistEmails: 0 },
    ]);
  });

  it('follow the time-zone rule setMarketStatus applies (plan 8.1), and pausing always works', () => {
    for (const timeZone of ZONES) {
      for (const status of ['prelaunch', 'live', 'paused'] as const) {
        const market = { status, timeZone };
        for (const action of marketStatusActions(['admin'], { ...market, ...facts })) {
          expect(action.enabled).toBe(marketStatusChange(market, action.id).ok);
          if (action.id === 'paused') expect(action.enabled).toBe(true);
        }
        const refused = ['prelaunch', 'live'].some((next) => { const change = marketStatusChange(market, next as 'prelaunch' | 'live'); return !change.ok && change.code === 'time_zone_unsupported'; });
        expect(openingRefusal(market)).toBe(refused ? 'time_zone_unsupported' : null);
      }
    }
    expect(openingRefusal({ status: 'paused', timeZone: 'America/Chicago' })).toBeNull();
    expect(openingRefusal({ status: 'paused', timeZone: 'Europe/London' })).toBe('time_zone_unsupported');
    expect(marketStatusActions(['admin'], { status: 'paused', timeZone: 'Europe/London', ...facts }).map(({ id, enabled }) => ({ id, enabled }))).toEqual([
      { id: 'prelaunch', enabled: false },
      { id: 'live', enabled: false },
    ]);
  });
});
