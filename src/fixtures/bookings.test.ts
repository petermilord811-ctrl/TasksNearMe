import { describe, expect, it } from 'vitest';
import type { BookingView } from '@/contracts';
import * as fixtures from './bookings';

const views = Object.entries(fixtures).filter(
  (entry): entry is [string, BookingView] => typeof entry[1] === 'object' && entry[1] !== null && 'addressVisibility' in entry[1],
);

/** The booking fixtures follow the visibility rules the query layer applies (ui-contract §5). */
describe('booking fixtures', () => {
  it('covers both roles and every booking state', () => {
    expect(new Set(views.map(([, view]) => view.viewerRole))).toEqual(new Set(['poster', 'helper']));
    expect(new Set(views.map(([, view]) => view.status))).toEqual(
      new Set(['pending_funding', 'confirmed', 'in_progress', 'completion_submitted', 'completed', 'canceled']),
    );
  });

  it.each(views)('%s: an exact address only when visible, payments only for posters', (_name, view) => {
    expect(view.exactAddress !== undefined).toBe(view.addressVisibility === 'visible');
    if (view.location.kind === 'remote') expect(view.addressVisibility).toBe('not_applicable');
    if (view.viewerRole === 'helper') expect(view.payments).toBeUndefined();
  });
});
