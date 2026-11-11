/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { ACTION_ERROR_CODES, routes, type ActionResult, type SavedHelperHandlers, type SavedHelpersPageData } from '@/contracts';
import { fakeSavedHelperHandlers, mayaSavedHelpersData, savedHelpersEmptyData } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import savedHelpers from '../../../../messages/en/ui/savedHelpers.json';
import { SavedHelpersScreen } from './saved-helpers-screen';

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

function content(data: SavedHelpersPageData = mayaSavedHelpersData, handlers: SavedHelperHandlers = fakeSavedHelperHandlers) {
  return <NextIntlClientProvider locale="en" messages={{ ...messages, savedHelpers }}><SavedHelpersScreen data={data} handlers={handlers} /></NextIntlClientProvider>;
}

describe('SavedHelpersScreen', () => {
  it('shows supplied helpers in order, profile routes, and separately labelled removal controls', () => {
    render(content());
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Saved helpers', level: 1 })).toBeVisible();
    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(mayaSavedHelpersData.helpers.map((helper) => helper.displayName));
    for (const helper of mayaSavedHelpersData.helpers) {
      expect(screen.getByRole('link', { name: helper.displayName })).toHaveAttribute('href', routes.helperProfile(helper.handle));
      expect(screen.getByRole('button', { name: `Remove ${helper.displayName} from saved helpers` })).toBeEnabled();
    }
  });

  it('links an empty list to bookings', () => {
    render(content(savedHelpersEmptyData));
    expect(screen.getByRole('heading', { name: savedHelpers.emptyTitle })).toBeVisible();
    expect(screen.getByRole('link', { name: 'View bookings' })).toHaveAttribute('href', routes.app.bookings());
    expect(screen.queryByRole('button', { name: /^Remove / })).not.toBeInTheDocument();
  });

  it('sends saved false once, announces pending and removal, restores focus, and refreshes', async () => {
    const user = userEvent.setup();
    let resolve!: (result: ActionResult) => void;
    const onToggleSaved = vi.fn(() => new Promise<ActionResult>((done) => { resolve = done; }));
    const helper = mayaSavedHelpersData.helpers[0];
    render(content(mayaSavedHelpersData, { onToggleSaved }));
    await user.click(screen.getByRole('button', { name: `Remove ${helper.displayName} from saved helpers` }));
    const pending = screen.getByRole('button', { name: `Removing ${helper.displayName} from saved helpers` });
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute('aria-busy', 'true');
    expect(pending.querySelector('svg')).not.toBeNull();
    await user.click(pending);
    expect(onToggleSaved).toHaveBeenCalledTimes(1);
    expect(onToggleSaved).toHaveBeenCalledWith({ helperId: helper.id, saved: false });
    expect(router.refresh).not.toHaveBeenCalled();
    await act(async () => resolve({ ok: true, code: 'updated' }));
    expect(screen.getByText(`${helper.displayName} was removed from saved helpers.`)).toBeVisible();
    expect(screen.getByRole('button', { name: `${helper.displayName} removed from saved helpers` })).toBeDisabled();
    expect(screen.getByRole('heading', { name: '3 saved helpers' })).toHaveFocus();
    expect(router.refresh).toHaveBeenCalledOnce();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('preserves the confirmation when refreshed props remove the last helper', async () => {
    const user = userEvent.setup();
    const helper = mayaSavedHelpersData.helpers[0];
    const handlers: SavedHelperHandlers = { onToggleSaved: vi.fn().mockResolvedValue({ ok: true, code: 'updated' }) };
    const view = render(content({ helpers: [helper] }, handlers));
    await user.click(screen.getByRole('button', { name: `Remove ${helper.displayName} from saved helpers` }));
    view.rerender(content(savedHelpersEmptyData, handlers));
    expect(screen.getByText(`${helper.displayName} was removed from saved helpers.`)).toBeVisible();
    expect(screen.getByRole('heading', { name: savedHelpers.emptyTitle })).toBeVisible();
  });

  it.each(ACTION_ERROR_CODES)('shows friendly %s feedback and allows retry without changing supplied data', async (code) => {
    const user = userEvent.setup();
    const helper = mayaSavedHelpersData.helpers[0];
    const onToggleSaved = vi.fn().mockResolvedValue({ ok: false, code, fieldErrors: code === 'validation_failed' ? { helperId: ['invalid'] } : undefined });
    render(content(mayaSavedHelpersData, { onToggleSaved }));
    const button = screen.getByRole('button', { name: `Remove ${helper.displayName} from saved helpers` });
    await user.click(button);
    await waitFor(() => expect(button).toBeEnabled());
    const expected = code === 'not_found' || code === 'unknown' ? savedHelpers.errors[code] : (messages.forms.actionErrors as Record<string, string>)[code] ?? messages.feedback.error[code];
    expect(screen.getByRole('status')).toHaveTextContent(expected);
    expect(screen.getByRole('link', { name: messages.forms.getHelp })).toHaveAttribute('href', routes.help());
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(3);
    expect(router.refresh).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('maps rejected handlers to unknown feedback', async () => {
    const user = userEvent.setup();
    render(content(mayaSavedHelpersData, { onToggleSaved: vi.fn().mockRejectedValue(new Error('offline')) }));
    await user.click(screen.getAllByRole('button', { name: /^Remove / })[0]);
    expect(await screen.findByText(savedHelpers.errors.unknown)).toBeVisible();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('follows successful redirectTo with router.push', async () => {
    const user = userEvent.setup();
    const redirectTo = routes.app.saved();
    render(content(mayaSavedHelpersData, { onToggleSaved: vi.fn().mockResolvedValue({ ok: true, code: 'updated', redirectTo }) }));
    await user.click(screen.getAllByRole('button', { name: /^Remove / })[0]);
    expect(router.push).toHaveBeenCalledWith(redirectTo);
  });
});
