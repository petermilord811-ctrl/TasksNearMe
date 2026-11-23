import type { ReactNode } from 'react';
import { routes, type AppShellHandlers, type AssistantTranscript, type ChatLoad, type ChatThreadData, type ChatView, type DirectChatStart, type HelpChatData, type PreviewEntry } from '@/contracts';
import {
  answeredTranscript,
  chatInboxData,
  chatInboxEmptyData,
  chatThreadData,
  emptyTranscript,
  failedTranscript,
  fakeChatThreadHandlers,
  fakeHandler,
  fakeHelpChatHandlers,
  fakeNewChatHandlers,
  helpChatAssistantData,
  helpChatCaseRepliedData,
  helpChatCaseWaitingData,
  helpChatLiveEndedData,
  helpChatLiveJoinedData,
  helpChatLiveOfflineData,
  helpChatLiveWaitingData,
  helpChatUnavailableData,
  mayaShell,
  newDirectMessageData,
  newDirectMessageSampleData,
  pendingTranscript,
  suggestTranscript,
  urgentTranscript,
} from '@/fixtures';
import { ChatLauncher } from '@/ui/components/messaging/chat-launcher';
import { ChatWindow } from '@/ui/components/messaging/chat-window';
import { HelpChatScreen } from '@/ui/screens/messages/help-chat-screen';
import { AppShell } from '@/ui/shells/app-shell';
import chatCopy from '../../../messages/en/ui/chat.json';

const now = '2026-11-17T16:00:00.000Z';
const copy = chatCopy.help.previews;
const shellHandlers: AppShellHandlers = {
  onModeChange: fakeHandler({ ok: true, code: 'updated' }),
  onSignOut: fakeHandler({ ok: true, code: 'updated' }),
};

/** A page behind the window, so the window reads as docked over the app. */
function Page() {
  return <div className="space-y-4">
    <h1 className="font-heading text-2xl font-bold">Bookings</h1>
    {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-20 rounded-[1.375rem] border border-foreground/[0.07] bg-card shadow-card" />)}
  </div>;
}

function shell(chat: ReactNode, children: ReactNode = <Page />, layout: 'tabs' | 'flow' = 'tabs'): ReactNode {
  return <AppShell viewer={{ ...mayaShell, unreadMessages: 3 }} handlers={shellHandlers} currentPath={routes.app.bookings()} layout={layout} chat={chat}>{children}</AppShell>;
}

function windowPreview(id: string, title: string, options: { view?: ChatView; thread?: ChatLoad<ChatThreadData>; help?: HelpChatData; transcript?: AssistantTranscript; state?: 'open' | 'minimized'; inbox?: ChatLoad<typeof chatInboxData>; start?: ChatLoad<DirectChatStart> }): PreviewEntry {
  const view = options.view ?? { kind: 'list' };
  return {
    id: `chat-window/${id}`,
    group: copy.group,
    title,
    layout: 'fullscreen',
    notes: 'Wide screens only: phones open the Messages page from the button.',
    render: () => shell(<>
      <ChatLauncher unread={3} windowShown onOpen={() => undefined} />
      <ChatWindow
        state={options.state ?? 'open'}
        view={view}
        unread={3}
        inbox={options.inbox ?? { status: 'ready', data: chatInboxData }}
        thread={options.thread ?? { status: 'idle' }}
        help={options.help ? { status: 'ready', data: options.help } : { status: 'idle' }}
        start={options.start ?? { status: 'idle' }}
        transcript={options.transcript ?? emptyTranscript}
        now={now}
        threadHandlers={fakeChatThreadHandlers}
        helpHandlers={fakeHelpChatHandlers}
        newChatHandlers={fakeNewChatHandlers}
        onShow={() => undefined}
        onStarted={() => undefined}
        onMinimize={() => undefined}
        onRestore={() => undefined}
        onClose={() => undefined}
        onRetry={() => undefined}
        onRefreshThread={() => undefined}
        onLoadEarlier={async () => undefined}
        fullPageHref={routes.app.messages()}
        onFullPage={() => undefined}
      />
    </>),
  };
}

function helpPagePreview(id: string, title: string, data: HelpChatData, transcript: AssistantTranscript): PreviewEntry {
  return {
    id: `help-page/${id}`,
    group: copy.group,
    title,
    layout: 'fullscreen',
    render: () => <AppShell viewer={mayaShell} handlers={shellHandlers} currentPath={routes.app.helpChat()} layout="flow">
      <HelpChatScreen data={data} transcript={transcript} handlers={fakeHelpChatHandlers} now={now} />
    </AppShell>,
  };
}

export const chatWindowPreviews: PreviewEntry[] = [
  { id: 'chat-window/launcher', group: copy.group, title: copy.launcher, layout: 'fullscreen', render: () => shell(<ChatLauncher unread={0} windowShown={false} onOpen={() => undefined} />) },
  { id: 'chat-window/launcher-unread', group: copy.group, title: copy.launcherUnread, layout: 'fullscreen', render: () => shell(<ChatLauncher unread={3} windowShown={false} onOpen={() => undefined} />) },
  windowPreview('list', copy.list, {}),
  windowPreview('list-empty', copy.listEmpty, { inbox: { status: 'ready', data: chatInboxEmptyData } }),
  windowPreview('thread', copy.thread, { view: { kind: 'thread', threadId: chatThreadData.data.thread.id }, thread: { status: 'ready', data: chatThreadData } }),
  windowPreview('minimized', copy.minimized, { state: 'minimized', view: { kind: 'thread', threadId: chatThreadData.data.thread.id }, thread: { status: 'ready', data: chatThreadData } }),
  windowPreview('loading', copy.loading, { inbox: { status: 'loading' }, view: { kind: 'thread', threadId: 'thr_loading' }, thread: { status: 'loading' } }),
  windowPreview('failed', copy.failed, { inbox: { status: 'error' } }),
  windowPreview('help-greeting', copy.greeting, { view: { kind: 'help' }, help: helpChatAssistantData }),
  windowPreview('help-answer', copy.answer, { view: { kind: 'help' }, help: helpChatAssistantData, transcript: answeredTranscript }),
  windowPreview('help-suggest', copy.suggest, { view: { kind: 'help' }, help: helpChatAssistantData, transcript: suggestTranscript }),
  windowPreview('help-urgent', copy.urgent, { view: { kind: 'help' }, help: helpChatAssistantData, transcript: urgentTranscript }),
  windowPreview('help-pending', copy.pending, { view: { kind: 'help' }, help: helpChatAssistantData, transcript: pendingTranscript }),
  windowPreview('help-error', copy.error, { view: { kind: 'help' }, help: helpChatAssistantData, transcript: failedTranscript }),
  windowPreview('help-unavailable', copy.unavailable, { view: { kind: 'help' }, help: helpChatUnavailableData }),
  windowPreview('help-waiting', copy.waiting, { view: { kind: 'help' }, help: helpChatCaseWaitingData }),
  windowPreview('help-replied', copy.replied, { view: { kind: 'help' }, help: helpChatCaseRepliedData }),
  windowPreview('help-live-waiting', copy.liveWaiting, { view: { kind: 'help' }, help: helpChatLiveWaitingData }),
  windowPreview('help-live-offline', copy.liveOffline, { view: { kind: 'help' }, help: helpChatLiveOfflineData }),
  windowPreview('help-live-joined', copy.liveJoined, { view: { kind: 'help' }, help: helpChatLiveJoinedData }),
  windowPreview('help-live-ended', copy.liveEnded, { view: { kind: 'help' }, help: helpChatLiveEndedData }),
  // New message in the window (2026-11-23, owner: "I want to do it in live chat box itself").
  windowPreview('new-find', 'Chat window: New message, the @username box and the day’s allowance', { view: { kind: 'new' } }),
  windowPreview('new-compose', 'Chat window: New message to Jordan, the first message', { view: { kind: 'new', to: { userId: newDirectMessageData.recipient.id } }, start: { status: 'ready', data: { kind: 'page', data: newDirectMessageData } } }),
  windowPreview('new-sample', 'Chat window: New message to a sample profile (the live site)', { view: { kind: 'new', to: { username: 'jonah' } }, start: { status: 'ready', data: { kind: 'page', data: newDirectMessageSampleData } } }),
  windowPreview('new-not-found', 'Chat window: New message, a username that’s nobody’s', { view: { kind: 'new', to: { username: 'jordan_tx' } }, start: { status: 'error', notFound: true } }),
  windowPreview('new-loading', 'Chat window: New message, loading the chosen person', { view: { kind: 'new', to: { username: 'jordan' } }, start: { status: 'loading' } }),
  helpPagePreview('answer', `${copy.page}: ${copy.answer}`, helpChatAssistantData, suggestTranscript),
  helpPagePreview('live-waiting', `${copy.page}: ${copy.liveWaiting}`, helpChatLiveWaitingData, emptyTranscript),
  helpPagePreview('live-joined', `${copy.page}: ${copy.liveJoined}`, helpChatLiveJoinedData, emptyTranscript),
  helpPagePreview('replied', `${copy.page}: ${copy.replied}`, helpChatCaseRepliedData, emptyTranscript),
];
