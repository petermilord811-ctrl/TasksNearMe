import {
  ACTION_ERROR_CODES, routes,
  type ActionResult, type AppShellHandlers, type InboxPageData, type PreviewEntry, type ThreadHandlers, type ThreadPageData,
} from '@/contracts';
import {
  blockedThreadPageData, closedThreadPageData, deskBookingThreadPageData, deskOfferThreadPageData, directThreadAwaitingReplyData, directThreadPageData, earlierThreadPageData, expiredOfferThreadPageData,
  luciaCatchUpSummary, luciaReadThreadPageData, luciaThreadPageData, luciaTranslations,
  mayaInboxWithDirectData, plusMenuForHelperPageData, plusMenuThreadPageData, changeCardThreadPageData, fakeConversationHandlers, mayaFoldersInboxData, requestCardForHelperPageData, requestCardThreadPageData, requestThreadPageData, sampleThreadPageData,
  fakeGifHandlers, fakeHandler, fakeThreadHandlers, gifPanelStates, gifThreadPageData, inboxEmptyData, jordanInboxPageData, jordanShell, mayaInboxPageData,
  mayaShell, movingOfferThreadForHelper, taskCanceledOfferThreadPageData, taskCanceledThreadForHelperPageData,
} from '@/fixtures';
import { InboxScreen } from '@/ui/screens/messages';
import type { ChatAssistSeed } from '@/ui/screens/messages/chat-assist';
import { ThreadContent, ThreadScreen } from '@/ui/screens/messages/thread-screen';
import { GifPickerPanel } from '@/ui/screens/messages/gif-picker';
import { AppShell } from '@/ui/shells/app-shell';
import inboxCopy from '../../../messages/en/ui/inbox.json';
import threadCopy from '../../../messages/en/ui/thread.json';

const now = '2026-11-21T16:05:00.000Z';
const beforeBooking = '2026-11-17T15:00:00.000Z';
/** Just after Lucía's last message (2026-11-24 previews). */
const luciaNow = '2026-11-21T15:30:00.000Z';
const shellHandlers: AppShellHandlers = {
  onModeChange: fakeHandler({ ok: true, code: 'updated' }),
  onSignOut: fakeHandler({ ok: true, code: 'updated' }),
};

function inboxPreview(id: keyof typeof inboxCopy.previews, data: InboxPageData, viewer = mayaShell): PreviewEntry {
  return {
    id: `screen-inbox/${id}`, group: inboxCopy.previews.group, title: inboxCopy.previews[id], layout: 'fullscreen',
    render: () => <AppShell viewer={viewer} handlers={shellHandlers} currentPath={routes.app.messages()}><InboxScreen data={data} now={now} /></AppShell>,
  };
}

function threadPreview(id: string, title: string, data: ThreadPageData, options: {
  result?: ActionResult; pending?: boolean; helper?: boolean; suggestions?: string[]; gifs?: boolean;
  /** "Translate this conversation" and "Catch me up" (2026-11-24), and the time the preview reads as now. */
  assist?: ChatAssistSeed; now?: string;
} = {}): PreviewEntry {
  const handlers: ThreadHandlers = {
    ...fakeThreadHandlers,
    ...fakeConversationHandlers,
    ...(options.gifs ? fakeGifHandlers : {}),
    onSend: fakeHandler(options.result ?? { ok: true, code: 'sent' }, options.pending ? 60_000 : 400),
  };
  return {
    id: `screen-thread/${id}`, group: threadCopy.previews.group, title, layout: 'fullscreen',
    render: () => <AppShell viewer={options.helper ? jordanShell : mayaShell} handlers={shellHandlers} currentPath={routes.app.thread(data.thread.id)} layout="flow">
      <ThreadContent data={data} handlers={handlers} now={options.now ?? (data.thread.contactMasking ? beforeBooking : now)} {...(options.assist ? { assistState: options.assist } : {})} composerState={{
        initialResult: options.result, initialPending: options.pending,
        initialBody: options.pending || (options.result && !options.result.ok) ? threadCopy.previews.draft : undefined,
        ...(options.suggestions ? { initialSuggestions: options.suggestions } : {}),
      }} />
    </AppShell>,
  };
}

// GIFs in chat (2026-11-24): the picker's states, as its popover (wide screens) or sheet (phones) shows them.
const gifPanelTitles: Record<keyof typeof gifPanelStates, string> = {
  loading: 'GIF picker: loading', trending: 'GIF picker: trending GIFs first', results: 'GIF picker: a search, with Load more',
  empty: 'GIF picker: nothing found', error: 'GIF picker: GIFs didn\u2019t load, with Try again', rateLimited: 'GIF picker: too many searches this minute',
};
function gifPanelPreview(state: keyof typeof gifPanelStates): PreviewEntry {
  return {
    id: `gif-picker/${state === 'rateLimited' ? 'rate-limited' : state}`, group: threadCopy.previews.group, title: gifPanelTitles[state],
    render: () => <div className="w-[22rem] max-w-full rounded-xl border bg-popover p-3 text-popover-foreground shadow-md">
      <GifPickerPanel seed={gifPanelStates[state]} onSearch={fakeGifHandlers.onSearchGifs} onPick={() => undefined} />
    </div>,
  };
}

export const messagesScreenPreviews: PreviewEntry[] = [
  threadPreview('gif', 'A GIF in the conversation (a still with Play GIF under reduced motion), and the GIF button beside the paperclip', gifThreadPageData, { gifs: true }),
  ...(['trending', 'results', 'loading', 'empty', 'error', 'rateLimited'] as const).map(gifPanelPreview),
  inboxPreview('client', mayaInboxPageData),
  inboxPreview('helper', jordanInboxPageData, jordanShell),
  inboxPreview('empty', inboxEmptyData),
  inboxPreview('kinds', { threads: [
    { ...deskOfferThreadPageData.thread, id: 'preview-request', kind: 'invite' },
    { ...deskBookingThreadPageData.thread, id: 'preview-support', kind: 'case' },
    { ...movingOfferThreadForHelper, lastMessage: undefined },
  ] }),
  // Direct conversations (2026-11-21): in the inbox, a first message with two more allowed, and waiting on a reply.
  {
    id: 'screen-inbox/direct', group: inboxCopy.previews.group, title: 'Inbox with a direct conversation', layout: 'fullscreen',
    render: () => <AppShell viewer={mayaShell} handlers={shellHandlers} currentPath={routes.app.messages()}><InboxScreen data={mayaInboxWithDirectData} now={now} /></AppShell>,
  },
  threadPreview('direct', 'Direct conversation: the first message, two more until a reply', directThreadPageData),
  // The chat, 2026-11-23: a message request with a person named by @username, a sample profile, the cards, suggestions.
  {
    id: 'screen-inbox/folders', group: inboxCopy.previews.group, title: 'Inbox: a pinned, a muted and an archived conversation, and a message request', layout: 'fullscreen',
    render: () => <AppShell viewer={mayaShell} handlers={shellHandlers} currentPath={routes.app.messages()}><InboxScreen data={mayaFoldersInboxData} now={now} handlers={{ onFlag: fakeHandler({ ok: true, code: 'updated' }), onAccept: fakeHandler({ ok: true, code: 'updated' }) }} /></AppShell>,
  },
  threadPreview('request', 'Message request: Accept, Ignore or Block, with a person named by @username', requestThreadPageData),
  threadPreview('sample', 'Direct conversation with a sample profile: the app’s note under the first message', sampleThreadPageData),
  threadPreview('request-card', 'A task request card in the conversation, waiting on the helper (client)', requestCardThreadPageData),
  threadPreview('request-card-helper', 'A task request card the helper accepts or declines in the conversation', requestCardForHelperPageData, { helper: true }),
  threadPreview('change-card', 'A booking change card in the booking’s conversation, with Propose a change', changeCardThreadPageData),
  threadPreview('plus-menu', 'A direct conversation with a helper: the "+" and an "asked for an offer" card (client)', plusMenuThreadPageData),
  threadPreview('plus-menu-helper', 'The same ask as the helper sees it: Make an offer, and the client\u2019s open tasks in the "+"', plusMenuForHelperPageData, { helper: true }),
  threadPreview('suggestions', 'Suggested replies above the composer', requestThreadPageData, { suggestions: ['Sounds good to me!', 'What day and time work best for you?', 'Let me check and get back to you today.'] }),
  threadPreview('direct-awaiting-reply', 'Direct conversation: three sent, waiting on a reply', directThreadAwaitingReplyData),
  threadPreview('booking', threadCopy.previews.booking, deskBookingThreadPageData),
  // A long conversation: "Load earlier messages" above its latest 100 (sweep MN11).
  threadPreview('earlier', threadCopy.previews.earlier, earlierThreadPageData),
  threadPreview('offer-masked', threadCopy.previews['offer-masked'], deskOfferThreadPageData),
  threadPreview('closed', threadCopy.previews.closed, closedThreadPageData),
  threadPreview('closed-expired', threadCopy.previews.closedExpired, expiredOfferThreadPageData),
  // The task was canceled while the offer was open (sweep D9): both sides say so, neither "declined" nor "chose another".
  threadPreview('closed-task-canceled', threadCopy.previews.closedTaskCanceled, taskCanceledOfferThreadPageData),
  threadPreview('closed-task-canceled-helper', threadCopy.previews.closedTaskCanceledHelper, taskCanceledThreadForHelperPageData, { helper: true }),
  threadPreview('blocked', threadCopy.previews.blocked, blockedThreadPageData),
  // Quote-replies, reactions and saved replies (completion plan 7.3).
  threadPreview('replies-reactions', threadCopy.previews.repliesReactions, {
    ...deskBookingThreadPageData,
    messages: deskBookingThreadPageData.messages.map((message, index, all) => {
      const firstText = all.find((candidate) => candidate.kind === 'text' && candidate.sender === 'me');
      if (message.kind !== 'text') return message;
      if (message.sender === 'them' && firstText) return { ...message, replyTo: { id: firstText.id, sender: 'me' as const, segments: firstText.segments }, reactions: [{ emoji: 'thumbs_up' as const, count: 1, mine: true }] };
      return { ...message, reactions: [{ emoji: 'heart' as const, count: 1, mine: false }] };
    }),
    savedReplies: [
      { id: 'srp_on_my_way', title: 'On my way', body: 'Hi {first_name}, I am on my way for {task}. See you soon!' },
      { id: 'srp_tools', title: 'What I bring', body: 'I bring my own drill and level, so there is nothing to have ready.' },
    ],
  }),
  // Wide screens: the conversations beside the open one, with "New messages" above what arrived since last time (7.3).
  {
    id: 'screen-thread/with-list', group: threadCopy.previews.group, title: threadCopy.previews.withList, layout: 'fullscreen',
    render: () => <AppShell viewer={mayaShell} handlers={shellHandlers} currentPath={routes.app.thread(deskOfferThreadPageData.thread.id)} layout="flow">
      <ThreadScreen data={{ ...deskOfferThreadPageData, firstUnreadId: deskOfferThreadPageData.messages.find((message) => message.kind === 'text')?.id }} handlers={fakeThreadHandlers} now={beforeBooking} inbox={mayaInboxPageData.threads.map((thread, index) => (index === 0 ? { ...thread, unreadCount: 2 } : thread))} />
    </AppShell>,
  },
  threadPreview('helper', threadCopy.previews.helper, {
    ...deskOfferThreadPageData,
    thread: movingOfferThreadForHelper,
    messages: [{ id: 'preview-helper-message', sender: 'me', kind: 'text', segments: movingOfferThreadForHelper.lastMessage!.preview, attachments: [], createdAt: movingOfferThreadForHelper.lastMessage!.createdAt }],
  }, { helper: true }),
  threadPreview('empty', threadCopy.previews.empty, { ...deskBookingThreadPageData, messages: [] }),
  // The whole conversation translated, and "Catch me up" as it's offered, read, answered and failed (2026-11-24).
  threadPreview('translated', threadCopy.previews.translated, luciaReadThreadPageData, { now: luciaNow, assist: { translating: true, translations: luciaTranslations } }),
  threadPreview('catch-up-offered', threadCopy.previews.catchUpOffered, luciaThreadPageData, { now: luciaNow }),
  threadPreview('catch-up-loading', threadCopy.previews.catchUpLoading, luciaThreadPageData, { now: luciaNow, assist: { catchUp: { status: 'loading' } } }),
  threadPreview('catch-up-ready', threadCopy.previews.catchUpReady, luciaThreadPageData, { now: luciaNow, assist: { catchUp: { status: 'ready', summary: luciaCatchUpSummary } } }),
  threadPreview('catch-up-failed', threadCopy.previews.catchUpFailed, luciaThreadPageData, { now: luciaNow, assist: { catchUp: { status: 'failed' } } }),
  threadPreview('sending', threadCopy.previews.sending, deskBookingThreadPageData, { pending: true }),
  threadPreview('result-sent', threadCopy.previews.sent, deskBookingThreadPageData, { result: { ok: true, code: 'sent' } }),
  ...ACTION_ERROR_CODES.map((code) => threadPreview(`result-${code.replaceAll('_', '-')}`, threadCopy.previews.results[code], deskBookingThreadPageData, {
    result: { ok: false, code,
      ...(code === 'validation_failed' ? { fieldErrors: { body: ['required' as const] } } : {}),
      ...(code === 'rate_limited' ? { retryAt: '2026-11-21T16:10:00.000Z' } : {}),
    },
  })),
];
