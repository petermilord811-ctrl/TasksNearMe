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

describe('booking calendar file in Spanish', () => {
  it('describes the booking in Spanish', () => {
    const now = new Date('2026-11-14T15:00:00.000Z');
    expect(bookingCalendarFile(remoteBookingHelperConfirmed, 'https://example.test/b', now, 'es')).toContain('LOCATION:Remoto');
    expect(bookingCalendarFile(deskBookingHelperConfirmed, 'https://example.test/b', now, 'es')).toMatch(/DESCRIPTION:Con .+\. Detalles y dirección: https:\/\/example\.test\/b/);
  });

  it('ends the sentence after a name with the initial’s own stop, not two (Spanish pass, 2026-11-21)', () => {
    const now = new Date('2026-11-14T15:00:00.000Z');
    for (const locale of ['en', 'es'] as const) {
      const description = bookingCalendarFile(deskBookingHelperConfirmed, 'https://example.test/b', now, locale).replace(/\r\n /g, '').split('\r\n').find((line) => line.startsWith('DESCRIPTION:'));
      expect(description).toMatch(/ [A-Z]\. (Details|Detalles)/);
      expect(description).not.toContain('..');
    }
  });
});
