/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import { routes } from '@/contracts';
import messages from '../../../../messages/en/ui';
import esMessages from '../../../../messages/es/ui';
import { PageUnavailableScreen } from './page-unavailable-screen';

afterEach(cleanup);

describe('PageUnavailableScreen (2026-11-23: no silent bounce to Home)', () => {
  it('says the page can’t open for the account, with the way home and to support', () => {
    render(<NextIntlClientProvider locale="en" messages={messages}><PageUnavailableScreen /></NextIntlClientProvider>);
    expect(screen.getByRole('heading', { level: 2, name: messages.notFound.unavailable.title })).toBeDefined();
    expect(screen.getByText(messages.notFound.unavailable.body)).toBeDefined();
    expect(screen.getByRole('link', { name: messages.notFound.unavailable.home }).getAttribute('href')).toBe(routes.app.home());
    expect(screen.getByRole('link', { name: messages.notFound.unavailable.help }).getAttribute('href')).toBe(routes.app.support());
  });

  it('says it in Spanish too', () => {
    render(<NextIntlClientProvider locale="es" messages={esMessages}><PageUnavailableScreen /></NextIntlClientProvider>);
    expect(screen.getByRole('heading', { level: 2, name: esMessages.notFound.unavailable.title })).toBeDefined();
  });
});
