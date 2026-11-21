/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import en from '../../../../messages/en/ui/errorPage.json';
import es from '../../../../messages/es/ui/errorPage.json';
import { ErrorScreen } from './error-screen';

afterEach(cleanup);

describe('ErrorScreen (when things break, 2026-11-21)', () => {
  it('says the page failed, offers Try again and the way home, and gives support a reference', async () => {
    const retry = vi.fn();
    render(<ErrorScreen locale="en" digest="2786430451" onRetry={retry} />);
    expect(screen.getByRole('heading', { level: 1, name: en.title })).toBeInTheDocument();
    expect(screen.getByText(en.body)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: en.retry }));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.getByRole('link', { name: en.home })).toHaveAttribute('href', '/');
    expect(screen.getByText('Reference: 2786430451')).toBeInTheDocument();
  });

  it('speaks Spanish on a Spanish page, and leaves the reference out when there is none', () => {
    render(<ErrorScreen locale="es" onRetry={() => {}} />);
    expect(screen.getByRole('heading', { level: 1, name: es.title })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: es.retry })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: es.home })).toHaveAttribute('href', '/es');
    expect(screen.queryByText(/Referencia/)).toBeNull();
  });
});
