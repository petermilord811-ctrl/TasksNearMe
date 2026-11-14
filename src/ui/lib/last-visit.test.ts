import { describe, expect, it } from 'vitest';
import { markFrom, nextVisit, VISIT_GAP_MS, VISIT_MAX_AGE_MS } from './last-visit';

const at = Date.parse('2026-11-14T15:00:00.000Z');
const minutes = (n: number) => n * 60_000;

describe('"New since your last visit"', () => {
  it('has nothing to mark from on a first visit', () => {
    const first = nextVisit(null, at);
    expect(first).toEqual({ seen: at, previous: null });
    expect(markFrom(first, at)).toBeNull();
  });

  it('keeps marking from the same last visit while the reader keeps looking', () => {
    const visit = nextVisit({ seen: at - minutes(90), previous: null }, at);
    expect(visit).toEqual({ seen: at, previous: at - minutes(90) });
    // Ten minutes later, the same visit: still since the one before.
    const again = nextVisit(visit, at + minutes(10));
    expect(again).toEqual({ seen: at + minutes(10), previous: at - minutes(90) });
    expect(markFrom(again, at + minutes(10))).toBe(at - minutes(90));
  });

  it('starts a new visit after half an hour away', () => {
    const later = at + VISIT_GAP_MS + 1;
    expect(nextVisit({ seen: at, previous: at - minutes(600) }, later)).toEqual({ seen: later, previous: at });
    expect(nextVisit({ seen: at, previous: at - minutes(600) }, at + VISIT_GAP_MS)).toEqual({ seen: at + VISIT_GAP_MS, previous: at - minutes(600) });
  });

  it('falls back to the usual "New" when the last visit was over a week ago', () => {
    expect(markFrom({ seen: at, previous: at - VISIT_MAX_AGE_MS }, at)).toBe(at - VISIT_MAX_AGE_MS);
    expect(markFrom({ seen: at, previous: at - VISIT_MAX_AGE_MS - 1 }, at)).toBeNull();
  });
});
