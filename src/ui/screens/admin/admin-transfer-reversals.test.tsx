/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { agentReversals, financeReversals } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import { AdminTransferReversals } from './admin-transfer-reversals';

const navigation = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
afterEach(cleanup);
const withMessages = (node: React.ReactNode) => <NextIntlClientProvider locale="en" timeZone="America/Chicago" messages={uiMessages}>{node}</NextIntlClientProvider>;

describe('AdminTransferReversals', () => {
  it('lets finance take part of a transfer back, never more than is left, and says when Stripe can’t', async () => {
    const onReverseTransfer = vi.fn().mockResolvedValue({ ok: false, code: 'insufficient_funds' });
    render(withMessages(<AdminTransferReversals data={financeReversals} onReverseTransfer={onReverseTransfer} />));
    await userEvent.click(screen.getByRole('button', { name: 'Take back from the helper' }));
    const dialog = within(screen.getByRole('alertdialog'));
    const amount = dialog.getByLabelText('Amount');
    await userEvent.clear(amount);
    await userEvent.type(amount, '60.01');
    await userEvent.type(dialog.getByLabelText('Why'), 'Chargeback lost: half the work was done.');
    await userEvent.click(dialog.getByRole('button', { name: 'Take it back' }));
    expect(await dialog.findByText('At most $60.00 is left to take back.')).toBeTruthy();
    expect(onReverseTransfer).not.toHaveBeenCalled();

    await userEvent.clear(amount);
    await userEvent.type(amount, '30.00');
    await userEvent.click(dialog.getByRole('button', { name: 'Take it back' }));
    expect(onReverseTransfer).toHaveBeenCalledWith({ earningsId: 'ern_desk', amountCents: 3000, caseId: 'case_chargeback_desk', reason: 'Chargeback lost: half the work was done.' });
    expect(await dialog.findByText(/Stripe couldn't take it back/)).toBeTruthy();
  });

  it('shows an agent the history without the form', () => {
    render(withMessages(<AdminTransferReversals data={agentReversals} />));
    expect(screen.queryByRole('button', { name: 'Take back from the helper' })).toBeNull();
    expect(screen.getByText(/\$30\.00 not taken back/)).toBeTruthy();
    expect(screen.getByText(/\$30\.00 taken back by Casey W\./)).toBeTruthy();
  });
});
