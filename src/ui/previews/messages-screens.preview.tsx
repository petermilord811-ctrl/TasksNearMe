import {
  ACTION_ERROR_CODES, routes,
  type ActionResult, type AppShellHandlers, type InboxPageData, type PreviewEntry, type ThreadHandlers, type ThreadPageData,
} from '@/contracts';
import {
  blockedThreadPageData, closedThreadPageData, deskBookingThreadPageData, deskOfferThreadPageData,
  fakeHandler, fakeThreadHandlers, inboxEmptyData, jordanInboxPageData, jordanShell, mayaInboxPageData,
  mayaShell, movingOfferThreadForHelper,
} from '@/fixtures';
import { InboxScreen } from '@/ui/screens/messages';
import { ThreadContent } from '@/ui/screens/messages/thread-screen';
import { AppShell } from '@/ui/shells/app-shell';
import inboxCopy from '../../../messages/en/ui/inbox.json';
import threadCopy from '../../../messages/en/ui/thread.json';

const now = '2026-11-21T16:05:00.000Z';
const beforeBooking = '2026-11-17T15:00:00.000Z';
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
  result?: ActionResult; pending?: boolean; helper?: boolean;
} = {}): PreviewEntry {
  const handlers: ThreadHandlers = {
    ...fakeThreadHandlers,
    onSend: fakeHandler(options.result ?? { ok: true, code: 'sent' }, options.pending ? 60_000 : 400),
  };
  return {
    id: `screen-thread/${id}`, group: threadCopy.previews.group, title, layout: 'fullscreen',
    render: () => <AppShell viewer={options.helper ? jordanShell : mayaShell} handlers={shellHandlers} currentPath={routes.app.thread(data.thread.id)} layout="flow">
      <ThreadContent data={data} handlers={handlers} now={data.thread.contactMasking ? beforeBooking : now} composerState={{
        initialResult: options.result, initialPending: options.pending,
        initialBody: options.pending || (options.result && !options.result.ok) ? threadCopy.previews.draft : undefined,
      }} />
    </AppShell>,
  };
}

export const messagesScreenPreviews: PreviewEntry[] = [
  inboxPreview('client', mayaInboxPageData),
  inboxPreview('helper', jordanInboxPageData, jordanShell),
  inboxPreview('empty', inboxEmptyData),
  inboxPreview('kinds', { threads: [
    { ...deskOfferThreadPageData.thread, id: 'preview-request', kind: 'invite' },
    { ...deskBookingThreadPageData.thread, id: 'preview-support', kind: 'case' },
    { ...movingOfferThreadForHelper, lastMessage: undefined },
  ] }),
  threadPreview('booking', threadCopy.previews.booking, deskBookingThreadPageData),
  threadPreview('offer-masked', threadCopy.previews['offer-masked'], deskOfferThreadPageData),
  threadPreview('closed', threadCopy.previews.closed, closedThreadPageData),
  threadPreview('blocked', threadCopy.previews.blocked, blockedThreadPageData),
  threadPreview('helper', threadCopy.previews.helper, {
    ...deskOfferThreadPageData,
    thread: movingOfferThreadForHelper,
    messages: [{ id: 'preview-helper-message', sender: 'me', kind: 'text', segments: movingOfferThreadForHelper.lastMessage!.preview, attachments: [], createdAt: movingOfferThreadForHelper.lastMessage!.createdAt }],
  }, { helper: true }),
  threadPreview('empty', threadCopy.previews.empty, { ...deskBookingThreadPageData, messages: [] }),
  threadPreview('sending', threadCopy.previews.sending, deskBookingThreadPageData, { pending: true }),
  threadPreview('result-sent', threadCopy.previews.sent, deskBookingThreadPageData, { result: { ok: true, code: 'sent' } }),
  ...ACTION_ERROR_CODES.map((code) => threadPreview(`result-${code.replaceAll('_', '-')}`, threadCopy.previews.results[code], deskBookingThreadPageData, {
    result: { ok: false, code,
      ...(code === 'validation_failed' ? { fieldErrors: { body: ['required' as const] } } : {}),
      ...(code === 'rate_limited' ? { retryAt: '2026-11-21T16:10:00.000Z' } : {}),
    },
  })),
];
