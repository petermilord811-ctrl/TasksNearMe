/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReportPageData, ReportPageHandlers } from '@/contracts';
import { fakeHandler, reportHelperData, reportReviewData, reportTaskData } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import copy from '../../../../messages/en/ui/report.json';
import safety from '../../../../messages/en/ui/safety.json';
import { ReportScreen } from './report-screen';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function mount(data: ReportPageData = reportTaskData) {
  const onReport = vi.fn<ReportPageHandlers['onReport']>(fakeHandler({ ok: true, code: 'submitted' }, 0));
  render(<NextIntlClientProvider locale="en" messages={uiMessages}><ReportScreen data={data} handlers={{ onReport }} /></NextIntlClientProvider>);
  return onReport;
}

describe('ReportScreen', () => {
  it.each([
    [reportTaskData, copy.title.task, reportTaskData.target.name],
    [reportHelperData, copy.title.helper, reportHelperData.target.name],
    [reportReviewData, copy.title.review, `A review by ${reportReviewData.target.name}`],
  ] as const)('names what is reported', (data, title, subject) => {
    mount(data);
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeVisible();
    expect(screen.getByText(subject)).toBeVisible();
    expect(screen.getByRole('link', { name: copy.back[data.target.kind] })).toHaveAttribute('href', data.backHref);
  });

  it('asks for a reason and details, sends them, and thanks the reporter', async () => {
    const user = userEvent.setup();
    const onReport = mount();
    await user.click(screen.getByRole('button', { name: safety.send }));
    expect(await screen.findByText(safety.reasonRequired)).toBeVisible();
    expect(onReport).not.toHaveBeenCalled();
    await user.click(screen.getByRole('radio', { name: safety.reasons.scam_or_fraud }));
    await user.type(screen.getByRole('textbox', { name: safety.details }), 'Asks for a gift card deposit before any work.');
    await user.click(screen.getByRole('button', { name: safety.send }));
    await waitFor(() => expect(onReport).toHaveBeenCalledWith({ reason: 'scam_or_fraud', details: 'Asks for a gift card deposit before any work.' }));
    expect(await screen.findByText(safety.submitted)).toBeVisible();
    await user.click(screen.getByRole('button', { name: safety.done }));
    expect(navigation.push).toHaveBeenCalledWith(reportTaskData.backHref);
  });
});
