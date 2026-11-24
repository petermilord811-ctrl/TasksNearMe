/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routes, type ActionResult, type ThankYouHandlers } from '@/contracts';
import { jordanPublicThanks, jordanQuietHoursOnAccountData, QUIET_UNTIL, thanksNoteClientEditable, thanksNoteClientLocked, thanksNoteHelper, thanksNoteHelperHidden } from '@/fixtures';
import uiMessages from '../../../../messages/en/ui';
import { AccountQuietHours } from '@/ui/screens/account/account-quiet-hours';
import { QuietHoursNote } from '@/ui/components/messaging/quiet-hours-note';
import { PublicThankYouNotes } from './public-thank-you-notes';
import { ThankYouNoteCard, ThanksOffer } from './thank-you-note';

const wrap = (node: ReactNode) => render(<NextIntlClientProvider locale="en" messages={uiMessages}>{node}</NextIntlClientProvider>);
const ok = (code: 'updated' | 'sent' | 'saved' = 'updated') => vi.fn(async (): Promise<ActionResult> => ({ ok: true, code }));
const handlers = (): ThankYouHandlers => ({ onSave: ok('sent'), onDelete: ok(), onShowOnProfile: ok(), onHideName: ok() });

// Radix switches and checkboxes measure themselves.
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ThankYouNoteCard', () => {
  it("the helper reads it masked, can show it on their profile, and report it", async () => {
    const h = handlers();
    wrap(<ThankYouNoteCard note={thanksNoteHelper} name="Maya R." handlers={h} />);
    expect(screen.getByRole('heading', { name: 'Maya R. sent you a thank-you note' })).toBeInTheDocument();
    expect(screen.queryByText(/555/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: /Show on my profile/ }));
    await waitFor(() => expect(h.onShowOnProfile).toHaveBeenCalledWith({ noteId: 'tyn_desk', shown: true }));
    expect(screen.getByRole('link', { name: 'Report this note' })).toHaveAttribute('href', routes.app.report('thanks', 'tyn_desk'));
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('a switch that fails goes back and says so', async () => {
    const h = { ...handlers(), onShowOnProfile: vi.fn(async (): Promise<ActionResult> => ({ ok: false, code: 'not_allowed' })) };
    wrap(<ThankYouNoteCard note={thanksNoteHelper} name="Maya R." handlers={h} />);
    const toggle = screen.getByRole('switch', { name: /Show on my profile/ });
    fireEvent.click(toggle);
    expect(await screen.findByText("That didn't work. Try again.")).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('hidden by our team: the helper sees no words and no switch', () => {
    wrap(<ThankYouNoteCard note={thanksNoteHelperHidden} name="Maya R." handlers={handlers()} />);
    expect(screen.getByText('Our team hid this note after a report.')).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Report this note' })).not.toBeInTheDocument();
  });

  it('the client edits within 24 hours, hides their name, and deletes after confirming', async () => {
    const h = handlers();
    wrap(<ThankYouNoteCard note={thanksNoteClientEditable} name="Jordan T." handlers={h} />);
    expect(screen.getByText('Jordan T. shows it on their profile')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: /Don't show my name/ }));
    await waitFor(() => expect(h.onHideName).toHaveBeenCalledWith({ noteId: 'tyn_desk', hidden: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete note' }));
    await waitFor(() => expect(h.onDelete).toHaveBeenCalledWith({ noteId: 'tyn_desk' }));
  });

  it('past 24 hours there is no Edit', () => {
    wrap(<ThankYouNoteCard note={thanksNoteClientLocked} name="Jordan T." handlers={handlers()} />);
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.getByText("Not on Jordan T.'s profile")).toBeInTheDocument();
  });
});

describe('ThanksOffer', () => {
  it('writes a note of up to 280 characters, with "Don\'t show my name"', async () => {
    const onSave = ok('sent');
    wrap(<ThanksOffer bookingId="bkg_desk" name="Jordan" onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: 'Write a thank-you note' }));
    const box = await screen.findByRole('textbox', { name: 'Your note' });
    fireEvent.change(box, { target: { value: 'x'.repeat(281) } });
    fireEvent.click(screen.getByRole('button', { name: 'Send note' }));
    expect(await screen.findByText('Keep it to 280 characters.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.change(box, { target: { value: 'Thank you for the desk!' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Don't show my name/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Send note' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ bookingId: 'bkg_desk', body: 'Thank you for the desk!', hideName: true }));
  });
});

describe('PublicThankYouNotes', () => {
  it('names the client by first name and area, or "A client in" the area', () => {
    wrap(<PublicThankYouNotes notes={jordanPublicThanks} />);
    expect(screen.getByText(/Maya in Hyde Park/)).toBeInTheDocument();
    expect(screen.getByText(/A client in Mueller/)).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(6);
  });
});

describe('quiet hours', () => {
  it("the sender's note says when the other person will see it, on the reader's clock", () => {
    wrap(<QuietHoursNote name="Jordan" until={QUIET_UNTIL} />);
    expect(screen.getByRole('note')).toHaveTextContent(/^Jordan's quiet hours: they'll see this after 9:00/i);
  });

  it('the setting saves the times, refuses the same start and end, and turning it off saves at once', async () => {
    const onSave = vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated' }));
    wrap(<AccountQuietHours setting={jordanQuietHoursOnAccountData.quietHours!} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText('Until'), { target: { value: '21:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save quiet hours' }));
    expect(await screen.findByText('Choose a start and an end that are different.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Until'), { target: { value: '06:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save quiet hours' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ enabled: true, startsAt: '21:30', endsAt: '06:30' }));
    fireEvent.click(screen.getByRole('switch', { name: /Quiet hours/ }));
    await waitFor(() => expect(onSave).toHaveBeenLastCalledWith({ enabled: false, startsAt: '21:30', endsAt: '06:30' }));
  });
});
