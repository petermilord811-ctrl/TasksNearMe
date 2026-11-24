/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { routes } from '@/contracts';
import messages from '../../../../messages/en/ui';
import { IdentityCheckDialog } from './identity-check-dialog';
import { RouteDialogFrame } from './route-dialog-frame';

const navigation = vi.hoisted(() => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
afterEach(cleanup);

describe('IdentityCheckDialog', () => {
  it('says why in the dialog, opens the check in a new tab, and looks again when you say you’ve finished', async () => {
    const user = userEvent.setup();
    const verifyHref = routes.app.verifyIdentity(routes.app.requestHelper('jordan-t'));
    render(<NextIntlClientProvider locale="en" messages={messages}>
      <RouteDialogFrame><IdentityCheckDialog reason="staff_request" verifyHref={verifyHref} /></RouteDialogFrame>
    </NextIntlClientProvider>);
    const dialog = screen.getByRole('dialog', { name: 'Verify your identity first' });
    expect(dialog).toHaveAccessibleDescription(messages.posterIdentity.reasons.staff_request);
    const verify = screen.getByRole('link', { name: 'Verify in a new tab' });
    expect(verify).toHaveAttribute('href', verifyHref);
    expect(verify).toHaveAttribute('target', '_blank');
    expect(screen.queryByRole('status')).toBeNull();
    await user.click(screen.getByRole('button', { name: "I've finished" }));
    expect(navigation.refresh).toHaveBeenCalledTimes(1);
    // Still not verified (the page under it didn't change): it says so, and stays.
    expect(await screen.findByRole('status')).toHaveTextContent(messages.peek.idCheck.stillNeeded);
  });
});
