import { describe, expect, it } from 'vitest';
import { deskBookingHelperConfirmed, movingBookingPosterConfirmed, remoteBookingHelperConfirmed } from '@/fixtures';
import { bookingCalendarFile } from './calendar';

const now = new Date('2026-11-17T15:02:00.000Z');

describe('booking calendar file', () => {
  it('blocks the agreed start to the window end, with the area and never the address', () => {
    const ics = bookingCalendarFile(deskBookingHelperConfirmed, 'https://example.test/app/bookings/bkg_desk', now);
    expect(ics).toContain('DTSTART:20261121T163000Z');
    expect(ics).toContain('DTEND:20261121T190000Z');
    expect(ics).toContain('LOCATION:Mueller\\, Austin');
    expect(ics).toContain('UID:bkg_desk@tasksnearme');
    expect(ics).not.toContain('Example Lane');
    expect(ics.endsWith('\r\n')).toBe(true);
    for (const line of ics.split('\r\n')) expect(line.length).toBeLessThanOrEqual(75);
  });

  it('blocks the hourly cap, and says remote for remote work', () => {
    expect(bookingCalendarFile(movingBookingPosterConfirmed, 'https://example.test/b', now)).toContain('DTEND:20261122T190000Z');
    expect(bookingCalendarFile(remoteBookingHelperConfirmed, 'https://example.test/b', now)).toContain('LOCATION:Remote');
  });
});
