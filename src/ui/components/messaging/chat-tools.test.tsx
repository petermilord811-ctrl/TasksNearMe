/** @vitest-environment jsdom */
import type React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { routes, type ActionResult, type ConversationFlagInput, type ConversationListHandlers, type SendMessageInput, type ThreadHandlers, type ThreadSummary } from '@/contracts';
import { changeCardThreadPageData, fakeHandler, fakeThreadHandlers, mayaFoldersInboxData, mentionMessage, requestCardForHelperPageData, requestThreadPageData } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { MessageComposerContent } from '@/ui/screens/messages/message-composer';
import { MessageLog } from '@/ui/screens/messages/message-log';
import { ReplyProvider } from '@/ui/screens/messages/reply-context';
import { ChangeCardView, TaskRequestCardView } from './conversation-cards';
import { ConversationMenu, RequestBanner } from './conversation-tools';
import { InboxList, keepThread } from './inbox-list';
import { MaskedText } from './masked-text';

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const now = '2026-11-21T16:05:00.000Z';
const wrap = (node: React.ReactNode) => render(<NextIntlClientProvider locale="en" timeZone="America/New_York" messages={messages}>{node}</NextIntlClientProvider>);

/** The chat, 2026-11-23 (owner: "plan all and implement"). */

describe('the viewer’s own list', () => {
  const [pinned, muted, archived, request] = mayaFoldersInboxData.threads as [ThreadSummary, ThreadSummary, ThreadSummary, ThreadSummary];

  it('keeps requests under Requests and archived ones under Archived, out of every other filter', () => {
    expect(keepThread(request, 'all', '')).toBe(false);
    expect(keepThread(request, 'requests', '')).toBe(true);
    expect(keepThread(request, 'unread', '')).toBe(false);
    expect(keepThread(archived, 'all', '')).toBe(false);
    expect(keepThread(archived, 'archived', '')).toBe(true);
    expect(keepThread(archived, 'offers', '')).toBe(false);
    expect(keepThread(pinned, 'all', '')).toBe(true);
    expect(keepThread(muted, 'unread', '')).toBe(true);
  });

  it('offers Requests and Archived when they hold something, marks pinned and muted rows, and pins from a row’s menu', async () => {
    const user = userEvent.setup();
    const handlers: ConversationListHandlers = {
      onFlag: vi.fn(async (_threadId: string, _input: ConversationFlagInput): Promise<ActionResult> => ({ ok: true, code: 'updated' })),
      onAccept: vi.fn(async (_threadId: string): Promise<ActionResult> => ({ ok: true, code: 'updated' })),
    };
    wrap(<InboxList threads={mayaFoldersInboxData.threads} now={now} handlers={handlers} />);
    const list = () => screen.getByRole('list', { name: 'Conversations' });
    expect(within(list()).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('img', { name: 'Pinned' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Muted' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Requests\s*\(1\)$/ }));
    expect(within(list()).getByRole('heading', { name: 'Sam R.' })).toBeInTheDocument();
    // Accept from the row's menu.
    await user.click(screen.getByRole('button', { name: 'Quick actions for your conversation with Sam R.' }));
    await user.click(screen.getByRole('menuitem', { name: 'Accept request' }));
    await waitFor(() => expect(handlers.onAccept).toHaveBeenCalledExactlyOnceWith(request.id));
    await user.click(screen.getByRole('button', { name: 'Archived' }));
    expect(within(list()).getAllByRole('listitem')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'All' }));
    // Jordan has two conversations here (the desk booking, pinned, and the muted direct one): the muted row's menu.
    const mutedRow = screen.getByRole('img', { name: 'Muted' }).closest('li')!;
    await user.click(within(mutedRow).getByRole('button', { name: /^Quick actions for your conversation with/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Pin to top' }));
    await waitFor(() => expect(handlers.onFlag).toHaveBeenCalledExactlyOnceWith(muted.id, { flag: 'pinned', on: true }));
  });
});

describe('a conversation’s menu, search and request', () => {
  const handlers: ThreadHandlers = {
    ...fakeThreadHandlers,
    onFlag: vi.fn(fakeHandler<ConversationFlagInput>({ ok: true, code: 'updated' }, 0)),
    onAccept: vi.fn(async (): Promise<ActionResult> => ({ ok: true, code: 'updated' })),
    onSearch: vi.fn(async (query: string) => ({ query, hits: [{ id: 'msg_hit', sender: 'them' as const, segments: [{ kind: 'text' as const, text: 'The desk is in the garage' }], createdAt: now }], more: false })),
  };

  it('searches the conversation and jumps to a result', async () => {
    const user = userEvent.setup();
    const onJump = vi.fn();
    wrap(<ConversationMenu thread={requestThreadPageData.thread} handlers={handlers} name="Sam R." onJump={onJump} now={now} />);
    await user.click(screen.getByRole('button', { name: 'Options for your conversation with Sam R.' }));
    await user.click(screen.getByRole('menuitem', { name: 'Search in conversation' }));
    const dialog = await screen.findByRole('dialog', { name: 'Search your messages with Sam R.' });
    await user.type(within(dialog).getByRole('searchbox', { name: 'Search this conversation' }), 'desk');
    await user.click(within(dialog).getByRole('button', { name: 'Search' }));
    expect(handlers.onSearch).toHaveBeenCalledWith('desk');
    const result = await within(dialog).findByRole('button', { name: /The desk is in the garage/ });
    expect(within(result).getByText('desk', { selector: 'mark' })).toBeInTheDocument();
    await user.click(result);
    expect(onJump).toHaveBeenCalledExactlyOnceWith('msg_hit');
  });

  it('accepts, ignores or blocks a message request', async () => {
    const user = userEvent.setup();
    const onBlock = vi.fn(fakeHandler<{ blocked: boolean }>({ ok: true, code: 'updated' }, 0));
    const onIgnored = vi.fn();
    wrap(<RequestBanner thread={requestThreadPageData.thread} name="Sam" handlers={handlers} onBlock={onBlock} onIgnored={onIgnored} />);
    expect(screen.getByText('Sam wants to message you')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(handlers.onAccept).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('button', { name: 'Ignore' }));
    await waitFor(() => expect(onIgnored).toHaveBeenCalledTimes(1));
    expect(handlers.onFlag).toHaveBeenCalledWith({ flag: 'archived', on: true });
    await user.click(screen.getByRole('button', { name: 'Block' }));
    await waitFor(() => expect(onBlock).toHaveBeenCalledExactlyOnceWith({ blocked: true }));
  });

  it('shows nothing for a conversation that isn’t a request', () => {
    wrap(<RequestBanner thread={{ ...requestThreadPageData.thread, request: false }} name="Sam" handlers={handlers} />);
    expect(screen.queryByText('Sam wants to message you')).toBeNull();
  });
});

describe('people by @username, Translate and Suggest replies', () => {
  it('shows a person by name, linking to their profile, and a payment handle stays hidden', () => {
    wrap(<p data-testid="message"><MaskedText segments={mentionMessage} /></p>);
    const link = screen.getByRole('link', { name: '@Jordan T.' });
    expect(link).toHaveAttribute('href', routes.helperProfile('jordan-t'));
    expect(screen.getByTestId('message')).not.toHaveTextContent('@jordan');
    cleanup();
    // In a conversation's row (a link already): the name, no link inside.
    wrap(<MaskedText segments={mentionMessage} links={false} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('@Jordan T.')).toBeInTheDocument();
  });

  it('translates the other person’s message under it, and shows the original again', async () => {
    const user = userEvent.setup();
    const onTranslate = vi.fn(async () => ({ text: 'Hola Maya' }));
    wrap(<ReplyProvider><MessageLog messages={requestThreadPageData.messages} otherParty={requestThreadPageData.thread.otherParty} now={now} onTranslate={onTranslate} /></ReplyProvider>);
    await user.click(screen.getByRole('button', { name: 'Translate' }));
    expect(await screen.findByText('Hola Maya')).toBeInTheDocument();
    expect(onTranslate).toHaveBeenCalledExactlyOnceWith('msg_r1');
    await user.click(screen.getByRole('button', { name: 'Show original' }));
    expect(screen.queryByText('Hola Maya')).toBeNull();
    // Again: from what it has, no second model call.
    await user.click(screen.getByRole('button', { name: 'Translate' }));
    expect(screen.getByText('Hola Maya')).toBeInTheDocument();
    expect(onTranslate).toHaveBeenCalledTimes(1);
  });

  it('suggests replies when the other person wrote last; a tap puts one in the box, nothing is sent', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(fakeHandler<SendMessageInput>({ ok: true, code: 'sent' }, 0));
    const onSuggest = vi.fn(async () => ({ replies: ['Sounds good to me!', 'What day works best?'] }));
    wrap(<ReplyProvider><MessageComposerContent rules={requestThreadPageData.composer} handlers={{ ...fakeThreadHandlers, onSend, onSuggest }} suggestFor="msg_r1" /></ReplyProvider>);
    await user.click(screen.getByRole('button', { name: 'Suggest replies' }));
    await user.click(await screen.findByRole('button', { name: 'What day works best?' }));
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('What day works best?');
    expect(onSend).not.toHaveBeenCalled();
    // No suggestions for a conversation where the viewer wrote last.
    cleanup();
    wrap(<ReplyProvider><MessageComposerContent rules={requestThreadPageData.composer} handlers={{ ...fakeThreadHandlers, onSuggest }} /></ReplyProvider>);
    expect(screen.queryByRole('button', { name: 'Suggest replies' })).toBeNull();
  });
});

describe('cards in a conversation', () => {
  it('lets the helper accept a task request right there', async () => {
    const user = userEvent.setup();
    const card = requestCardForHelperPageData.cards!.requests!.inv_desk_direct!;
    const onAccept = vi.fn(fakeHandler<{ inviteId: string }>({ ok: true, code: 'booked' }, 0));
    const onDone = vi.fn();
    wrap(<TaskRequestCardView card={card} name="Maya" handlers={{ onAccept, onDecline: vi.fn(), onCancel: vi.fn() }} onDone={onDone} createdAt={now} />);
    expect(screen.getByRole('article', { name: 'Task request: Assemble a standing desk' })).toHaveTextContent('$80');
    expect(screen.getByText('Waiting for you')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(onAccept).toHaveBeenCalledExactlyOnceWith({ inviteId: 'inv_desk_direct' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('shows a booking change with what changes and the way to answer it', () => {
    const card = changeCardThreadPageData.cards!.changes!.chg_desk_later!;
    wrap(<ChangeCardView card={card} name="Jordan" createdAt={now} />);
    expect(screen.getByText('Jordan proposed a change')).toBeInTheDocument();
    expect(screen.getByText('The client pays $15.00 more.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review and answer' })).toHaveAttribute('href', routes.app.bookingChange('bkg_desk', 'chg_desk_later'));
  });
});
