/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { AdminCaseSummary, AiAssistResult } from '@/contracts';
import { adminCaseSummary, adminCaseSummaryResult } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { AdminCaseSummaryCard } from './admin-case-summary';

afterEach(cleanup);

const copy = messages.adminCase.summary;

function show(onSummarize: () => Promise<AiAssistResult<AdminCaseSummary>>) {
  render(<NextIntlClientProvider locale="en" messages={messages} onError={(error) => { throw error; }}><AdminCaseSummaryCard onSummarize={onSummarize} /></NextIntlClientProvider>);
}

describe('Summarize with AI on a case', () => {
  it('shows what happened and what is still open, said to be made with AI', async () => {
    const user = userEvent.setup();
    const onSummarize = vi.fn(async () => adminCaseSummaryResult);
    show(onSummarize);
    await user.click(screen.getByRole('button', { name: copy.button }));
    expect(onSummarize).toHaveBeenCalledExactlyOnceWith({});
    expect(await screen.findByText(adminCaseSummary.points[0]!)).toBeVisible();
    expect(screen.getByRole('heading', { level: 3, name: copy.open })).toBeVisible();
    expect(screen.getByText(adminCaseSummary.open[0]!)).toBeVisible();
    expect(screen.getByText(copy.caption)).toBeVisible();
    expect(screen.getByRole('button', { name: copy.again })).toBeVisible();
  });

  it('says why when it could not', async () => {
    const user = userEvent.setup();
    show(async () => ({ ok: false, code: 'not_found' }));
    await user.click(screen.getByRole('button', { name: copy.button }));
    expect(await screen.findByText(copy.errors.not_found)).toBeVisible();
  });
});
