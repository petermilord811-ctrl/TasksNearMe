/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { fakeAccountHandlers, jordanAccountData, mayaAccountData } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { AccountAskAlerts } from './account-ask-alerts';
import { AccountScreen } from './account-screen';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() }) }));
afterEach(cleanup);
const wrap = (node: React.ReactNode) => render(<NextIntlClientProvider locale="en" messages={messages} timeZone="America/Chicago">{node}</NextIntlClientProvider>);

/** "Neighbors asking about my services" (2026-11-24). */
describe('AccountAskAlerts', () => {
  it('turns ask alerts off, and back as it was when that fails', async () => {
    const onSave = vi.fn(async () => ({ ok: false as const, code: 'unknown' as const }));
    wrap(<AccountAskAlerts enabled onSave={onSave} />);
    const toggle = screen.getByRole('switch', { name: /Tell me when neighbors ask/ });
    expect(toggle).toHaveProperty('checked', true);
    fireEvent.click(toggle);
    expect(onSave).toHaveBeenCalledWith({ enabled: false });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe("That didn't save. Try again."));
    expect(toggle).toHaveProperty('checked', true);
  });

  it('shows on a helper’s account page only', () => {
    wrap(<AccountScreen data={jordanAccountData} handlers={fakeAccountHandlers} />);
    expect(screen.getByRole('heading', { name: 'Neighbors asking about your services' })).toBeDefined();
    cleanup();
    wrap(<AccountScreen data={mayaAccountData} handlers={fakeAccountHandlers} />);
    expect(screen.queryByRole('heading', { name: 'Neighbors asking about your services' })).toBeNull();
  });
});
