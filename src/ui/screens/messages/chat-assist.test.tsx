/** @vitest-environment jsdom */
import type React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { CatchUpInput, ConversationSummary, MessageTranslations, MessageView, ThreadPageData, TranslateManyInput } from '@/contracts';
import { luciaCatchUpSummary, luciaReadThreadPageData, luciaThreadPageData, translationsFor } from '@/fixtures';
import messages from '../../../../messages/en/ui';
import { ConversationMenu } from '@/ui/components/messaging/conversation-tools';
import { ChatAssistProvider, type ChatAssistSeed } from './chat-assist';
import { MessageLog } from './message-log';
import { ReplyProvider } from './reply-context';

/** "Translate this conversation" and "Catch me up" (2026-11-24, owner: "implement others all one by one"). */

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});
const now = '2026-11-21T15:30:00.000Z';
const wrap = (node: React.ReactNode) => render(<NextIntlClientProvider locale="en" timeZone="America/New_York" messages={messages}>{node}</NextIntlClientProvider>);

type Handlers = {
  onTranslateMany?: (input: TranslateManyInput) => Promise<MessageTranslations | null>;
  onCatchUp?: (input: CatchUpInput) => Promise<ConversationSummary | null>;
};

/** A conversation as the page shows it: the ⋯ menu above, the messages below, one provider around both. */
function conversation(data: ThreadPageData, handlers: Handlers, initial?: ChatAssistSeed) {
  const { thread } = data;
  return <ChatAssistProvider threadId={thread.id} otherId={thread.otherParty.id} offered={data.assist} {...(data.assist?.language ? { language: data.assist.language } : {})}
    {...(data.firstUnreadId ? { firstUnreadId: data.firstUnreadId } : {})} {...(data.catchUp ? { catchUp: data.catchUp } : {})} {...handlers} {...(initial ? { initial } : {})}>
    <ConversationMenu thread={thread} handlers={{}} name={thread.otherParty.displayName} now={now} />
    <ReplyProvider><MessageLog messages={data.messages} otherParty={thread.otherParty} now={now} firstUnreadId={data.firstUnreadId} canReply /></ReplyProvider>
  </ChatAssistProvider>;
}

const withThread = (data: ThreadPageData, id: string): ThreadPageData => ({ ...data, thread: { ...data.thread, id } });
const openMenu = async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Options for your conversation with Lucía M.' }));

describe('Translate this conversation', () => {
  it('translates the other person’s messages when turned on from the menu, shows the original on request, and remembers it in this browser', async () => {
    const user = userEvent.setup();
    const data = withThread(luciaReadThreadPageData, 'thr_assist_1');
    const onTranslateMany = vi.fn(async (input: TranslateManyInput) => translationsFor(input.messageIds));
    wrap(conversation(data, { onTranslateMany }));
    expect(onTranslateMany).not.toHaveBeenCalled();
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Translate this conversation' }));

    expect(await screen.findByText('Is there parking near your place?')).toBeInTheDocument();
    expect(screen.getByText('Showing Lucía’s messages in English')).toBeInTheDocument();
    // One request for Lucía's ten messages, never Maya's own.
    expect(onTranslateMany).toHaveBeenCalledTimes(1);
    const asked = onTranslateMany.mock.calls[0]![0].messageIds;
    expect(asked).toHaveLength(10);
    expect(asked).not.toContain('msg_lu1');
    // Her hidden number stays hidden in the translation.
    expect(screen.getByText('My number is [hidden] just in case.')).toBeInTheDocument();
    // The thumbs-up had nothing to translate: no note under it.
    const thumbs = document.querySelector('[data-message-id="msg_lu12"]')!;
    expect(within(thumbs as HTMLElement).queryByRole('button', { name: 'Show original' })).toBeNull();

    const bubble = document.querySelector<HTMLElement>('[data-message-id="msg_lu7"]')!;
    await user.click(within(bubble).getByRole('button', { name: 'Show original' }));
    expect(within(bubble).getByText('¿Hay estacionamiento cerca de tu casa?')).toBeInTheDocument();
    await user.click(within(bubble).getByRole('button', { name: 'Show translation' }));
    expect(within(bubble).getByText('Is there parking near your place?')).toBeInTheDocument();
    expect(window.localStorage.getItem('tnm.chat.translate.thr_assist_1.usr_lucia_m')).toBe('1');

    // Opened again in this visit: still on, and the translations come from memory, not another request.
    cleanup();
    wrap(conversation(data, { onTranslateMany }));
    expect(await screen.findByText('Is there parking near your place?')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(onTranslateMany).toHaveBeenCalledTimes(1);

    // Turned off from the bar: the originals, and forgotten.
    await user.click(screen.getByRole('button', { name: 'Turn off' }));
    expect(screen.getByText('¿Hay estacionamiento cerca de tu casa?')).toBeInTheDocument();
    expect(screen.queryByText('Is there parking near your place?')).toBeNull();
    expect(window.localStorage.getItem('tnm.chat.translate.thr_assist_1.usr_lucia_m')).toBeNull();
  });

  it('asks at most twenty messages at a time, newest first', async () => {
    const many: MessageView[] = Array.from({ length: 25 }, (_, index) => ({ id: `msg_many_${index}`, sender: 'them', kind: 'text', segments: [{ kind: 'text', text: `Mensaje número ${index}, gracias.` }], attachments: [], createdAt: `2026-11-21T14:${String(index).padStart(2, '0')}:00.000Z` }));
    const data: ThreadPageData = { ...withThread(luciaReadThreadPageData, 'thr_assist_2'), messages: many };
    const onTranslateMany = vi.fn(async (input: TranslateManyInput): Promise<MessageTranslations> => ({ texts: Object.fromEntries(input.messageIds.map((id) => [id, `In English: ${id}`])), same: [] }));
    wrap(conversation(data, { onTranslateMany }, { translating: true }));
    await waitFor(() => expect(onTranslateMany).toHaveBeenCalledTimes(2));
    const [first, second] = onTranslateMany.mock.calls.map((call) => call[0].messageIds);
    expect(first).toHaveLength(20);
    expect(first![0]).toBe('msg_many_24');
    expect(second).toHaveLength(5);
    expect(await screen.findByText('In English: msg_many_0')).toBeInTheDocument();
  });

  it('pauses when translations aren’t available now, and tries again on request', async () => {
    const user = userEvent.setup();
    const data = withThread(luciaReadThreadPageData, 'thr_assist_3');
    const onTranslateMany = vi.fn(async (input: TranslateManyInput): Promise<MessageTranslations | null> => (onTranslateMany.mock.calls.length === 1 ? null : translationsFor(input.messageIds)));
    wrap(conversation(data, { onTranslateMany }, { translating: true }));
    expect(await screen.findByText('Translation is paused for now. Try again in a little while.')).toBeInTheDocument();
    expect(screen.getByText('¿Hay estacionamiento cerca de tu casa?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Is there parking near your place?')).toBeInTheDocument();
    expect(onTranslateMany).toHaveBeenCalledTimes(2);
  });

  it('isn’t in the menu where the server doesn’t offer it', async () => {
    const user = userEvent.setup();
    const data: ThreadPageData = { ...withThread(luciaReadThreadPageData, 'thr_assist_4'), assist: { translate: false, suggest: false, summarize: true, language: 'en' } };
    wrap(conversation(data, { onTranslateMany: vi.fn(), onCatchUp: vi.fn() }));
    await openMenu(user);
    expect(screen.queryByRole('menuitem', { name: 'Translate this conversation' })).toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Catch me up' })).toBeInTheDocument();
  });
});

describe('Catch me up', () => {
  it('is offered above “New messages” when many were unread, and summarizes from the first unread one', async () => {
    const user = userEvent.setup();
    const data = withThread(luciaThreadPageData, 'thr_assist_5');
    const onCatchUp = vi.fn(async (_input: CatchUpInput) => luciaCatchUpSummary);
    wrap(conversation(data, { onCatchUp }));
    const card = screen.getByRole('region', { name: 'Catch-up summary' });
    expect(card).toHaveTextContent('Lucía sent you 9 new messages. Want a quick summary first?');
    // Above the line, not after it.
    const line = screen.getByText('New messages');
    expect(card.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(onCatchUp).not.toHaveBeenCalled();

    await user.click(within(card).getByRole('button', { name: 'Summarize' }));
    expect(onCatchUp).toHaveBeenCalledExactlyOnceWith({ fromId: 'msg_lu4' });
    const ready = await screen.findByText('Lucía will arrive at 10 on Saturday with a dolly and straps.');
    const summary = ready.closest('section')!;
    expect(summary).toHaveTextContent('AI summary, may be wrong');
    expect(summary).toHaveTextContent(/9 messages, .*10:00.*10:20/);

    await user.click(within(summary).getByRole('button', { name: 'Dismiss the summary' }));
    expect(screen.queryByRole('region', { name: 'Catch-up summary' })).toBeNull();
  });

  it('asks from the menu with nothing unread: the latest messages, after them; a failure offers Try again', async () => {
    const user = userEvent.setup();
    const data = withThread(luciaReadThreadPageData, 'thr_assist_6');
    const onCatchUp = vi.fn(async (_input: CatchUpInput): Promise<ConversationSummary | null> => (onCatchUp.mock.calls.length === 1 ? null : luciaCatchUpSummary));
    wrap(conversation(data, { onCatchUp }));
    expect(screen.queryByRole('region', { name: 'Catch-up summary' })).toBeNull();
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Catch me up' }));
    expect(onCatchUp).toHaveBeenCalledWith({});
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t make a summary right now.');
    // After the latest messages: the log's last thing.
    const log = screen.getByRole('log');
    expect(log.lastElementChild?.querySelector('[data-catch-up="failed"]')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('She offered to carry the boxes to the garage too.')).toBeInTheDocument();
  });

  it('shows the seeded states: reading, and the summary', () => {
    const data = withThread(luciaThreadPageData, 'thr_assist_7');
    wrap(conversation(data, { onCatchUp: vi.fn() }, { catchUp: { status: 'loading' } }));
    expect(screen.getByRole('region', { name: 'Catch-up summary' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Reading what you missed…')).toBeInTheDocument();
  });
});
