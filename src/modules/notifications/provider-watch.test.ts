import { describe, expect, it } from 'vitest';
import type { DeliveryOutcomes } from './delivery';
import { noteDeliveryRun, OUTAGE_RUNS_TO_PAGE, providerOutagePage, type OutageState } from './provider-watch';

const run = (email: [number, number], sms: [number, number] = [0, 0]): DeliveryOutcomes => ({ email: { sent: email[0], failed: email[1] }, sms: { sent: sms[0], failed: sms[1] }, push: { sent: 0, failed: 0 } });

describe('the provider outage watch (when things break, 2026-11-21)', () => {
  it('pages once a channel’s sends all fail for 3 runs (3 failures at least), and again only after a send went out', () => {
    const state: OutageState = new Map();
    expect(OUTAGE_RUNS_TO_PAGE).toBe(3);
    expect(noteDeliveryRun(state, run([0, 2], [1, 0]))).toEqual([]);
    // A quiet run (nothing to send) changes nothing.
    expect(noteDeliveryRun(state, run([0, 0]))).toEqual([]);
    expect(noteDeliveryRun(state, run([0, 1]))).toEqual([]);
    expect(noteDeliveryRun(state, run([0, 1]))).toEqual([{ channel: 'email', failed: 4 }]);
    expect(noteDeliveryRun(state, run([0, 5]))).toEqual([]);
    // Back: one send went out, the count starts over.
    expect(noteDeliveryRun(state, run([1, 3]))).toEqual([]);
    expect(state.has('email')).toBe(false);
  });

  it('doesn’t take one bad address for an outage', () => {
    const state: OutageState = new Map();
    for (let index = 0; index < 5; index += 1) noteDeliveryRun(state, run([0, 0], [0, index === 0 ? 1 : 0]));
    expect(state.get('sms')).toMatchObject({ runs: 1, failed: 1, paged: false });
  });

  it('says which channel, that sign-in codes fail too, and where to look, keyed to one page an hour', () => {
    const page = providerOutagePage('email', 4, new Date('2026-11-21T14:35:00.000Z'));
    expect(page.subject).toBe("Emails aren't going out");
    expect(page.text).toContain('Sign-in codes by email fail meanwhile');
    expect(page.text).toContain('docs/runbooks/email-and-sms-down.md');
    expect(page.path).toBe('/admin?outage=email&hour=2026-11-21T14');
    expect(providerOutagePage('sms', 3, new Date()).text).toContain('Sign-in codes by text');
  });
});
