/** @vitest-environment jsdom */
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { routes, type ActionResult, type NeighborGroupHandlers, type NeighborGroupView } from '@/contracts';
import { fakeNeighborGroupHandlers, groupViewChat, groupViewChatReadOnly, groupViewChatUnread } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { NeighborGroupPanel } from './neighbor-group-sheet';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation, usePathname: () => '/app/community' }));
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 0) as unknown as number);
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

// A missing or misnamed copy key fails the test instead of showing the key.
const wrap = (node: React.ReactNode) => render(<NextIntlClientProvider locale="en" timeZone="America/Chicago" messages={messages} onError={(error) => { throw error; }}>{node}</NextIntlClientProvider>);
const panel = (view: NeighborGroupView = groupViewChat, handlers: NeighborGroupHandlers = fakeNeighborGroupHandlers([view]), extra: { onReload?: () => void; initialTyping?: string[] } = {}) =>
  wrap(<NeighborGroupPanel view={view} handlers={handlers} onReload={extra.onReload ?? vi.fn()} onClose={vi.fn()} {...(extra.initialTyping ? { initialTyping: extra.initialTyping } : {})} />);
const bubble = (id: string) => document.querySelector<HTMLElement>(`[data-message-id="${id}"] article`)!;

/** Group chat as in a conversation (2026-11-24, owner: "Group chat feature is not fully implemented yet"). */
describe('a building group’s chat', () => {
  it('shows photos and a GIF in the bubbles, and a photo opens larger', async () => {
    panel();
    const ben = bubble('ngmsg_c4');
    expect(within(ben).getAllByRole('button', { name: /^View photo: / })).toHaveLength(2);
    expect(within(bubble('ngmsg_c5')).getByRole('button', { name: 'View GIF larger: Thank you' })).toBeInTheDocument();
    fireEvent.click(within(bubble('ngmsg_c1')).getByRole('button', { name: 'View photo: The package room with its new lock' }));
    expect(await screen.findByRole('dialog', { name: 'Photo 1 of 1' })).toBeInTheDocument();
  });

  it('names each neighbor at the start of their run, never you, and keeps contact details masked', () => {
    panel();
    // Maya's two messages in a row: her own, unnamed on screen.
    expect(within(bubble('ngmsg_c2')).getByText('You')).toHaveClass('sr-only');
    expect(within(bubble('ngmsg_c1')).getByText('Ana P.')).not.toHaveClass('sr-only');
    const ana = bubble('ngmsg_c6');
    expect(ana.textContent).toContain('•••-•••-0147 (hidden)');
    expect(ana.textContent).not.toMatch(/512/);
    // No booking ever shows them in a group: never "hidden until booking".
    expect(ana.textContent).not.toMatch(/booking/);
  });

  it('quotes the message a reply answers, its photo too, and says when the quoted one is gone or hidden', () => {
    const view: NeighborGroupView = {
      ...groupViewChat,
      messages: [
        ...groupViewChat.messages,
        { ...groupViewChat.messages[6]!, id: 'ngmsg_c8', replyTo: { id: 'ngmsg_x', status: 'hidden', segments: [] } },
      ],
    };
    panel(view);
    const quote = bubble('ngmsg_c2').querySelector('blockquote')!;
    expect(quote.textContent).toContain('Ana P.: Package room is open again');
    expect(quote.textContent).toContain('Photo');
    expect(bubble('ngmsg_c7').querySelector('blockquote')!.textContent).toBe('Ben W.: Message deleted');
    expect(bubble('ngmsg_c8').querySelector('blockquote')!.textContent).toBe("A message you can't see");
  });

  it('reacts from the row under the bubble, and takes a reaction back from its pill', async () => {
    const handlers = fakeNeighborGroupHandlers([groupViewChat]);
    const onReact = vi.spyOn(handlers, 'onReact');
    const onReload = vi.fn();
    panel(groupViewChat, handlers, { onReload });
    const ana = bubble('ngmsg_c1');
    // Hers: 👍 3 (one of them yours) and 🎉 1.
    const pills = within(ana).getByRole('list', { name: 'Reactions' });
    expect(within(pills).getByRole('button', { name: /Thumbs up/ })).toHaveAttribute('aria-pressed', 'true');
    await act(async () => fireEvent.click(within(pills).getByRole('button', { name: /Thumbs up/ })));
    expect(onReact).toHaveBeenCalledWith({ messageId: 'ngmsg_c1', emoji: 'thumbs_up', on: false });
    await waitFor(() => expect(onReload).toHaveBeenCalled());
    fireEvent.click(within(bubble('ngmsg_c4')).getByRole('button', { name: 'React' }));
    const picker = await screen.findByRole('toolbar', { name: "Reactions to Ben W.'s message" });
    await act(async () => fireEvent.click(within(picker).getByRole('button', { name: 'Heart' })));
    expect(onReact).toHaveBeenLastCalledWith({ messageId: 'ngmsg_c4', emoji: 'heart', on: true });
    // It shows at once, before the group is read again.
    expect(within(within(bubble('ngmsg_c4')).getByRole('list', { name: 'Reactions' })).getByRole('button', { name: /Heart/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('takes a reaction back when it fails', async () => {
    const handlers = fakeNeighborGroupHandlers([groupViewChat]);
    vi.spyOn(handlers, 'onReact').mockResolvedValue({ ok: false, code: 'rate_limited' } as ActionResult);
    panel(groupViewChat, handlers);
    fireEvent.click(within(bubble('ngmsg_c3')).getByRole('button', { name: 'React' }));
    const picker = await screen.findByRole('toolbar', { name: 'Reactions to your message' });
    await act(async () => fireEvent.click(within(picker).getByRole('button', { name: 'Fire' })));
    await waitFor(() => expect(within(bubble('ngmsg_c3')).queryByRole('list', { name: 'Reactions' })).toBeNull());
  });

  it('replies to a message: the composer says to whom, and the message goes with what it answers', async () => {
    const handlers = fakeNeighborGroupHandlers([groupViewChat]);
    const onSend = vi.spyOn(handlers, 'onSend');
    panel(groupViewChat, handlers);
    fireEvent.click(within(bubble('ngmsg_c4')).getByRole('button', { name: 'Reply' }));
    expect(screen.getByText('Replying to Ben W.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Message to Mueller Lofts residents'), { target: { value: 'Where is that?' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send' })));
    expect(onSend).toHaveBeenCalledWith({ groupId: 'ngrp_lofts', body: 'Where is that?', attachmentIds: [], replyToId: 'ngmsg_c4', requestKey: expect.any(String) });
    await waitFor(() => expect(screen.queryByText('Replying to Ben W.')).toBeNull());
  });

  it('sends a photo from the paperclip with the group’s own upload', async () => {
    const handlers = fakeNeighborGroupHandlers([groupViewChat]);
    const onUploadPhoto = vi.spyOn(handlers, 'onUploadPhoto');
    const onSend = vi.spyOn(handlers, 'onSend');
    panel(groupViewChat, handlers);
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [new File(['x'], 'pond.jpg', { type: 'image/jpeg' })] } });
    await waitFor(() => expect(onUploadPhoto).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('list', { name: 'Photos to send' })).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send' })));
    expect(onSend).toHaveBeenCalledWith(expect.objectContaining({ groupId: 'ngrp_lofts', body: '', attachmentIds: ['fil_group_path'] }));
  });

  it('deletes your own message after asking', async () => {
    const handlers = fakeNeighborGroupHandlers([groupViewChat]);
    const onDelete = vi.spyOn(handlers, 'onDeleteMessage');
    const onReload = vi.fn();
    panel(groupViewChat, handlers, { onReload });
    expect(within(bubble('ngmsg_c1')).queryByRole('button', { name: 'Delete your message' })).toBeNull();
    fireEvent.click(within(bubble('ngmsg_c3')).getByRole('button', { name: 'Delete your message' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete this message?' });
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' })));
    expect(onDelete).toHaveBeenCalledWith({ messageId: 'ngmsg_c3' });
    await waitFor(() => expect(onReload).toHaveBeenCalled());
  });

  it('reports someone else’s message over the page, from the row or a long press', async () => {
    vi.useFakeTimers();
    panel();
    expect(within(bubble('ngmsg_c4')).getByRole('link', { name: 'Report this message from Ben W.' })).toHaveAttribute('href', routes.app.report('group_message', 'ngmsg_c4'));
    expect(within(bubble('ngmsg_c3')).queryByRole('link', { name: /^Report/ })).toBeNull();
    // A long press: the picker with Reply, Copy and Report (Delete on your own).
    fireEvent.pointerDown(bubble('ngmsg_c4'), { pointerType: 'touch', clientX: 10, clientY: 10 });
    await act(async () => { vi.advanceTimersByTime(500); });
    const picker = screen.getByRole('dialog', { name: "Reactions to Ben W.'s message" });
    expect(within(picker).getByRole('button', { name: 'Reply' })).toBeInTheDocument();
    expect(within(picker).getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    expect(within(picker).getByRole('link', { name: 'Report this message from Ben W.' })).toBeInTheDocument();
    expect(within(picker).queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('puts "New messages" above what came since the group was last read', () => {
    panel(groupViewChatUnread);
    const items = Array.from(document.querySelectorAll('[role="log"] ol > li'));
    const line = items.findIndex((item) => item.textContent === 'New messages');
    expect(line).toBeGreaterThan(0);
    expect(items[line + 1]?.getAttribute('data-message-id')).toBe('ngmsg_c4');
    cleanup();
    panel(groupViewChat);
    expect(screen.queryByText('New messages')).toBeNull();
  });

  it('says who is typing in the header, in place of the group’s line', () => {
    panel(groupViewChat, undefined, { initialTyping: ['usr_ana'] });
    expect(screen.getByText('Ana P. is typing…')).toBeInTheDocument();
    // In the group's line's place (the same cell, so the header keeps its height).
    expect(screen.getByText(/Building · Mueller/)).toHaveClass('invisible');
    cleanup();
    panel(groupViewChat, undefined, { initialTyping: ['usr_ana', 'usr_ben'] });
    expect(screen.getByText('Ana P. and Ben W. are typing…')).toBeInTheDocument();
    cleanup();
    panel(groupViewChat, undefined, { initialTyping: ['usr_ana', 'usr_ben', 'usr_chris'] });
    expect(screen.getByText('Several people are typing…')).toBeInTheDocument();
  });

  it('offers no reacting or replying to an account that can’t write, and its photos still open', () => {
    panel(groupViewChatReadOnly);
    expect(screen.queryByRole('button', { name: 'React' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reply' })).toBeNull();
    expect(within(within(bubble('ngmsg_c1')).getByRole('list', { name: 'Reactions' })).getByRole('button', { name: /Thumbs up/ })).toBeDisabled();
    expect(within(bubble('ngmsg_c1')).getByRole('button', { name: 'View photo: The package room with its new lock' })).toBeInTheDocument();
    expect(screen.getByText("Your account can't send messages right now.")).toBeInTheDocument();
  });
});
