/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { formattersFor, useFormat } from './format';
import { TimeZoneProvider } from './time-zone-provider';

afterEach(cleanup);

function When({ at }: { at: string }) {
  const { formatDateTime, formatRelative } = useFormat();
  return <p>{formatDateTime(at)} ({formatRelative(at, '2026-11-21T18:30:00.000Z')})</p>;
}

describe('useFormat', () => {
  it('formats in the page’s language', () => {
    render(<NextIntlClientProvider locale="es" messages={{}}><When at="2026-11-21T16:30:00.000Z" /></NextIntlClientProvider>);
    expect(screen.getByText('sáb, 21 de nov · 10:30 a.m. (hace 2 horas)')).toBeInTheDocument();
  });

  it('formats in English on an English page', () => {
    render(<NextIntlClientProvider locale="en" messages={{}}><When at="2026-11-21T16:30:00.000Z" /></NextIntlClientProvider>);
    expect(screen.getByText('Sat, Nov 21 · 10:30 am (2 hours ago)')).toBeInTheDocument();
  });

  it('formats in the zone it is given, or the page’s, or the default market’s (plan 8.1)', () => {
    function At({ zone }: { zone?: string }) {
      const { formatTime, dayKey, timeZone } = useFormat(zone);
      return <p>{timeZone}: {formatTime('2026-11-22T05:30:00.000Z')} {dayKey('2026-11-22T05:30:00.000Z')}</p>;
    }
    render(
      <NextIntlClientProvider locale="en" messages={{}}>
        <At />
        <TimeZoneProvider timeZone="America/New_York"><At /><At zone="America/Chicago" /></TimeZoneProvider>
      </NextIntlClientProvider>,
    );
    // No zone anywhere: the default market's. The page's provider: Gainesville. An explicit zone wins.
    expect(screen.getAllByText(/^America\/Chicago: 11:30 pm 2026-11-21$/)).toHaveLength(2);
    expect(screen.getByText('America/New_York: 12:30 am 2026-11-22')).toBeInTheDocument();
  });

  it('binds each language once, so components get the same functions every render', () => {
    expect(formattersFor('es')).toBe(formattersFor('es'));
    expect(formattersFor('es', 'America/New_York')).toBe(formattersFor('es', 'America/New_York'));
    expect(formattersFor('es', 'America/New_York')).not.toBe(formattersFor('es'));
    expect(formattersFor('es').formatDate('2026-11-21T16:30:00.000Z', { withYear: true })).toBe('sáb, 21 de nov de 2026');
  });
});
