/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionResult } from '@/contracts';
import { onboardingPhoneStep } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import { PhoneStep } from './phone-step';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));
beforeEach(() => vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('helper setup’s phone step', () => {
  it('says the number the code went to as people write it, however it was typed (journeys on a phone, J-H4)', async () => {
    const onStartPhone = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'sent' }));
    render(<NextIntlClientProvider locale="en" messages={uiMessages}><PhoneStep verification={onboardingPhoneStep.verification} handlers={{ onStartPhone, onConfirmPhone: vi.fn() }} /></NextIntlClientProvider>);
    await userEvent.type(screen.getByLabelText('Mobile number'), '3526131119');
    await userEvent.click(screen.getByRole('button', { name: 'Text me a code' }));
    expect(await screen.findByText((_, element) => element?.tagName === 'P' && element.textContent === 'We texted a 6-digit code to (352) 613-1119.')).toBeInTheDocument();
    expect(onStartPhone).toHaveBeenCalledWith({ phone: '3526131119' });
  });
});
