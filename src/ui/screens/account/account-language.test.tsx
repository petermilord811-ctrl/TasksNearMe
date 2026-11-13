/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ActionResult } from '@/contracts';
import messages from '../../../../messages/en/ui';
import { AccountLanguage } from './account-language';

const assign = vi.fn();
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

function mount(onSave = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated' }))) {
  vi.stubGlobal('location', { pathname: '/es/app/account', search: '?tab=1', hash: '', assign });
  render(<NextIntlClientProvider locale="en" messages={messages}><AccountLanguage language="en" onSave={onSave} /></NextIntlClientProvider>);
  return onSave;
}

describe('AccountLanguage', () => {
  it('names each language in itself, with the account’s chosen', () => {
    mount();
    expect(screen.getByRole('radio', { name: 'English' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Español' })).not.toBeChecked();
    expect(screen.getByText('Español').getAttribute('lang')).toBe('es');
  });

  it('saves the choice, then loads the page again without a language in its address', async () => {
    const user = userEvent.setup();
    const onSave = mount();
    await user.click(screen.getByRole('radio', { name: 'Español' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/app/account?tab=1'));
    expect(onSave).toHaveBeenCalledWith({ locale: 'es' });
  });

  it('says so when it can’t save, and stays as it was', async () => {
    const user = userEvent.setup();
    mount(vi.fn(async (): Promise<ActionResult> => ({ ok: false, code: 'validation_failed' })));
    await user.click(screen.getByRole('radio', { name: 'Español' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(messages.account.language.failed);
    expect(assign).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: 'English' })).toBeChecked();
  });
});
