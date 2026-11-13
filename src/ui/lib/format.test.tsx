/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { formattersFor, useFormat } from './format';

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

  it('binds each language once, so components get the same functions every render', () => {
    expect(formattersFor('es')).toBe(formattersFor('es'));
    expect(formattersFor('es').formatDate('2026-11-21T16:30:00.000Z', { withYear: true })).toBe('sáb, 21 de nov de 2026');
  });
});
