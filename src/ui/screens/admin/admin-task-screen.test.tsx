/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminTaskOpenData, fakeAdminTaskHandlers } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { AdminTaskScreen } from './admin-task-screen';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }), usePathname: () => '/admin/tasks/tsk_desk' }));
afterEach(cleanup);

function mount(windowStart: string, windowEnd: string) {
  render(<NextIntlClientProvider locale="en" messages={messages}><AdminTaskScreen data={{ ...adminTaskOpenData, task: { ...adminTaskOpenData.task, windowStart, windowEnd } }} handlers={fakeAdminTaskHandlers} now="2026-11-20T15:00:00.000Z" /></NextIntlClientProvider>);
}

describe('the staff task page (staff tools pass, J-S2)', () => {
  it("names a same-day window's day once, on the market's clock", () => {
    mount('2026-11-24T15:00:00.000Z', '2026-11-24T18:00:00.000Z');
    expect(screen.getByText('Tue, Nov 24 · 10:00 am–1:00 pm')).toBeInTheDocument();
  });

  it('names both days of a window that runs past midnight', () => {
    mount('2026-11-25T03:00:00.000Z', '2026-11-25T06:00:00.000Z');
    expect(screen.getByText('Tue, Nov 24 · 10:00 pm–Wed, Nov 25 · 1:00 am')).toBeInTheDocument();
  });
});
